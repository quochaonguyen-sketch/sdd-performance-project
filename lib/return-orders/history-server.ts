import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ohRange } from "@/lib/onhold/model";
import { todayInVietnam } from "@/lib/ai/work-date";
import type { ReturnHistoryData } from "./history";
import { operationsArchiveWindow, readOperationsArchive } from "@/lib/supabase/operations-archive";

/** Call only after Return page and business permissions have been checked. */
export async function getReturnHistory(from: string, to: string, signal?: AbortSignal): Promise<ReturnHistoryData> {
  ohRange(from, to, todayInVietnam());
  const db = createAdminClient();
  const deadline = signal ?? AbortSignal.timeout(30_000);
  const { today, yesterday } = operationsArchiveWindow();
  const readPrimary = async (start: string, end: string) => {
    const { data, error } = await db.rpc("read_return_daily_history", { p_from: start, p_to: end }).abortSignal(deadline);
    if (error || !data) throw new Error("Không đọc được lịch sử hàng trả.");
    return data as ReturnHistoryData;
  };
  if (from >= today) return readPrimary(from, to);
  const archive = await readOperationsArchive<ReturnHistoryData>(db, "return", from, to < today ? to : yesterday, deadline);
  if (!archive) return readPrimary(from, to);
  if (to === today) archive.push(await readPrimary(today, today));
  return { days: archive.flatMap(row => row.days), groups: archive.flatMap(row => row.groups) };
}
