import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveOffScheduleSpreadsheetId,
  syncScheduleUpdatesToGoogleSheet,
  type GoogleScheduleStatus,
} from "@/lib/google/off-schedule";

type OutboxRow = { id: string; attempts: number };
type Admin = ReturnType<typeof createAdminClient>;
type PendingValue = { rider_code: string; rider_name: string; work_date: string; status: GoogleScheduleStatus };

export type AttendanceSheetSyncResult = {
  success: boolean;
  queued: number;
  synced: number;
  error?: string;
};

const statuses = new Set(["ON", "OFF_WEEKLY", "OFF_APPROVED", "OFF_UNEXPECTED", "WORKING_REST_DAY", "NO_PICKUP", "NO_DELIVERY"]);

export async function withAttendanceSheetWriter<T>(admin: Admin, run: () => Promise<T>): Promise<T | null> {
  const owner = randomUUID();
  const { data, error } = await admin.rpc("acquire_attendance_sheet_writer", { p_owner: owner });
  if (error) throw Error("Chưa khóa được tác vụ ghi Google Sheet.");
  if (!data) return null;
  try {
    return await run();
  } finally {
    await admin.from("attendance_sheet_writer_lease").delete().eq("owner", owner).abortSignal(AbortSignal.timeout(5_000));
  }
}

export async function processAttendanceSheetSync(
  limit = 300,
  sheetUrl?: string | null,
  retryNow = false,
): Promise<AttendanceSheetSyncResult> {
  const admin = createAdminClient();
  const result = await withAttendanceSheetWriter(admin, async () => {
    const now = new Date().toISOString();
    const stale = new Date(Date.now() - 90_000).toISOString();
    const due = retryNow ? "state.in.(PENDING,FAILED)" : `and(state.in.(PENDING,FAILED),next_attempt_at.lte.${now})`;
    const { data, error } = await admin.from("attendance_sheet_sync_outbox").select("id,attempts")
      .or(`${due},and(state.eq.PROCESSING,updated_at.lte.${stale})`)
      .order("created_at").order("id").limit(limit);
    if (error) throw Error("Chưa đọc được hàng đợi lịch OFF.");

    const rows = (data ?? []) as OutboxRow[];
    if (!rows.length) return { success: true, queued: 0, synced: 0 };
    const ids = rows.map(row => row.id);
    const batches = Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) => ids.slice(index * 100, (index + 1) * 100));
    async function updateRows(values: Record<string, unknown>) {
      const results = await Promise.all(batches.map(ids => admin.from("attendance_sheet_sync_outbox").update(values).in("id", ids)));
      if (results.some(result => result.error)) throw Error("Chưa cập nhật được trạng thái hàng đợi.");
    }
    try {
      await updateRows({ state: "PROCESSING", updated_at: now });
      const { data: schedule, error: readError } = await admin.rpc("read_attendance_sheet_queue_values", { p_ids: ids });
      if (readError) throw Error("Chưa đọc được trạng thái mới nhất của lịch rider.");
      const values = ((schedule ?? []) as PendingValue[]).filter(item => statuses.has(item.status));
      const spreadsheetId = resolveOffScheduleSpreadsheetId(sheetUrl);
      if (!spreadsheetId) throw Error("Chưa cấu hình Google Sheet lịch OFF.");
      if (values.length) await syncScheduleUpdatesToGoogleSheet(spreadsheetId, values, AbortSignal.timeout(45_000));
      await updateRows({ state: "SYNCED", synced_at: new Date().toISOString(), last_error: null });
      return { success: true, queued: rows.length, synced: values.length };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Không thể đồng bộ Google Sheet";
      await Promise.all(rows.map(row => {
        const attempts = row.attempts + 1;
        return admin.from("attendance_sheet_sync_outbox").update({
          state: attempts >= 8 ? "FAILED" : "PENDING",
          attempts,
          next_attempt_at: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000).toISOString(),
          last_error: message.slice(0, 1000),
        }).eq("id", row.id);
      }));
      return { success: false, queued: rows.length, synced: 0, error: message };
    }
  });
  return result ?? { success: false, queued: 0, synced: 0, error: "Có lượt đồng bộ đang chạy. Thay đổi vẫn nằm trong hàng đợi." };
}
