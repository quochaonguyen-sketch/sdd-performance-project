import { createHash } from "node:crypto";
import { z } from "zod";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canEditStaff } from "@/lib/auth/page-access";
import { invalidateAttendanceCache } from "@/lib/cache/operations-cache";
import { processAttendanceSheetSync } from "@/lib/google/attendance-sheet-sync";
import { readOffScheduleKeys, resolveOffScheduleSpreadsheetId } from "@/lib/google/off-schedule";
import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { approvedOffCandidates } from "@/lib/off-registration/approved-schedule";
import { offSheetTitle } from "@/lib/off-registration/model";
import { offRegistrationSpreadsheetId, registrationSheet } from "@/lib/off-registration/sheets";
import { createAdminClient } from "@/lib/supabase/admin";

const range = { from: z.iso.date(), to: z.iso.date() };
const inputSchema = z.discriminatedUnion("mode", [
  z.object({ ...range, mode: z.literal("preview") }),
  z.object({ ...range, mode: z.literal("apply"), version: z.string().regex(/^[a-f0-9]{64}$/) }),
]);

function failure(error: string, status: number) {
  return Response.json({ success: false, error }, { status });
}

export async function POST(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) return failure("Bạn cần đăng nhập.", 401);
  if (!canEditStaff(context.profile.role, context.profile.page_access)) return failure("Bạn không có quyền nhập lịch OFF.", 403);

  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return failure("Khoảng ngày không hợp lệ.", 400);
  const { from, to } = input.data;
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (days < 0 || days > 30) return failure("Chọn khoảng tối đa 31 ngày.", 400);
  const spreadsheet = offRegistrationSpreadsheetId();
  if (!spreadsheet) return failure("Máy chủ chưa cấu hình file Đăng ký OFF.", 503);

  try {
    const google = await registrationSheet(spreadsheet);
    const sheet = await google(`/values/${encodeURIComponent(`'${offSheetTitle}'!A1:M`)}?valueRenderOption=UNFORMATTED_VALUE`);
    if (!sheet.ok) return failure("Chưa đọc được tab Đăng ký OFF. Kiểm tra quyền của Google Service Account.", 502);
    const { values } = await sheet.json() as { values?: unknown[][] };
    const { candidates, issues } = approvedOffCandidates(values ?? [], from, to);
    if (candidates.length > 1000) return failure("Khoảng này có quá nhiều lượt OFF. Hãy chia thành các khoảng ngắn hơn.", 400);

    const admin = createAdminClient();
    const codes = [...new Set(candidates.map(row => row.rider_code))];
    const riders = new Map<string, { id: string; full_name: string }>();
    const sheetTarget = resolveOffScheduleSpreadsheetId();
    if (!sheetTarget) return failure("Máy chủ chưa cấu hình Google Sheet lịch OFF.", 503);
    const existingOnSheet = candidates.length
      ? await readOffScheduleKeys(sheetTarget, from, to, AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]))
      : new Set<string>();
    const existing = new Set<string>();
    for (let offset = 0; offset < codes.length; offset += 25) {
      const batch = codes.slice(offset, offset + 25);
      const [roster, logs] = await Promise.all([
        admin.from("riders").select("id,rider_code,full_name").in("kv", OPERATING_AREAS).in("rider_code", batch),
        admin.from("attendance_logs").select("rider_code,work_date").in("rider_code", batch).gte("work_date", from).lte("work_date", to),
      ]);
      if (roster.error || logs.error) throw Error("Chưa đối chiếu được rider và lịch hiện có.");
      for (const rider of roster.data ?? []) riders.set(rider.rider_code, rider);
      for (const log of logs.data ?? []) existing.add(`${log.rider_code}|${log.work_date}`);
    }
    const entries = candidates.flatMap(row => {
      const rider = riders.get(row.rider_code);
      if (!rider) {
        issues.push({ row: row.row, reason: `Mã rider ${row.rider_code} ngoài danh sách lịch.` });
        return [];
      }
      const key = `${row.rider_code}|${row.work_date}`;
      if (existing.has(key) || existingOnSheet.has(key)) {
        const location = existing.has(key) ? "web" : "Google Sheet OFF";
        issues.push({ row: row.row, reason: `Rider ${row.rider_code} đã có lịch trên ${location} ngày ${row.work_date}.` });
        return [];
      }
      return [{ ...row, rider_id: rider.id, rider_name: rider.full_name }];
    });
    const version = createHash("sha256").update(JSON.stringify([context.user.id, spreadsheet, from, to, entries])).digest("hex");
    if (input.data.mode === "preview") return Response.json({ success: true, entries, issues, version });
    if (version !== input.data.version) return failure("Yêu cầu hoặc lịch trên web vừa thay đổi. Hãy xem trước lại.", 409);
    if (!entries.length) return failure("Khoảng đã chọn không có lượt OFF mới để nhập.", 400);

    const { data: inserted, error } = await admin.rpc("import_approved_rider_off", { p_rows: entries });
    if (error) throw Error("Chưa lưu được các lượt OFF vào lịch rider.");

    for (const month of new Set(entries.map(row => row.work_date.slice(0, 7)))) invalidateAttendanceCache(month);
    const sheetSync = await processAttendanceSheetSync().catch(() => ({
      success: false, synced: 0, error: "Đã xếp hàng đồng bộ. Chưa ghi được vào Google Sheet.",
    }));
    return Response.json({ success: true, imported: inserted, conflicts: entries.length - Number(inserted), sheet_sync: sheetSync });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Không thể xử lý đăng ký OFF.", 502);
  }
}
