"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, PackageCheck, PauseCircle, RefreshCcw, Route as RouteIcon, Search, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import { KpiCard, RealtimeIndicator } from "@/components/realtime-dashboard/realtime-dashboard-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/utils/cn";

type Area = "KV1" | "KV2" | "KV3" | "KV4" | "KV5" | "KV6";
type AreaFilter = Area | "all";
type Metrics = { assigned: number; picked: number; onhold: number };
type SummaryRow = Metrics & { route: string; ward: string; area: Area | null; routeArea: Area | null };
type Rider = Metrics & { id: string; name: string; area: Area | null; routes: string[] };
type Filters = { area: AreaFilter; ward: string; route: string };

const AREAS: readonly Area[] = ["KV1", "KV2", "KV3", "KV4", "KV5", "KV6"];
const AREA_SET = new Set<string>(AREAS);
const KV_LIST = AREAS.join(",");
const DEFAULT_FILTERS: Filters = { area: "all", ward: "all", route: "all" };
const AREA_TONE: Record<Area, string> = {
  KV1: "bg-sky-50 text-sky-700 ring-sky-200",
  KV2: "bg-teal-50 text-teal-700 ring-teal-200",
  KV3: "bg-amber-50 text-amber-800 ring-amber-200",
  KV4: "bg-rose-50 text-rose-700 ring-rose-200",
  KV5: "bg-blue-50 text-blue-700 ring-blue-200",
  KV6: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function PickupRealtimeView() {
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [query, setQuery] = useState("");
  useReportInitialDataLoading("pickup-realtime", loading);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    const supabase = createClient();
    setLoading(true);
    setError(null);
    const [summaryResult, riderResult] = await Promise.all([
      supabase.from("pickup_48h_summary_groups").select("snapshot_id,snapshot_at,khu_vuc,ward,area,route_area,assign_orders,picked_orders,onhold_orders").or(`area.in.(${KV_LIST}),route_area.in.(${KV_LIST})`).limit(8000),
      supabase.from("pickup_48h_realtime_riders").select("snapshot_id,driver_id,driver_name,area,zones,total_pickup_quantity,assigned_orders,onhold_orders").limit(8000),
    ]);
    if (requestId !== requestRef.current) return;
    const firstError = summaryResult.error ?? riderResult.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }
    const summaryRows = (summaryResult.data ?? []) as Array<Record<string, unknown>>;
    const riderRows = (riderResult.data ?? []) as Array<Record<string, unknown>>;
    const summaryId = latestId(summaryRows);
    const riderId = latestId(riderRows);
    const nextSummary: SummaryRow[] = [];
    let nextSnapshot: string | null = null;
    for (const row of summaryRows) {
      if (row.snapshot_id !== summaryId) continue;
      nextSnapshot = nextSnapshot ?? (typeof row.snapshot_at === "string" ? row.snapshot_at : null);
      nextSummary.push({
        route: clean(row.khu_vuc),
        ward: clean(row.ward),
        area: toArea(row.area),
        routeArea: toArea(row.route_area),
        assigned: num(row.assign_orders),
        picked: num(row.picked_orders),
        onhold: num(row.onhold_orders),
      });
    }
    const nextRiders: Rider[] = [];
    for (const row of riderRows) {
      if (row.snapshot_id !== riderId) continue;
      nextRiders.push({
        id: String(row.driver_id ?? ""),
        name: String(row.driver_name ?? "").trim() || "Chưa có tên",
        area: toArea(row.area),
        routes: String(row.zones ?? "").split(",").map((item) => item.trim()).filter(Boolean),
        assigned: num(row.assigned_orders),
        picked: num(row.total_pickup_quantity),
        onhold: num(row.onhold_orders),
      });
    }
    setSummary(nextSummary);
    setRiders(nextRiders);
    setSnapshotAt(nextSnapshot);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useSupabaseRealtime({ table: "pickup_48h_summary_groups", onChange: () => void load(), debounceMs: 800 });
  useSupabaseRealtime({ table: "pickup_48h_realtime_riders", onChange: () => void load(), debounceMs: 800 });

  const scoped = useMemo(() => summary.filter((row) => inArea(row.area ?? row.routeArea, filters.area) && (filters.ward === "all" || row.ward === filters.ward) && (filters.route === "all" || row.route === filters.route)), [summary, filters]);
  const kpi = useMemo(() => sum(scoped), [scoped]);
  const routes = useMemo(() => groupBy(scoped, (row) => row.route, (row) => row.routeArea), [scoped]);
  const wards = useMemo(() => groupBy(scoped, (row) => row.ward, (row) => row.area), [scoped]);
  const routeOptions = useMemo(() => unique(summary.filter((row) => inArea(row.routeArea, filters.area)).map((row) => row.route)), [summary, filters.area]);
  const wardOptions = useMemo(() => unique(summary.filter((row) => inArea(row.area ?? row.routeArea, filters.area)).map((row) => row.ward)), [summary, filters.area]);
  const riderRows = useMemo(() => {
    const q = normalize(query);
    return riders.filter((rider) => {
      if (filters.area !== "all" && rider.area !== filters.area) return false;
      if (filters.route !== "all" && !rider.routes.includes(filters.route)) return false;
      if (!q) return true;
      return normalize(`${rider.id} ${rider.name} ${rider.routes.join(" ")}`).includes(q);
    });
  }, [riders, filters, query]);
  const pickRate = rate(kpi.picked, kpi.assigned);

  return (
    <div className="dashboard-control mx-auto max-w-[1600px] space-y-6">
      <header className="dashboard-command-header">
        <div className="min-w-0">
          <div className="dashboard-kicker"><span className="dashboard-live-dot" />Pickup realtime · KV1–KV6</div>
          <h1>Pickup Realtime</h1>
          <p>Theo dõi đơn lấy theo 6 khu vực, tuyến và phường từ snapshot pickup 48h.</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCcw size={16} className={loading ? "animate-spin" : undefined} />Làm mới</Button>
      </header>

      <div className="dashboard-readout-strip">
        <RealtimeIndicator snapshotAt={snapshotAt} loading={loading} />
        <span className="hidden flex-wrap gap-1 sm:flex">{AREAS.map((area) => <span key={area} className={cn("rounded-full px-2 py-0.5 font-mono text-[11px] font-bold ring-1", AREA_TONE[area])}>{area} {riders.filter((item) => item.area === area).length}</span>)}</span>
      </div>
      {error ? <div role="alert" className="dashboard-error">{error}</div> : null}

      <div className="grid grid-cols-12 gap-3">
        <KpiCard className="col-span-6 lg:col-span-3" icon={RouteIcon} label="Tổng đơn gán" value={kpi.assigned} helper={`${wards.length} phường`} tone="blue" loading={loading} />
        <KpiCard className="col-span-6 lg:col-span-3" icon={PackageCheck} label="Đã lấy" value={kpi.picked} helper="Sản lượng đã pick" tone="green" loading={loading} />
        <KpiCard className="col-span-6 lg:col-span-3" icon={PauseCircle} label="Onhold" value={kpi.onhold} helper={`${rate(kpi.onhold, kpi.assigned)}% đơn gán`} tone={kpi.onhold ? "red" : "green"} loading={loading} />
        <KpiCard className="col-span-6 lg:col-span-3" icon={TrendingUp} label="Tỷ lệ lấy" value={`${pickRate}%`} helper={`${kpi.picked}/${kpi.assigned}`} tone={pickRate >= 80 ? "green" : pickRate >= 50 ? "blue" : "red"} loading={loading} />
      </div>

      <section className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-600">Khu vực</span>
          <Select value={filters.area} onChange={(event) => setFilters((current) => ({ ...current, area: toAreaFilter(event.target.value), ward: "all", route: "all" }))}>
            <option value="all">Tất cả KV1–KV6</option>
            {AREAS.map((area) => <option key={area} value={area}>{area}</option>)}
          </Select>
        </label>
        <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-600">Phường</span>
          <Select value={filters.ward} onChange={(event) => setFilters((current) => ({ ...current, ward: event.target.value }))}>
            <option value="all">Tất cả phường</option>
            {wardOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </label>
        <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-600">Tuyến</span>
          <Select value={filters.route} onChange={(event) => setFilters((current) => ({ ...current, route: event.target.value }))}>
            <option value="all">Tất cả tuyến</option>
            {routeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </label>
        <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-600">Tìm rider</span>
          <span className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tên, mã hoặc tuyến" /></span>
        </label>
      </section>

      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-12 overflow-hidden rounded-xl border border-slate-200 bg-white xl:col-span-7">
          <div className="border-b border-slate-200 p-4"><h2 className="font-bold text-slate-950">Tổng theo tuyến</h2><p className="text-sm text-slate-500">{routes.length} tuyến</p></div>
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">Tuyến</th><th className="px-4 py-3 text-right">Gán</th><th className="px-4 py-3 text-right">Lấy</th><th className="px-4 py-3 text-right">Onhold</th><th className="px-4 py-3 text-right">%</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {routes.map((row) => (
                  <tr key={row.key} className={cn("cursor-pointer hover:bg-blue-50/60", filters.route === row.key && "bg-blue-50")} onClick={() => setFilters((current) => ({ ...current, route: current.route === row.key ? "all" : row.key }))}>
                    <td className="px-4 py-3 font-mono text-[13px] font-semibold">{row.key} <AreaBadge area={row.area} /></td>
                    <td className="px-4 text-right tabular-nums">{row.assigned.toLocaleString("vi-VN")}</td>
                    <td className="px-4 text-right tabular-nums text-emerald-700">{row.picked.toLocaleString("vi-VN")}</td>
                    <td className="px-4 text-right tabular-nums text-red-600">{row.onhold.toLocaleString("vi-VN")}</td>
                    <td className="px-4 text-right tabular-nums">{rate(row.picked, row.assigned)}%</td>
                  </tr>
                ))}
                {!loading && !routes.length ? <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Chưa có dữ liệu tuyến.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
        <section className="col-span-12 overflow-hidden rounded-xl border border-slate-200 bg-white xl:col-span-5">
          <div className="border-b border-slate-200 p-4"><h2 className="font-bold text-slate-950">Theo phường</h2><p className="text-sm text-slate-500">{wards.length} phường</p></div>
          <div className="max-h-[560px] divide-y divide-slate-100 overflow-auto">
            {wards.map((row) => (
              <button key={row.key} type="button" onClick={() => setFilters((current) => ({ ...current, ward: current.ward === row.key ? "all" : row.key }))} className={cn("flex w-full items-center justify-between px-4 py-3 text-left hover:bg-blue-50/60", filters.ward === row.key && "bg-blue-50")}>
                <span className="flex min-w-0 items-center gap-2"><MapPin size={13} className="text-slate-400" /><span className="truncate font-semibold">{row.key}</span><AreaBadge area={row.area} /></span>
                <span className="font-mono text-xs tabular-nums text-slate-600">{row.picked.toLocaleString("vi-VN")}/{row.assigned.toLocaleString("vi-VN")} · {rate(row.picked, row.assigned)}%</span>
              </button>
            ))}
            {!loading && !wards.length ? <p className="p-8 text-center text-sm text-slate-500">Chưa có dữ liệu phường.</p> : null}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4"><h2 className="font-bold text-slate-950">Rider KV1–KV6</h2><p className="text-sm text-slate-500">{riderRows.length}/{riders.length} rider</p></div>
        <div className="max-h-[640px] overflow-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">Rider</th><th className="px-4 py-3">Tuyến</th><th className="px-4 py-3 text-right">Gán</th><th className="px-4 py-3 text-right">Lấy</th><th className="px-4 py-3 text-right">Onhold</th><th className="px-4 py-3 text-right">%</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {riderRows.map((rider) => (
                <tr key={rider.id}>
                  <td className="px-4 py-3"><div className="font-semibold">{rider.name}</div><div className="font-mono text-xs text-slate-500">{rider.id} <AreaBadge area={rider.area} /></div></td>
                  <td className="px-4 font-mono text-xs text-slate-600">{rider.routes.join(", ") || "—"}</td>
                  <td className="px-4 text-right tabular-nums">{rider.assigned.toLocaleString("vi-VN")}</td>
                  <td className="px-4 text-right tabular-nums text-emerald-700">{rider.picked.toLocaleString("vi-VN")}</td>
                  <td className="px-4 text-right tabular-nums text-red-600">{rider.onhold.toLocaleString("vi-VN")}</td>
                  <td className="px-4 text-right tabular-nums">{rate(rider.picked, rider.assigned)}%</td>
                </tr>
              ))}
              {!loading && !riderRows.length ? <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Không có rider khớp bộ lọc.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function AreaBadge({ area }: { area: Area | null }) {
  if (!area) return null;
  return <span className={cn("inline-flex rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold ring-1", AREA_TONE[area])}>{area}</span>;
}
function toArea(value: unknown): Area | null {
  const text = String(value ?? "").replace(/\s+/g, "").toUpperCase();
  if (AREA_SET.has(text)) return text as Area;
  if (/^[1-6]$/.test(text)) return `KV${text}` as Area;
  const match = text.match(/^KV?([1-6])$/);
  return match ? (`KV${match[1]}` as Area) : null;
}
function toAreaFilter(value: string): AreaFilter { return AREA_SET.has(value) ? value as Area : "all"; }
function inArea(area: Area | null, filter: AreaFilter) { return area !== null && (filter === "all" || area === filter); }
function num(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function clean(value: unknown) { const text = String(value ?? "").trim(); return text && text.toUpperCase() !== "UNKNOWN" ? text : "Chưa xác định"; }
function latestId(rows: Array<Record<string, unknown>>) { let latest: string | null = null; for (const row of rows) { const id = String(row.snapshot_id ?? ""); if (id && (latest === null || id > latest)) latest = id; } return latest; }
function sum(rows: Metrics[]): Metrics { return rows.reduce((total, row) => ({ assigned: total.assigned + row.assigned, picked: total.picked + row.picked, onhold: total.onhold + row.onhold }), { assigned: 0, picked: 0, onhold: 0 }); }
function rate(picked: number, assigned: number) { return assigned > 0 ? Math.round((picked / assigned) * 100) : 0; }
function unique(values: string[]) { return [...new Set(values)].sort((a, b) => a.localeCompare(b, "vi", { numeric: true })); }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().trim(); }
function groupBy(rows: SummaryRow[], keyOf: (row: SummaryRow) => string, areaOf: (row: SummaryRow) => Area | null) {
  const map = new Map<string, Metrics & { key: string; area: Area | null }>();
  for (const row of rows) {
    const key = keyOf(row);
    const current = map.get(key) ?? { key, area: areaOf(row), assigned: 0, picked: 0, onhold: 0 };
    current.assigned += row.assigned; current.picked += row.picked; current.onhold += row.onhold;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.assigned - a.assigned || a.key.localeCompare(b.key, "vi"));
}
