import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import {
  OFF_SCHEDULE_HEADERS,
  parseOffScheduleDate,
  resolveOffScheduleSpreadsheetId,
  syncScheduleUpdatesToGoogleSheet,
} from "../lib/google/off-schedule.ts";
import { offIdentity, offRegistrationSchema, offSheetHeaders, offSheetTabId, offSheetTitle, offStatuses } from "../lib/off-registration/model.ts";
import { offReviewKey, readOffReviewRows } from "../lib/off-registration/review.ts";
import { writeOffRegistration } from "../lib/off-registration/sheets.ts";

const input = {
  id: "e2cda52a-ce01-4884-a421-c3dca9600ad0", riderCode: "1234", riderName: "Nguyễn Văn A", email: "rider@example.invalid",
  type: "WEEKLY", shift: "MORNING", dates: ["2026-11-16", "2026-11-17"], reason: "=1+2",
} as const;
const request = offRegistrationSchema.parse(input);
const rider = { id: "rider-1234", rider_code: "1234", full_name: input.riderName, kv: "KV1", cot: 1 };

test("validates rider identifiers and real calendar days", () => {
  assert.equal(offIdentity(" NGUYỄN   VĂN A "), "nguyen van a");
  assert.equal(offRegistrationSchema.safeParse({ ...input, riderCode: "%" }).success, false);
  assert.equal(offRegistrationSchema.safeParse({ ...input, dates: ["2026-02-30"] }).success, false);
});

test("reads Google Sheet OFF dates from serials and existing text formats", () => {
  const serial = Date.parse("2026-11-17") / 86_400_000 + 25_569;
  assert.equal(parseOffScheduleDate(serial), "2026-11-17");
  assert.equal(parseOffScheduleDate(serial + 0.75), "2026-11-17");
  assert.equal(parseOffScheduleDate("17/11/2026"), "2026-11-17");
  assert.equal(parseOffScheduleDate("17/11", 2025), "2025-11-17");
  assert.equal(parseOffScheduleDate("2026-11-17"), "2026-11-17");
  assert.equal(parseOffScheduleDate("#N/A"), null);
  assert.equal(parseOffScheduleDate(Infinity), null);
});

test("attendance uses only the configured spreadsheet", t => {
  const previous = process.env.OFF_SCHEDULE_SPREADSHEET_ID;
  t.after(() => {
    if (previous === undefined) delete process.env.OFF_SCHEDULE_SPREADSHEET_ID;
    else process.env.OFF_SCHEDULE_SPREADSHEET_ID = previous;
  });
  process.env.OFF_SCHEDULE_SPREADSHEET_ID = "";
  assert.equal(resolveOffScheduleSpreadsheetId("legacy-file"), null);
  assert.equal(resolveOffScheduleSpreadsheetId(), null);
  process.env.OFF_SCHEDULE_SPREADSHEET_ID = "rider-schedule-file";
  assert.equal(resolveOffScheduleSpreadsheetId("https://docs.google.com/spreadsheets/d/rider-schedule-file/edit"), "rider-schedule-file");
  assert.throws(() => resolveOffScheduleSpreadsheetId("legacy-file"), /không khớp/);
});

test("sync appends to a new rider workbook and updates the same rider-day on retry", async t => {
  const keys = ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"] as const;
  const previous = keys.map(key => process.env[key]);
  t.after(() => keys.forEach((key, index) => {
    const old = previous[index];
    if (old === undefined) delete process.env[key];
    else process.env[key] = old;
  }));
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "test@example.invalid";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  const stored: unknown[][] = [Array.from(OFF_SCHEDULE_HEADERS)];
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, options?: RequestInit) => {
    const address = String(url);
    if (address.startsWith("https://oauth2.googleapis.com/")) return Response.json({ access_token: "mock" });
    if (address.includes(":append?")) {
      stored.push(...JSON.parse(String(options?.body)).values);
      return Response.json({});
    }
    if (address.endsWith(":batchUpdate")) {
      const { data } = JSON.parse(String(options?.body));
      assert.equal(data[0].range, "'OFF'!A2:D2");
      stored[1] = data[0].values[0];
      return Response.json({});
    }
    assert.equal(options?.method, undefined);
    return Response.json({ values: stored });
  });
  const record = { rider_code: "0012", rider_name: "Rider mẫu", work_date: "2026-11-17", status: "OFF_WEEKLY" } as const;
  assert.equal((await syncScheduleUpdatesToGoogleSheet("test-sheet", [record])).appended, 1);
  assert.equal((await syncScheduleUpdatesToGoogleSheet("test-sheet", [{ ...record, status: "OFF_APPROVED" }])).updated, 1);
  assert.equal(stored.length, 2);
  assert.equal(stored[1][0], "0012");
  assert.equal(parseOffScheduleDate(stored[1][2]), record.work_date);
  assert.equal(stored[1][3], "OFF có xin phép");
});

test("review identifies each rider-day independently and refuses ambiguous sheet rows", () => {
  const row = (date: unknown, status: string = offStatuses[0]) => [
    input.id, 0, date, rider.rider_code, rider.full_name, rider.kv, rider.cot, "OFF tuần", "Cả ngày", "Lý do",
    input.email, status, "Ghi chú",
  ];
  const serial = Date.parse("2026-11-16") / 86_400_000 + 25569;
  const { requests, skipped } = readOffReviewRows([
    offSheetHeaders, row(serial), [], row("17/11/2026", offStatuses[1]),
    row("18/11/2026", "sai trạng thái"), row("18/11/2026"), row("2026-02-30"),
    row("2026-11-19"), row("2026-11-19"),
  ]);
  assert.equal(skipped, 5);
  assert.equal(requests.size, 2);
  const approved = requests.get(offReviewKey({ request_id: input.id.toUpperCase(), rider_code: rider.rider_code, work_date: "2026-11-17" }));
  assert.equal(approved?.row, 4);
  assert.equal(approved?.status, offStatuses[1]);
  assert.equal(approved?.manager_note, "Ghi chú");
  assert.equal(approved?.email, input.email);
});

test("writes an atomic sheet batch and verifies a committed retry without treating text as formulas", async t => {
  const oldEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const oldKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "test@example.invalid";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  t.after(() => {
    if (oldEmail === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL; else process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = oldEmail;
    if (oldKey === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY; else process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = oldKey;
  });

  type SheetCell = { userEnteredValue: { stringValue?: string; numberValue?: number } };
  type BatchRequest = { addNamedRange?: { namedRange: { namedRangeId: string } }; appendCells?: { rows: { values: SheetCell[] }[] } };
  let stored: unknown[][] = [];
  const claims = new Set<string>();
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, options?: RequestInit) => {
    const address = String(url);
    if (address.startsWith("https://oauth2.googleapis.com/")) return Response.json({ access_token: "mock" });
    if (address.includes("?ranges=")) return Response.json({ sheets: [{ properties: { title: offSheetTitle, sheetId: offSheetTabId },
      data: [{ rowData: [{ values: offSheetHeaders.map(stringValue => ({ userEnteredValue: { stringValue } })) }] }] }] });
    if (address.endsWith(":batchUpdate")) {
      const { requests } = JSON.parse(String(options?.body)) as { requests: BatchRequest[] };
      const ids = requests.flatMap(item => item.addNamedRange ? [item.addNamedRange.namedRange.namedRangeId] : []);
      assert.equal(ids.length, 3);
      if (ids.some(id => claims.has(id))) return new Response(null, { status: 400 });
      ids.forEach(id => claims.add(id));
      const append = requests.at(-1)?.appendCells;
      assert.ok(append);
      assert.deepEqual(append.rows[0].values[9].userEnteredValue, { stringValue: "=1+2" });
      stored = append.rows.map(row => row.values.map(({ userEnteredValue }) => userEnteredValue.stringValue ?? userEnteredValue.numberValue));
      throw Error("Connection closed after commit");
    }
    return Response.json({ values: [offSheetHeaders, ...stored] });
  });
  assert.equal(await writeOffRegistration("test-sheet", request, rider), "saved");
  assert.equal(await writeOffRegistration("test-sheet", request, rider), "saved");
  assert.equal(await writeOffRegistration("test-sheet", { ...request, id: crypto.randomUUID() }, rider), "duplicate");
  assert.equal(stored.length, 2);
});
