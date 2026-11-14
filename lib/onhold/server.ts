import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ohRange, resolveOHRiders, type OHData, type OHOrdersResult } from "./model";
import { vietnamDay } from "@/lib/data-sources/catalog";

import { TtlCache } from "@/lib/cache/ttl-cache";

const dayCache = new TtlCache<OHData>(120_000, 96);
const finalizedDayCache = new TtlCache<OHData>(30 * 60_000, 96);
const riderCache = new TtlCache<{ rider_code: string; rider_name: string }[]>(60_000, 1);

async function riderDirectory() {
  return (await riderCache.load("riders", async () => {
    const client = createAdminClient();
    const rows: { rider_code: string; rider_name: string }[] = [];
    const signal = AbortSignal.timeout(5_000);
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await client.from("riders").select("rider_code,full_name,name")
        .order("rider_code").range(offset, offset + 999).abortSignal(signal);
      if (error || !data) throw new Error("Không đọc được danh sách rider.");
      rows.push(...data.flatMap(row => [
        { rider_code: row.rider_code, rider_name: row.full_name || "" },
        { rider_code: row.rider_code, rider_name: row.name || "" },
      ]));
      if (data.length < 1000) return rows;
    }
  })).value;
}

async function withRiderNames<T extends { rider_code?: string | null; rider_name?: string | null }>(rows: T[]) {
  if (!rows.length) return rows;
  try { return resolveOHRiders(rows, await riderDirectory()); }
  catch { return resolveOHRiders(rows); }
}

export class OHPivotError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message);
    this.name = "OHPivotError";
  }
}

function transient(code: string, status: number) {
  return status === 0 || status >= 500 || code === "57014" || code === "PGRST003";
}

export async function getOHPivot(from: string, to: string, refresh = false): Promise<OHData> {
  ohRange(from, to, vietnamDay());
  const client = createAdminClient();
  const signal = AbortSignal.timeout(45_000);
  const readReports = (columns = "report_date,fetched_at,finalized_at") => client.from("onhold_daily_reports")
    .select(columns).gte("report_date", from).lte("report_date", to).order("report_date").abortSignal(signal);
  let columns = "report_date,fetched_at,finalized_at";
  let metadata = await readReports(columns);
  if (metadata.error?.code === "42703") {
    columns = "report_date,fetched_at";
    metadata = await readReports(columns);
  }
  if (metadata.error && transient(metadata.error.code, metadata.status) && !signal.aborted) {
    await new Promise(resolve => setTimeout(resolve, 250));
    metadata = await readReports(columns);
  }
  const { data, error, status } = metadata;
  const reports = data as { report_date: string; fetched_at: string; finalized_at?: string | null }[] | null;
  if (error || !reports) throw new OHPivotError(error ? error.code || "OH_NETWORK_ERROR" : "OH_EMPTY_RESPONSE", status, error?.message ?? "Missing OH reports response");

  async function readDay(day: string): Promise<OHData> {
    for (let attempt = 0; attempt < 2; attempt++) {
      signal.throwIfAborted();
      const { data, error, status } = await client.rpc("read_onhold_pivot", { p_from: day, p_to: day })
        .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(15_000)]));
      if (!error && data && Array.isArray(data.reports) && Array.isArray(data.cells)) return data as OHData;
      const code = error ? error.code || (error.message.includes("TimeoutError") ? "OH_TIMEOUT" : "OH_NETWORK_ERROR") : "OH_INVALID_RESPONSE";
      if (attempt === 0 && error && transient(code, status) && !signal.aborted) {
        await new Promise(resolve => setTimeout(resolve, 250));
        continue;
      }
      throw new OHPivotError(code, status, error?.message ?? "Invalid OH day response");
    }
    throw new OHPivotError("OH_RETRY_EXHAUSTED", 503, "OH day read failed");
  }

  // Keep at most three small reads running and preserve chronological order across the period.
  const result: OHData = { reports: [], cells: [] };
  const sources = reports.map(report => ({
    day: report.report_date,
    cache: report.finalized_at ? finalizedDayCache : dayCache,
    key: JSON.stringify([report.report_date, report.fetched_at, report.finalized_at]),
  }));
  if (refresh) for (const source of sources) source.cache.delete(source.key);
  const days: OHData[] = [];
  let next = 0, failed = false;
  await Promise.all(Array.from({ length: Math.min(3, sources.length) }, async () => {
    while (!failed && next < sources.length) {
      signal.throwIfAborted();
      const index = next++;
      const { day, cache, key } = sources[index];
      try {
        days[index] = (await cache.load(key, () => readDay(day))).value;
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }));
  for (const day of days) {
    result.reports.push(...day.reports);
    for (const cell of day.cells) result.cells.push(cell);
  }
  result.cells = await withRiderNames(result.cells);
  return result;
}


export type OrderQueryOptions = {
  area?: string;
  status?: string;
  reason?: string;
  district?: string;
  ward?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

export async function getOHOrders(day: string, options: OrderQueryOptions = {}): Promise<OHOrdersResult> {
  const {
    area = "all",
    status = "all",
    reason = "all",
    district = "all",
    ward = "all",
    q = "",
    limit = 100,
    offset = 0,
  } = options;

  const { data, error } = await createAdminClient().rpc("read_onhold_orders", {
    p_day: day,
    p_area: area,
    p_status: status,
    p_reason: reason,
    p_district: district,
    p_ward: ward,
    p_q: q,
    p_limit: limit,
    p_offset: offset,
  });

  if (error || !data) {
    throw new Error("Không tải được danh sách mã đơn OH.");
  }

  const result = data as OHOrdersResult;
  return { ...result, orders: await withRiderNames(result.orders) };
}

export async function exportOHOrders(day: string, options: OrderQueryOptions = {}): Promise<OHOrdersResult> {
  const {
    area = "all",
    status = "all",
    reason = "all",
    district = "all",
    ward = "all",
    q = "",
  } = options;

  const { data, error } = await createAdminClient().rpc("export_onhold_orders", {
    p_day: day,
    p_area: area,
    p_status: status,
    p_reason: reason,
    p_district: district,
    p_ward: ward,
    p_q: q,
  });

  if (error || !data) {
    throw new Error("Không xuất được danh sách mã đơn OH.");
  }

  const result = data as OHOrdersResult;
  return { ...result, orders: await withRiderNames(result.orders) };
}
