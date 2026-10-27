"use client";
import { useRememberedState } from "@/components/layout/filter-memory";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Bike, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Layers3, RefreshCcw, Search, UsersRound } from "lucide-react";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDateTime } from "@/components/lmhub-inventory/lmhub-inventory-model";
import { PICKUP_AREAS, filterRiders, sum, type Area, type Metrics, type PickupRider, type Summary } from "@/lib/pickup/realtime";
import { cn } from "@/utils/cn";

const TONES: Record<Area, { color: string; tint: string }> = {
  KV1: { color: "#2563eb", tint: "#eff6ff" }, KV2: { color: "#059669", tint: "#ecfdf5" },
  KV3: { color: "#7c3aed", tint: "#f5f3ff" }, KV4: { color: "#d97706", tint: "#fffbeb" }, KV5: { color: "#db2777", tint: "#fdf2f8" },
};
const INITIAL = { area: "all", route: "all", ward: "all", cot: "all", coverage: "all", query: "" };
const fmt = (n: number) => n.toLocaleString("vi-VN");
const rate = (m: Metrics) => m.assigned > 0 ? Math.round(m.picked / m.assigned * 100) : 0;
const unique = (values: string[]) => [...new Set(values)].sort((a,b) => a.localeCompare(b,"vi",{ numeric:true }));
type Payload = { riders: PickupRider[]; summary: Summary[]; snapshotAt: string | null; riderSnapshotAt: string | null; routeSnapshotAt: string | null; snapshotsAligned: boolean; riderSource?: string; riderStale?: boolean; taskCount?: number | null };

export function PickupRealtimeView() {
  const [data, setData] = useState<Payload>({ riders: [], summary: [], snapshotAt: null, riderSnapshotAt: null, routeSnapshotAt: null, snapshotsAligned: true });
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [filters, setFilters] = useRememberedState("pickup-realtime-view:filters", INITIAL), [tab, setTab] = useState<"riders" | "zones">("riders"), [page, setPage] = useState(0);
  const request = useRef(0), abort = useRef<AbortController | null>(null);
  useReportInitialDataLoading("pickup-realtime", loading);
  const load = useCallback(async () => {
    const id = ++request.current;
    abort.current?.abort();
    const controller = new AbortController(); abort.current = controller;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/pickup-realtime", { cache: "no-store", signal: controller.signal });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error ?? "Không tải được pickup realtime");
      if (id === request.current) setData(payload);
    } catch (e) { if (!controller.signal.aborted && id === request.current) setError(e instanceof Error ? e.message : "Không tải được dữ liệu"); }
    finally { if (id === request.current && !controller.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => { clearTimeout(timer); abort.current?.abort(); }; }, [load]);
  useEffect(() => {
    // Full-fleet snapshots are private; refresh through the authenticated API.
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const timer = setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);
  useSupabaseRealtime({ table: "pickup_48h_summary_groups", onChange: load, debounceMs: 1500 });
  useSupabaseRealtime({ table: "pickup_48h_realtime_riders", onChange: load, debounceMs: 1500 });
  useSupabaseRealtime({ table: "pickup_48h_rider_groups", onChange: load, debounceMs: 1500 });
  useSupabaseRealtime({ table: "pickup_48h_no_api2", onChange: load, debounceMs: 1500 });
  useSupabaseRealtime({ table: "riders", onChange: load, debounceMs: 1500 });
  function change(patch: Partial<typeof INITIAL>) { setFilters(current => ({ ...current, ...patch })); setPage(0); }
  function selectArea(area: string) { change({ area, ward: "all", route: "all" }); }
  const scopedSummary = useMemo(() => data.summary.filter(r => (filters.area === "all" || r.area === filters.area) && (filters.ward === "all" || r.ward === filters.ward) && (filters.route === "all" || r.route === filters.route)), [data.summary, filters]);
  const areaTotals = useMemo(() => sum(scopedSummary), [scopedSummary]);
  const riders = useMemo(() => filterRiders(data.riders, filters), [data.riders, filters]);
  const totals = useMemo(() => tab === "riders" ? sum(riders.flatMap(r => r.metrics ? [r.metrics] : [])) : areaTotals, [tab, riders, areaTotals]);
  const riderZoneCount = useMemo(() => new Set(riders.flatMap(r => r.routes)).size, [riders]);
  const missing = data.riders.filter(r => !r.metrics).length;
  const pageCount = Math.max(1, Math.ceil(riders.length / 50)), currentPage = Math.min(page, pageCount - 1);
  const pageRiders = riders.slice(currentPage * 50, (currentPage + 1) * 50);
  const areaSummary = data.summary.filter(r => filters.area === "all" || r.area === filters.area);
  const zones = useMemo(() => {
    const map = new Map<string, Summary>();
    for (const row of scopedSummary) {
      const key = `${row.area}:${row.route}`;
      const prev = map.get(key);
      map.set(key, { ...row, ...sum(prev ? [prev, row] : [row]) });
    }
    return [...map.values()].sort((a,b) => b.assigned - a.assigned);
  }, [scopedSummary]);
  return <div className="mx-auto max-w-[1680px] space-y-5 pb-6">
    <header className="relative overflow-hidden rounded-2xl bg-[#18324e] p-6 text-white shadow-sm">
      <div className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border-[40px] border-white/5" />
      <div className="relative flex flex-wrap items-center justify-between gap-4"><div>
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-sky-200"><span className={cn("h-2 w-2 rounded-full bg-emerald-400", loading && "animate-pulse")} />Điều hành lấy hàng · KV1–KV5</div>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Pickup Realtime</h1><p className="mt-2 text-xs text-slate-300">Theo dõi tiến độ lấy hàng, mã zone và độ phủ rider từng khu vực.</p>
      </div><Button onClick={() => void load()} disabled={loading} variant="secondary" className="border-white/20 bg-white/10 text-white hover:bg-white/20"><RefreshCcw size={15} className={loading ? "animate-spin" : ""}/>{loading ? "Đang cập nhật" : "Làm mới"}</Button></div>
      <div className="relative mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-3 text-[11px] text-slate-300"><span>Địa bàn: <strong className="font-mono text-white">{formatDateTime(data.snapshotAt)}</strong></span><span>Rider: <strong className="font-mono text-white">{formatDateTime(data.riderSnapshotAt)}</strong></span><span>Tuyến gán: <strong className="font-mono text-white">{formatDateTime(data.routeSnapshotAt)}</strong></span><span>{fmt(data.riders.length)} rider trong phạm vi</span>{data.riderSource === "sdd-web-data" && <span className="text-emerald-300">SPX · SDD Web Data · {fmt(data.taskCount ?? 0)} task</span>}</div>
    </header>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {!loading && (missing > 0 || !data.snapshotsAligned || data.riderStale) && <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900"><Clock3 size={17} className="mt-0.5 shrink-0"/><div>{data.riderStale && <p>Phiên dữ liệu rider đã quá 20 phút hoặc thuộc ngày trước. Đang giữ lần đồng bộ thành công gần nhất.</p>}{missing > 0 && <p><strong>{fmt(missing)} rider chưa có số liệu trong snapshot realtime.</strong> Vẫn hiển thị theo danh sách rider; dấu “—” nghĩa là chưa có dữ liệu.</p>}{!data.snapshotsAligned && <p>Các nguồn đang khác phiên cập nhật. Số liệu địa bàn và rider có thể chưa khớp; chi tiết rider chỉ dùng cùng phiên.</p>}</div></div>}
    <nav aria-label="Phạm vi khu vực" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {(["all", ...PICKUP_AREAS] as const).map(area => {
        const list = data.riders.filter(r => area === "all" || r.area === area), live = list.filter(r => r.metrics).length;
        const tone = area === "all" ? { color: "#334155", tint: "#f8fafc" } : TONES[area];
        return <button key={area} onClick={() => selectArea(area)} aria-pressed={filters.area === area} style={{ borderColor: tone.color, background: tone.tint, color: tone.color, boxShadow: filters.area === area ? `0 0 0 2px ${tone.color}` : undefined }} className="relative overflow-hidden rounded-xl border-t-[3px] p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-md"><span className="flex items-center justify-between text-xs font-bold">{area === "all" ? "Tất cả khu vực" : `Khu vực ${area}`}{filters.area === area ? <CheckCircle2 size={15}/> : <ArrowRight size={15}/>}</span><strong className="mt-3 block font-mono text-3xl font-black">{fmt(list.length)} <span className="text-[11px] font-medium">rider</span></strong><span className="mt-2 block text-[10px]">{live} có dữ liệu · {list.length - live} chưa có</span></button>;
      })}
    </nav>
    <section aria-label="Tổng tiến độ pickup" className="space-y-2"><div className="flex flex-wrap justify-between gap-2 px-1 text-xs"><h2 className="font-bold text-slate-700">{tab === "riders" ? "Tổng theo rider" : "Tổng theo địa bàn"} {filters.area === "all" ? "KV1–KV5" : filters.area}</h2><span className="text-slate-400">{tab === "riders" ? "Theo KV hồ sơ và bộ lọc rider; lượt gán có thể trùng khi nhiều rider cùng xử lý." : "Số liệu tổng hợp địa bàn, không cộng lặp rider chung tuyến"}</span></div><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[{ label: "Tổng đơn gán", value: fmt(totals.assigned), icon: Layers3, color: "text-blue-700", sub: `${tab === "riders" ? riderZoneCount : zones.length} zone đang xem` }, { label: "Đã lấy", value: fmt(totals.picked), icon: CheckCircle2, color: "text-emerald-700", sub: "Sản lượng lấy hàng" }, { label: "Onhold", value: fmt(totals.onhold), icon: Clock3, color: "text-rose-700", sub: "Đơn tạm giữ xử lý lại" }, { label: "Tỷ lệ lấy", value: `${rate(totals)}%`, icon: Bike, color: "text-violet-700", sub: "Đã lấy / tổng gán" }].map(item => <article key={item.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">{item.label}<item.icon size={16} className={item.color}/></div><strong className={cn("mt-2 block font-mono text-3xl font-black", item.color)}>{loading && !data.snapshotAt ? "—" : item.value}</strong><p className="mt-1 text-[11px] text-slate-400">{item.sub}</p></article>)}
    </div></section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex gap-1 border-b border-slate-100 p-2"><button onClick={() => setTab("riders")} aria-pressed={tab === "riders"} className={cn("flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold", tab === "riders" ? "bg-slate-800 text-white" : "text-slate-500")}><UsersRound size={16}/>Theo rider</button><button onClick={() => setTab("zones")} aria-pressed={tab === "zones"} className={cn("rounded-lg px-4 py-2.5 text-xs font-bold", tab === "zones" ? "bg-slate-800 text-white" : "text-slate-500")}>Theo mã zone</button></div>
      <div className="grid gap-3 border-b border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-2 xl:grid-cols-3">
        <Filter label="Mã zone"><Select value={filters.route} onChange={e => change({route:e.target.value})}><option value="all">Tất cả zone</option>{unique([...areaSummary.map(r=>r.route), ...data.riders.filter(r => filters.area === "all" || r.area === filters.area).flatMap(r=>r.routes)]).map(zone=><option key={zone}>{zone}</option>)}</Select></Filter>
        <Filter label="Phường lấy hàng"><Select value={filters.ward} onChange={e=>change({ward:e.target.value})}><option value="all">Tất cả phường</option>{unique([...areaSummary.map(r=>r.ward), ...data.riders.filter(r => filters.area === "all" || r.area === filters.area).flatMap(r=>r.assignments.map(a=>a.ward))]).map(ward=><option key={ward}>{ward}</option>)}</Select></Filter>
        {tab === "riders" && <><Filter label="COT phụ trách"><Select value={filters.cot} onChange={e=>change({cot:e.target.value})}><option value="all">Cả COT</option><option value="COT1">COT 1</option><option value="COT2">COT 2</option><option value="UNKNOWN">Chưa rõ COT</option></Select></Filter><Filter label="Dữ liệu realtime"><Select value={filters.coverage} onChange={e=>change({coverage:e.target.value})}><option value="all">Toàn bộ rider</option><option value="live">Đã có dữ liệu</option><option value="missing">Chưa có dữ liệu</option></Select></Filter><Filter label="Tìm rider / mã zone"><span className="relative block"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><Input value={filters.query} onChange={e=>change({query:e.target.value})} placeholder="Tên, ID hoặc mã zone…" className="pl-9"/></span></Filter></>}
        <div className="flex items-end"><button onClick={()=>{setFilters(INITIAL);setPage(0);}} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-500 hover:text-blue-700">Đặt lại bộ lọc</button></div>
      </div>
      {tab === "riders" ? <>
        <div className="flex flex-wrap items-center justify-between gap-2 p-4"><div><h2 className="text-sm font-bold text-slate-900">Rider {filters.area === "all" ? "KV1–KV5" : filters.area} <span className="ml-2 rounded-md bg-slate-100 px-2 py-1 font-mono text-xs">{fmt(riders.length)}</span></h2><p className="mt-2 text-[11px] text-slate-500">KV và COT theo hồ sơ rider. Lọc phường / zone hiển thị sản lượng chi tiết trong phạm vi đó.</p></div><span className="text-[11px] text-slate-400">50 rider / trang</span></div>
        <div className="max-h-[650px] overflow-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="sticky top-0 z-10 bg-slate-100 text-[10px] uppercase tracking-wide text-slate-500"><tr>{["Rider", "KV / COT", "Mã zone", "Tổng gán", "Đã lấy", "Chờ lấy", "Onhold", "Tiến độ"].map((h,i)=><th key={h} className={cn("px-4 py-3 font-bold",i>2 && "text-right")}>{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{pageRiders.map(r => <tr key={r.id} className="hover:bg-blue-50/30"><td className="px-4 py-4"><strong className="block text-slate-800">{r.name}</strong><span className="mt-1 block font-mono text-[10px] text-slate-400">{r.id}</span></td><td className="px-4 py-3"><AreaBadge area={r.area}/><span className="mt-1.5 block text-[10px] text-slate-500">{r.cot === "UNKNOWN" ? "Chưa rõ COT" : r.cot}</span></td><td className="max-w-80 px-4 py-3"><div className="flex flex-wrap gap-1">{r.routes.length ? r.routes.map(z=><span key={z} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1 font-mono text-[10px] text-slate-600">{z}</span>) : <span className="text-slate-400">Chưa có tuyến được ghi nhận</span>}</div>{r.routeSource === "inventory" && <span className="mt-1.5 block text-[10px] text-blue-600">Tuyến từ gán pickup</span>}</td>{[r.metrics?.assigned,r.metrics?.picked,r.metrics ? Math.max(0,r.metrics.assigned-r.metrics.picked-r.metrics.onhold) : undefined,r.metrics?.onhold].map((n,i)=><td key={i} className={cn("px-4 py-3 text-right font-mono font-bold", ["text-slate-700","text-emerald-700","text-blue-700","text-rose-600"][i])}>{n === undefined ? "—" : fmt(n)}</td>)}<td className="min-w-32 px-4 py-3 text-right">{r.metrics ? <><strong className="font-mono text-emerald-700">{rate(r.metrics)}%</strong><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{width:`${Math.min(100,rate(r.metrics))}%`}}/></div></> : <span className="whitespace-nowrap rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-700">Chưa có dữ liệu</span>}</td></tr>)}{!riders.length && <tr><td colSpan={8} className="p-12 text-center text-slate-400">{loading ? "Đang tải rider…" : "Không có rider khớp bộ lọc."}</td></tr>}</tbody></table></div>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-4 text-xs text-slate-500"><span>{riders.length ? `${currentPage*50+1}–${Math.min((currentPage+1)*50,riders.length)} / ${fmt(riders.length)} rider` : "0 rider"}</span><div className="flex items-center gap-3"><button aria-label="Trang trước" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)} className="rounded border p-1.5 disabled:opacity-30"><ChevronLeft size={15}/></button><span>{currentPage+1} / {pageCount}</span><button aria-label="Trang sau" disabled={currentPage>=pageCount-1} onClick={()=>setPage(currentPage+1)} className="rounded border p-1.5 disabled:opacity-30"><ChevronRight size={15}/></button></div></footer>
      </> : <><div className="p-4 text-sm font-bold text-slate-800">{zones.length} zone · Tổng theo địa bàn lấy hàng</div><div className="max-h-[650px] overflow-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="sticky top-0 bg-slate-100 text-slate-500"><tr>{["Mã zone","KV","Tổng gán","Đã lấy","Onhold","Tỷ lệ"].map((h,i)=><th key={h} className={cn("px-4 py-3",i>1 && "text-right")}>{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{zones.map(z=><tr key={`${z.area}:${z.route}`} className="hover:bg-slate-50"><td className="px-4 py-3 font-mono font-semibold"><button onClick={()=>{change({route:z.route});setTab("riders");}} className="text-left hover:text-blue-700">{z.route}</button></td><td className="px-4">{z.area && <AreaBadge area={z.area}/>}</td>{[fmt(z.assigned),fmt(z.picked),fmt(z.onhold),`${rate(z)}%`].map((v,i)=><td key={i} className="px-4 text-right font-mono">{v}</td>)}</tr>)}{!zones.length && <tr><td colSpan={6} className="p-12 text-center text-slate-400">{loading ? "Đang tải zone…" : "Không có zone khớp bộ lọc."}</td></tr>}</tbody></table></div></>}
    </section>
  </div>;
}
function AreaBadge({area}:{area:Area}) { return <span style={{color:TONES[area].color,background:TONES[area].tint}} className="inline-block rounded px-2 py-1 font-mono text-[10px] font-bold">{area}</span>; }
function Filter({label,children}:{label:string;children:React.ReactNode}) { return <label className="space-y-1.5"><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>{children}</label>; }
