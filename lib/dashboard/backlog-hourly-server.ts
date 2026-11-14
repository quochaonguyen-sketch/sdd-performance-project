import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { readOperationsArchive } from "@/lib/supabase/operations-archive";
import type { BacklogHourlyDay, BacklogSource } from "./backlog-history";

export async function readBacklogHourly(source: BacklogSource, day: string, signal = AbortSignal.timeout(25_000)) {
  const primary = createAdminClient();
  const archived = await readOperationsArchive<BacklogHourlyDay>(primary, `backlog_${source}`, day, day, signal);
  if (archived?.[0]) return archived[0];
  const { data, error } = await primary.rpc("read_backlog_hourly", { p_source: source, p_day: day }).abortSignal(signal);
  if (error || !data) throw new Error("Không đọc được báo cáo theo giờ.");
  return data as BacklogHourlyDay;
}
