import { z } from "zod";
import { createAttendanceClient } from "@/lib/attendance/database";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canEditStaff } from "@/lib/auth/page-access";
import { invalidateAttendanceCache } from "@/lib/cache/operations-cache";
import { processAttendanceSheetSync } from "@/lib/google/attendance-sheet-sync";
import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { offStatuses } from "@/lib/off-registration/model";
import { offReviewKeySchema, type OffReviewRequest } from "@/lib/off-registration/review";
import { createAdminClient } from "@/lib/supabase/admin";

const [, approval, rejection] = offStatuses;
const inputSchema = offReviewKeySchema.extend({
  status: z.enum([approval, rejection]),
  manager_note: z.string().trim().max(500),
}).refine(input => input.status !== rejection || !!input.manager_note);

const reply = (body: object, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const failure = (error: string, status: number) => reply({ success: false, error }, status);

async function authorize() {
  const context = await getCurrentUserContext();
  if (!context) return failure("Bạn cần đăng nhập.", 401);
  if (!canEditStaff(context.profile.role, context.profile.page_access)) return failure("Bạn không có quyền duyệt lịch OFF.", 403);
  return context;
}

export async function GET() {
  const context = await authorize();
  if (context instanceof Response) return context;

  try {
    const attendance = createAttendanceClient();
    const pending = attendance.from("attendance_sheet_sync_outbox").select("id", { head: true, count: "exact" })
      .in("state", ["PENDING", "PROCESSING", "FAILED"]).then(result => result);
    const items: OffReviewRequest[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await attendance.from("rider_off_requests")
        .select("request_id,rider_code,work_date,rider_name,area,cot,type,shift,reason,status,manager_note,decided_at")
        .order("work_date").order("rider_code").order("request_id").range(offset, offset + 499);
      if (error) throw Error("Chưa tải được yêu cầu OFF từ Supabase 2.");
      items.push(...data as OffReviewRequest[]);
      if (data.length < 500) break;
    }
    const queue = await pending;
    return reply({ success: true, items, pending_schedule_sync: queue.count ?? 0 });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Chưa tải được yêu cầu OFF.", 502);
  }
}

export async function PATCH(request: Request) {
  const context = await authorize();
  if (context instanceof Response) return context;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure("Kiểm tra yêu cầu và điền lý do nếu từ chối.", 400);
  const input = parsed.data;

  try {
    let riderId: string | null = null;
    if (input.status === approval) {
      const { data, error } = await createAdminClient().from("riders").select("id")
        .in("kv", OPERATING_AREAS).eq("rider_code", input.rider_code).neq("status", "inactive").maybeSingle();
      if (error) throw Error("Chưa đối chiếu được hồ sơ rider.");
      riderId = data?.id ?? null;
    }
    const { data, error } = await createAttendanceClient().rpc("decide_rider_off", {
      p_request_id: input.request_id, p_rider_code: input.rider_code, p_work_date: input.work_date,
      p_status: input.status, p_manager_note: input.manager_note, p_decided_by: context.user.id, p_rider_id: riderId,
    });
    if (error || !data) throw Error("Chưa lưu được quyết định OFF trên Supabase 2.");
    if (data.conflict === "rider") return failure("Rider không còn trong danh sách làm việc.", 409);
    if (data.conflict === "shift") return failure("Lịch rider lưu theo ngày. Kiểm tra loại OFF và ca nghỉ của yêu cầu.", 422);
    if (data.conflict === "schedule") return failure("Rider đã có lịch cho ngày này. Hãy kiểm tra lịch hiện tại.", 409);
    if (data.conflict) return failure("Yêu cầu đã thay đổi. Hãy tải lại danh sách.", 409);

    if (input.status !== approval) return reply({ success: true });
    invalidateAttendanceCache(input.work_date.slice(0, 7));
    const sheetSync = await processAttendanceSheetSync().catch(() => ({ success: false, synced: 0 }));
    return reply({ success: true, sheet_sync: sheetSync });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Chưa xử lý được yêu cầu OFF.", 502);
  }
}
