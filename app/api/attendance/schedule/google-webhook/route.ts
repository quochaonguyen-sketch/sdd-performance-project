import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { NextResponse } from "next/server";
import { z } from "zod";
import { invalidateAttendanceCache } from "@/lib/cache/operations-cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAttendanceClient } from "@/lib/attendance/database";
import { scheduleStatuses } from "@/lib/attendance/statuses";
import { resolveOffScheduleSpreadsheetId } from "@/lib/google/off-schedule";

export const dynamic = "force-dynamic";

const dateSchema = z.iso.date();
const statusSchema = z.enum(scheduleStatuses);
const bodySchema = z.object({
  spreadsheet_id: z.string().trim().min(1).max(200),
  records: z.array(z.object({
    rider_code: z.string().trim().min(1).max(100),
    work_date: dateSchema,
    status: statusSchema,
  })).min(1).max(100),
});

export async function POST(request: Request) {
  const secret = process.env.GOOGLE_SHEETS_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-attendance-sheet-secret") !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Dữ liệu Google Sheet không hợp lệ" }, { status: 400 });
  if (parsed.data.spreadsheet_id !== resolveOffScheduleSpreadsheetId()) {
    return NextResponse.json({ success: false, error: "File Google Sheet không khớp với nguồn lịch rider đã cấu hình." }, { status: 409 });
  }

  const recordsByKey = new Map(parsed.data.records.map((item) => [`${item.rider_code}|${item.work_date}`, item]));
  const records = [...recordsByKey.values()];
  const admin = createAdminClient();
  const codes = [...new Set(records.map((item) => item.rider_code))];
  const { data: riders, error: riderError } = await admin.from("riders").select("id,rider_code").in("kv", OPERATING_AREAS).in("rider_code", codes);
  if (riderError) return NextResponse.json({ success: false, error: riderError.message }, { status: 500 });
  const riderIds = new Map((riders ?? []).map((rider) => [rider.rider_code, rider.id]));
  const missingRiderCodes = codes.filter((code) => !riderIds.has(code));

  const updates = records.filter(item => riderIds.has(item.rider_code))
    .map(item => ({ ...item, rider_id: riderIds.get(item.rider_code) }));
  const days = records.map(item => item.work_date).sort();
  const { data, error } = await createAttendanceClient().rpc("import_google_rider_schedule", {
    p_rows: updates, p_seen: [], p_from: days[0], p_to: days.at(-1),
    p_spreadsheet: parsed.data.spreadsheet_id, p_webhook: true,
  });
  if (error || !data) return NextResponse.json({ success: false, error: "Chưa lưu được lịch từ Google Sheet." }, { status: 500 });
  records.forEach((item) => invalidateAttendanceCache(item.work_date.slice(0, 7)));
  await admin.from("activity_logs").insert({
    entity_type: "attendance_schedule",
    action: "google_webhook_synced",
    message: `Received ${data.imported + data.removed} attendance updates from Google Sheet`,
    raw_data: { spreadsheet_id: parsed.data.spreadsheet_id, imported: data.imported, cleared: data.removed, missing_rider_codes: missingRiderCodes },
  });
  return NextResponse.json({ success: true, imported: data.imported, cleared: data.removed, pending: data.pending, missing_rider_codes: missingRiderCodes });
}
