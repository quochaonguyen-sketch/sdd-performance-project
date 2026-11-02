import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ohRange } from "@/lib/onhold/model";
import { todayInVietnam } from "@/lib/ai/work-date";
import type { ReturnHistoryData } from "./history";

/** Call only after Return page and business permissions have been checked. */
export async function getReturnHistory(from: string, to: string, signal?: AbortSignal): Promise<ReturnHistoryData> {
  ohRange(from, to, todayInVietnam());
  const { data, error } = await createAdminClient().rpc("read_return_daily_history", { p_from: from, p_to: to }).abortSignal(signal ?? AbortSignal.timeout(30_000));
  if (error || !data) throw new Error("Không đọc được lịch sử hàng trả.");
  return data as ReturnHistoryData;
}
