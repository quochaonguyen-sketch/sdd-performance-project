import { deepStrictEqual } from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readOffScheduleHistory, resolveOffScheduleSpreadsheetId } from "../lib/google/off-schedule.ts";
import { offAttendanceStatuses } from "../lib/off-registration/approved-schedule.ts";
import { offShifts } from "../lib/off-registration/model.ts";
import { offReviewKey, readOffReviewRows, type OffReviewKey, type OffReviewDecisionStatus } from "../lib/off-registration/review.ts";
import { offRegistrationSpreadsheetId, readOffRegistrationRows, registrationSheet } from "../lib/off-registration/sheets.ts";
import { createOHArchiveClient } from "../lib/onhold/archive.ts";

nextEnv.loadEnvConfig(process.cwd(), true);
const apply = process.argv.includes("--apply");
const pageSize = 500;
type CalendarKey = { rider_code: string; work_date: string };
type CalendarRow = CalendarKey & { id: string; rider_id: string | null; status: string; raw_data: unknown;
  created_at: string; updated_at: string; shift: string | null; note: string | null };
type QueueRow = CalendarKey & { id: string; state: string };
type OldDecision = OffReviewKey & { status: OffReviewDecisionStatus; manager_note: string; decided_at: string; decided_by: string };
const calendarKey = (row: CalendarKey) => `${row.rider_code}|${row.work_date}`;

async function readAll<T>(db: SupabaseClient, table: string, fields: string, order: string[], optional = false): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    let query = db.from(table).select(fields);
    for (const column of order) query = query.order(column);
    const { data, error } = await query.range(offset, offset + pageSize - 1).abortSignal(AbortSignal.timeout(25_000));
    if (optional && error?.code === "PGRST205") return [];
    if (error) throw Error(`Chưa đọc được ${table} (${error.code}).`);
    rows.push(...data as T[]);
    if (data.length < pageSize) return rows;
  }
}

async function write<T>(rows: T[], save: (batch: T[]) => PromiseLike<{ error: { code: string } | null }>) {
  for (let offset = 0; offset < rows.length; offset += 250) {
    const result = await save(rows.slice(offset, offset + 250));
    if (result.error) throw Error(`Chưa ghi được dữ liệu vào Supabase 2 (${result.error.code}).`);
  }
}

async function main() {
  const primary = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const target = createOHArchiveClient();
  if (!target) throw Error("Cần cấu hình đầy đủ Supabase 2.");
  const registrationId = offRegistrationSpreadsheetId();
  const scheduleId = resolveOffScheduleSpreadsheetId();
  if (!registrationId || !scheduleId) throw Error("Cần cấu hình hai Google Sheet nguồn trước khi chuyển lịch.");
  const { error: schemaError } = await target.from("rider_off_requests").select("request_id").limit(1);
  if (schemaError) throw Error("Cần chạy prisma/rider-schedule-supabase2.sql trên Supabase 2 trước.");

  const [calendar, outbox, decisions, riders, registration, sheet] = await Promise.all([
    readAll<CalendarRow>(primary, "attendance_logs", "*", ["id"]),
    readAll<QueueRow>(primary, "attendance_sheet_sync_outbox", "*", ["id"]),
    readAll<OldDecision>(primary, "rider_off_review_decisions", "request_id,rider_code,work_date,status,manager_note,decided_at,decided_by",
      ["request_id","rider_code","work_date"], true),
    readAll<{ id: string; rider_code: string }>(primary, "riders", "id,rider_code", ["id"]),
    registrationSheet(registrationId).then(readOffRegistrationRows).then(readOffReviewRows),
    readOffScheduleHistory(scheduleId, Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date())),
      AbortSignal.timeout(30_000)),
  ]);
  if (registration.skipped) throw Error(`Có ${registration.skipped} dòng đăng ký OFF sai hoặc trùng. Hãy sửa nguồn trước khi chuyển.`);
  const riderIds = new Map(riders.map(row => [row.rider_code, row.id]));
  const calendarDays = new Map(calendar.map(row => [calendarKey(row), row]));
  const queueKeys = new Set(outbox.filter(row => row.state !== "SYNCED").map(calendarKey));
  const sheetOnly = sheet.rows.filter(row => !calendarDays.has(calendarKey(row)) && !queueKeys.has(calendarKey(row)));
  const oldDecisions = new Map(decisions.map(decision => [offReviewKey(decision), decision]));
  if (decisions.some(decision => !registration.requests.has(offReviewKey(decision)))) {
    throw Error("Có quyết định cũ thiếu dòng đăng ký tương ứng trên Sheet. Chưa chuyển để tránh thiếu dữ liệu.");
  }
  for (const row of sheetOnly) {
    const timestamp = new Date(`${row.work_date}T00:00:00+07:00`).toISOString();
    calendarDays.set(calendarKey(row), { ...row, id: randomUUID(), rider_id: riderIds.get(row.rider_code) ?? null,
      shift: null, note: null, raw_data: { source: "google_sheet_off", spreadsheet_id: scheduleId },
      created_at: timestamp, updated_at: timestamp });
  }

  const requests = [...registration.requests.entries()].map(([key, item]) => {
    const { row: sourceRow, ...request } = item;
    const decision = oldDecisions.get(key);
    const status = decision?.status ?? request.status;
    const existing = calendarDays.get(calendarKey(request));
    const expected = offAttendanceStatuses[request.type as keyof typeof offAttendanceStatuses];
    const alreadyScheduled = status === "Đã duyệt" && request.shift === offShifts.FULL_DAY && existing?.status === expected;
    if (!request.email) console.warn(`Dòng đăng ký ${sourceRow} thiếu email liên hệ.`);
    return { ...request, status, manager_note: decision?.manager_note ?? request.manager_note,
      decided_at: decision?.decided_at ?? (alreadyScheduled ? existing.updated_at : null), decided_by: decision?.decided_by ?? null };
  });
  const copiedCalendar = [...calendarDays.values()];
  if (apply) {
    await write(calendar, rows => target.rpc("restore_attendance_logs", { p_rows: rows }).abortSignal(AbortSignal.timeout(25_000)));
    await write(copiedCalendar.slice(calendar.length), rows => target.rpc("restore_attendance_logs", { p_rows: rows }).abortSignal(AbortSignal.timeout(25_000)));
    await write(outbox, rows => target.from("attendance_sheet_sync_outbox").upsert(rows, { onConflict: "id", ignoreDuplicates: true }).abortSignal(AbortSignal.timeout(25_000)));
    await write(requests, rows => target.from("rider_off_requests").upsert(rows,
      { onConflict: "request_id,rider_code,work_date", ignoreDuplicates: true }).abortSignal(AbortSignal.timeout(25_000)));
  }

  const [targetCalendar, targetOutbox, targetRequests] = await Promise.all([
    readAll<CalendarRow>(target, "attendance_logs", "*", ["id"]),
    readAll<QueueRow>(target, "attendance_sheet_sync_outbox", "*", ["id"]),
    readAll<(typeof requests)[number]>(target, "rider_off_requests", "*", ["request_id","rider_code","work_date"]),
  ]);
  const actualDays = new Map(targetCalendar.map(row => [calendarKey(row), row]));
  const actualRequests = new Map(targetRequests.map(row => [offReviewKey(row), row]));
  const actualOutbox = new Map(targetOutbox.map(row => [row.id, row]));
  let missing = 0;
  const verify = (actual: unknown, expected: unknown) => {
    try { deepStrictEqual(actual, expected); } catch { missing++; }
  };
  for (const row of calendar) verify(actualDays.get(calendarKey(row)), row);
  for (const row of sheetOnly) verify(actualDays.get(calendarKey(row))?.status, row.status);
  for (const row of outbox) verify(actualOutbox.get(row.id), row);
  for (const row of requests) {
    const actual = actualRequests.get(offReviewKey(row));
    // Compare instants because PostgREST normalizes time zone offsets.
    verify(actual && { ...actual, submitted_at: Date.parse(actual.submitted_at), decided_at: actual.decided_at && Date.parse(actual.decided_at) },
      { ...row, submitted_at: Date.parse(row.submitted_at), decided_at: row.decided_at && Date.parse(row.decided_at) });
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "check", primary_calendar: calendar.length, google_calendar_added: sheetOnly.length,
    google_calendar_unrecognized: sheet.skipped, registrations: requests.length, outbox: outbox.length, missing_or_changed: missing }));
  if (missing || sheet.skipped) process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Chuyển dữ liệu lịch rider thất bại.");
  process.exitCode = 1;
});
