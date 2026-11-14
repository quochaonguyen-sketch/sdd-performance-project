import type { SupabaseClient } from "@supabase/supabase-js";
import { operationsArchiveKinds, operationsArchiveWindow, readOperationsVersions, type OperationsArchiveKind } from "../lib/supabase/operations-archive.ts";
import type { BacklogHourlyDay } from "../lib/dashboard/backlog-history.ts";
import type { ReturnHistoryData } from "../lib/return-orders/history.ts";

async function readPayload(primary: SupabaseClient, kind: OperationsArchiveKind, day: string) {
  const signal = AbortSignal.timeout(25_000);
  if (kind === "return") {
    const { data, error } = await primary.rpc("read_return_daily_history", { p_from: day, p_to: day }).abortSignal(signal);
    const result = data as ReturnHistoryData | null;
    if (error || result?.days.length !== 1 || result.days[0].report_date !== day || result.groups.some(row => row.report_date !== day)
      || result.groups.reduce((n, row) => n + row.total, 0) !== result.days[0].total_orders) throw Error("Bản hàng trả thiếu dữ liệu.");
    return result;
  }
  if (kind === "pickup_cot") {
    const { data, error } = await primary.from("pickup_cot_oh_snapshots").select("cot,cutoff_at,source_started_at,snapshot_at,riders")
      .eq("report_date", day).order("cot").abortSignal(signal);
    if (error || !data?.length) throw Error("Không đọc đủ snapshot Pickup theo COT.");
    return data;
  }
  if (kind === "wh") {
    const { data, error } = await primary.from("wh_tracking_snapshots").select("report_date,snapshot_at,orders")
      .eq("station_id", "4232").eq("report_date", day).abortSignal(signal).single();
    if (error || !Array.isArray(data?.orders)) throw Error("Không đọc đủ snapshot WH.");
    return { ...data, orders: data.orders.filter(row => row?.raw_status === "Delivered") };
  }
  const source = kind === "backlog_pickup" ? "pickup" : "delivery";
  const { data, error } = await primary.rpc("read_backlog_hourly", { p_source: source, p_day: day }).abortSignal(signal);
  const result = data as BacklogHourlyDay | null;
  if (error || result?.day !== day || result.source !== source || result.hours.length !== 24) throw Error("Không đọc đủ lịch sử tồn theo giờ.");
  return result;
}

export async function syncOperationsArchive(primary: SupabaseClient, archive: SupabaseClient, dryRun: boolean) {
  const { since, yesterday } = operationsArchiveWindow();
  const target = await archive.from("operations_archive_days").select("kind,report_date,version")
    .gte("report_date", since).lte("report_date", yesterday).abortSignal(AbortSignal.timeout(15_000));
  if (target.error) throw Error(`Không đọc được kho lịch sử vận hành (${target.error.code}).`);
  const archived = new Map(target.data.map(row => [`${row.kind}:${row.report_date}`, row.version]));
  let failed = false;
  for (const kind of operationsArchiveKinds) {
    try {
      const versions = await readOperationsVersions(primary, kind, since, yesterday, AbortSignal.timeout(15_000));
      const pending = versions.filter(row => archived.get(`${kind}:${row.report_date}`) !== row.version);
      let copied = 0;
      if (!dryRun) for (let i = 0; i < pending.length; i += 3) {
        const batch = pending.slice(i, i + 3);
        const rows = await Promise.all(batch.map(async row => ({ kind, ...row, payload: await readPayload(primary, kind, row.report_date) })));
        const dates = rows.map(row => row.report_date).sort();
        const fresh = new Map((await readOperationsVersions(primary, kind, dates[0], dates.at(-1)!, AbortSignal.timeout(15_000)))
          .map(row => [row.report_date, row.version]));
        if (rows.some(row => fresh.get(row.report_date) !== row.version)) throw Error("Nguồn vừa thay đổi. Thử lại lượt sau.");
        const { error } = await archive.from("operations_archive_days").upsert(rows, { onConflict: "kind,report_date" })
          .abortSignal(AbortSignal.timeout(25_000));
        if (error) throw Error(`Không ghi được bản lưu trữ (${error.code}).`);
        copied += rows.length;
      }
      console.log(JSON.stringify({ kind, finalized: versions.length, pending: pending.length - copied, copied }));
    } catch (error) {
      failed = true;
      console.error(`${kind}: ${error instanceof Error ? error.message : "Đồng bộ thất bại."}`);
    }
  }
  if (failed) throw Error("Một số nguồn chưa đồng bộ được.");
}
