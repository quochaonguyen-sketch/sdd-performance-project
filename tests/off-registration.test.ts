import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { offIdentity, offRegistrationSchema, offSheetHeaders, offSheetTabId, offSheetTitle } from "../lib/off-registration/model.ts";
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
