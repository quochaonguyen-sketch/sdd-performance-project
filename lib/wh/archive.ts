import type { SupabaseClient } from "@supabase/supabase-js";
import { createOHArchiveClient } from "../onhold/archive.ts";
import type { WhOrder } from "./model.ts";

export const FULL_WH_VERSION = "wh-full:";
export const WH_STATION = "4232";

export type WhSnapshot = { report_date: string; snapshot_at: string; orders: WhOrder[] };
export type WhArchiveSnapshot = WhSnapshot & { station_id: string; job_id: string };

export function whUsesArchive() {
  return process.env.WH_SUPABASE_ARCHIVE_ENABLED === "1";
}

function archiveClient() {
  const client = createOHArchiveClient();
  if (!client) throw Error("Chưa cấu hình Supabase lưu trữ WH.");
  return client;
}

export async function readWhSnapshots(
  primary: SupabaseClient,
  dates?: { from: string; to: string },
  signal?: AbortSignal,
): Promise<WhSnapshot[]> {
  const target = whUsesArchive() ? archiveClient() : null;
  const columns = "report_date,snapshot_at,orders";
  const deadline = AbortSignal.timeout(15_000);
  const request = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const pageSize = 50;
  const snapshots: WhSnapshot[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const query = target
      ? target.from("operations_archive_days").select("report_date,payload").eq("kind", "wh").like("version", `${FULL_WH_VERSION}%`)
      : primary.from("wh_tracking_snapshots").select(columns).eq("station_id", WH_STATION);
    if (dates) query.gte("report_date", dates.from).lte("report_date", dates.to);
    const { data, error } = await query.order("report_date", { ascending: false })
      .range(offset, dates ? offset + pageSize - 1 : offset).abortSignal(request);
    if (error || !data) throw Error("Chưa đọc được dữ liệu WH / iPhone.");
    for (const row of data) {
      const snapshot = ("payload" in row ? row.payload : row) as WhSnapshot;
      if (snapshot?.report_date !== row.report_date || !snapshot.snapshot_at || !Array.isArray(snapshot.orders)) {
        throw Error("Snapshot WH không hợp lệ.");
      }
      snapshots.push(snapshot);
    }
    if (!dates || data.length < pageSize) return snapshots;
  }
}
