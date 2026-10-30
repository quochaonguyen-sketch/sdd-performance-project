"use client";
import { useRememberedState } from "@/components/layout/filter-memory";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, Bike, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Layers3, RefreshCcw, Search, UsersRound } from "lucide-react";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDateTime } from "@/components/lmhub-inventory/lmhub-inventory-model";
import { PICKUP_AREAS, filterRiders, sum, type Area, type Metrics, type PickupRider, type Summary } from "@/lib/pickup/realtime";
import { cn } from "@/utils/cn";
import { pendingPickup, pickupWorkload, type PickupFocus, type PickupSort } from "@/lib/pickup/workload";
import s from "./pickup-realtime.module.css";

const TONES: Record<Area, { color: string; tint: string }> = {
  KV1: { color: "var(--color-accent)", tint: "var(--color-accent-soft)" }, KV2: { color: "var(--color-success)", tint: "var(--color-success-soft)" },
  KV3: { color: "var(--color-purple)", tint: "var(--color-purple-soft)" }, KV4: { color: "var(--color-warning)", tint: "var(--color-warning-soft)" }, KV5: { color: "var(--color-rose)", tint: "var(--color-rose-soft)" },
};
const INITIAL = { area: "all", route: "all", ward: "all", cot: "all", coverage: "all", query: "" };
const fmt = (n: number) => n.toLocaleString("vi-VN");
const rate = (m: Metrics) => m.assigned > 0 ? m.picked / m.assigned * 100 : 0;
const rateLabel = (m: Metrics) => m.assigned > 0 ? `${rate(m).toLocaleString("vi-VN",{maximumFractionDigits:1})}%` : "—";
const unique = (values: string[]) => [...new Set(values)].sort((a,b) => a.localeCompare(b,"vi",{ numeric:true }));
const RIDER_COLUMNS: {label:string; key?:PickupSort}[] = [{label:"Rider",key:"name"},{label:"KV / COT"},{label:"Mã zone"},{label:"Tổng gán",key:"assigned"},{label:"Đã lấy",key:"picked"},{label:"Chờ lấy",key:"pending"},{label:"Onhold",key:"onhold"},{label:"Tiến độ",key:"rate"}];
type Payload = { riders: PickupRider[]; summary: Summary[]; snapshotAt: string | null; riderSnapshotAt: string | null; routeSnapshotAt: string | null; snapshotsAligned: boolean; riderSource?: string; riderStale?: boolean; taskCount?: number | null };

export function PickupRealtimeView() {
  const [data, setData] = useState<Payload>({ riders: [], summary: [], snapshotAt: null, riderSnapshotAt: null, routeSnapshotAt: null, snapshotsAligned: true });
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [filters, setFilters] = useRememberedState("pickup-realtime-view:filters", INITIAL), [tab, setTab] = useState<"riders" | "zones">("riders"), [page, setPage] = useState(0);
  const [focus, setFocus] = useState<PickupFocus>("all"), [sort, setSort] = useState<PickupSort>("assigned");
  const [direction,setDirection] = useState<"asc"|"desc">("desc");
  function changeSort(key:PickupSort, toggle=false) { setDirection(toggle&&sort===key ? direction==="asc"?"desc":"asc" : key==="rate"||key==="name"?"asc":"desc");setSort(key);setPage(0); }
  const request = useRef(0), abort = useRef<AbortController | null>(null);
  useReportInitialDataLoading("pickup-realtime", loading && !data.riderSnapshotAt);
  const load = useCallback(async () => {
    const id = ++request.current;
    abort.current?.abort();
    const controller = new AbortController(); abort.current = controller;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/pickup-realtime", { cache: "no-store", signal: controller.signal });
      if(!res.headers.get("content-type")?.includes("application/json"))throw new Error(`Chưa tải được Pickup Realtime (HTTP ${res.status}). Bấm Làm mới để thử lại.`);
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
  const scopedRiders = useMemo(() => filterRiders(data.riders, filters), [data.riders, filters]);
  const riders = useMemo(() => pickupWorkload(scopedRiders, focus, sort, direction), [scopedRiders, focus, sort, direction]);
  const totals = useMemo(() => tab === "riders" ? sum(riders.flatMap(r => r.metrics ? [r.metrics] : [])) : areaTotals, [tab, riders, areaTotals]);
  const riderZoneCount = useMemo(() => new Set(riders.flatMap(r => r.routes)).size, [riders]);
  const missing = data.riders.filter(r => !r.metrics).length;
  const knownTotals = tab === "riders" ? riders.some(r => r.metrics !== null) || (riders.length === 0 && !!data.riderSnapshotAt) : !!data.snapshotAt;
  const pendingTotal = tab === "riders" ? riders.reduce((n,r) => n + (r.metrics ? pendingPickup(r.metrics) : 0),0) : scopedSummary.reduce((n,row) => n + pendingPickup(row),0);
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
  return <div className={s.page}>
    <header className={s.header}>
      <div><p className={s.eyebrow}>SDD OPERATIONS / LIVE PICKUP</p><h1>Pickup Realtime</h1><p>Theo dõi tiến độ lấy hàng. Ưu tiên rider còn việc và đơn cần xử lý.</p></div>
      <div className={s.headerActions}><span className={s.liveStatus} data-stale={data.riderStale || undefined}><i/>{loading ? "Đang cập nhật" : data.riderStale ? "Dữ liệu cần cập nhật" : "Tự cập nhật mỗi phút"}</span><Button onClick={() => void load()} disabled={loading} variant="secondary"><RefreshCcw size={15} className={loading ? "animate-spin" : ""}/>{loading ? "Đang tải…" : "Làm mới"}</Button></div>
    </header>
    <div className={s.sourceLine}><span><Clock3 size={14} aria-hidden="true"/>Rider: <strong>{formatDateTime(data.riderSnapshotAt)}</strong></span><span>{fmt(data.riders.length)} rider · KV1–KV5</span><details><summary>Nguồn &amp; thời điểm cập nhật</summary><div><p>Địa bàn: {formatDateTime(data.snapshotAt)}</p><p>Tuyến gán: {formatDateTime(data.routeSnapshotAt)}</p><p>{data.riderSource === "sdd-web-data" ? `SPX · SDD Web Data · ${fmt(data.taskCount ?? 0)} task` : "Theo snapshot hiện có"}</p></div></details></div>
    {error && <div role="alert" className={s.error}>{error}</div>}
    {!loading && (missing > 0 || !data.snapshotsAligned || data.riderStale) && <div className={s.warning}><Clock3 size={17} className="mt-0.5 shrink-0"/><div>{data.riderStale && <p>Phiên dữ liệu rider đã quá 20 phút hoặc thuộc ngày trước. Đang giữ lần đồng bộ thành công gần nhất.</p>}{missing > 0 && <p><strong>{fmt(missing)} rider chưa có số liệu trong snapshot realtime.</strong> Vẫn hiển thị theo danh sách rider; dấu “—” nghĩa là chưa có dữ liệu.</p>}{!data.snapshotsAligned && <p>Các nguồn đang khác phiên cập nhật. Số liệu địa bàn và rider có thể chưa khớp; chi tiết rider chỉ dùng cùng phiên.</p>}</div></div>}
    <section className={s.areaSection} aria-label="Tổng quan khu vực"><div className={s.sectionHeading}><div><p>ĐIỀU PHỐI THEO ĐỊA BÀN</p><h2>Tiến độ từng khu vực</h2></div><span>Bấm thẻ để lọc rider và zone</span></div>
    <nav aria-label="Phạm vi khu vực" className={s.areas}>
      {(["all", ...PICKUP_AREAS] as const).map(area => {
        const list = data.riders.filter(r => area === "all" || r.area === area), live = list.filter(r => r.metrics).length;
        const metrics = sum(list.flatMap(r => r.metrics ? [r.metrics] : []));
        const tone = area === "all" ? { color: "var(--color-accent)", tint: "var(--color-accent-soft)" } : TONES[area];
        return <button key={area} onClick={() => selectArea(area)} aria-pressed={filters.area === area} style={{ "--area-color": tone.color } as React.CSSProperties} className={s.area}>
          <span className={s.areaLabel}>{area === "all" ? "Toàn bộ KV" : area}{filters.area === area ? <CheckCircle2 size={15} aria-hidden="true"/> : <ArrowRight size={15} aria-hidden="true"/>}</span>
          <strong>{loading && !data.riderSnapshotAt ? "—" : live ? rateLabel(metrics) : "—"}<small>đã lấy</small></strong>
          <div className={s.areaProgress} aria-hidden="true"><i style={{width:`${Math.min(100,rate(metrics))}%`}}/></div>
          <span className={s.areaCount}>{fmt(list.length)} rider · {fmt(live)} có số liệu</span><span className={s.areaPending}>{live ? fmt(list.reduce((n,r)=>n+(r.metrics?pendingPickup(r.metrics):0),0)) : "—"} đơn chờ lấy</span>
        </button>;
      })}
    </nav></section>
    <section aria-label="Tổng tiến độ pickup"><div className={s.scopeHeading}><h2>{tab === "riders" ? "Sản lượng theo rider" : "Sản lượng theo địa bàn"} · {filters.area === "all" ? "KV1–KV5" : filters.area}</h2><span>{tab === "riders" ? "Theo bộ lọc hiện tại · Lượt gán có thể trùng giữa các rider" : "Tổng hợp địa bàn · Không cộng lặp rider chung tuyến"}</span></div><div className={s.kpis}>
      {[{label:"Tổng đơn gán",value:fmt(totals.assigned),icon:Layers3,tone:"blue",sub:`${tab === "riders" ? riderZoneCount : zones.length} zone đang xem`},
        {label:"Đã lấy thành công",value:fmt(totals.picked),icon:CheckCircle2,tone:"green",sub:"Sản lượng đã hoàn thành"},
        {label:"Còn chờ lấy",value:fmt(pendingTotal),icon:Bike,tone:"blue",sub:"Tổng chờ lấy trong phạm vi"},
        {label:"Onhold",value:fmt(totals.onhold),icon:Clock3,tone:"amber",sub:"Cần theo dõi xử lý lại"},
        {label:"Tỷ lệ lấy",value:rateLabel(totals),icon:UsersRound,tone:"purple",sub:"Đã lấy / tổng đơn gán"}].map(item=><article key={item.label} className={s.kpi} data-tone={item.tone}><div><span>{item.label}</span><item.icon size={17} aria-hidden="true"/></div><strong>{knownTotals ? item.value : "—"}</strong><p>{item.sub}</p></article>)}
    </div></section>
    <section className={s.workspace}>
      <div className="flex gap-1 border-b border-slate-100 p-2"><button onClick={() => setTab("riders")} aria-pressed={tab === "riders"} className={cn("flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold", tab === "riders" ? "bg-slate-800 text-white" : "text-slate-500")}><UsersRound size={16}/>Theo rider</button><button onClick={() => setTab("zones")} aria-pressed={tab === "zones"} className={cn("rounded-lg px-4 py-2.5 text-xs font-bold", tab === "zones" ? "bg-slate-800 text-white" : "text-slate-500")}>Theo mã zone</button></div>
      <div className="grid gap-3 border-b border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-2 xl:grid-cols-3">
        <Filter label="Mã zone"><Select value={filters.route} onChange={e => change({route:e.target.value})}><option value="all">Tất cả zone</option>{unique([...areaSummary.map(r=>r.route), ...data.riders.filter(r => filters.area === "all" || r.area === filters.area).flatMap(r=>r.routes)]).map(zone=><option key={zone}>{zone}</option>)}</Select></Filter>
        <Filter label="Phường lấy hàng"><Select value={filters.ward} onChange={e=>change({ward:e.target.value})}><option value="all">Tất cả phường</option>{unique([...areaSummary.map(r=>r.ward), ...data.riders.filter(r => filters.area === "all" || r.area === filters.area).flatMap(r=>r.assignments.map(a=>a.ward))]).map(ward=><option key={ward}>{ward}</option>)}</Select></Filter>
        {tab === "riders" && <><Filter label="COT phụ trách"><Select value={filters.cot} onChange={e=>change({cot:e.target.value})}><option value="all">Cả COT</option><option value="COT1">COT 1</option><option value="COT2">COT 2</option><option value="UNKNOWN">Chưa rõ COT</option></Select></Filter><Filter label="Dữ liệu realtime"><Select value={filters.coverage} onChange={e=>change({coverage:e.target.value})}><option value="all">Toàn bộ rider</option><option value="live">Đã có dữ liệu</option><option value="missing">Chưa có dữ liệu</option></Select></Filter><Filter label="Tìm rider / mã zone"><span className="relative block"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><Input value={filters.query} onChange={e=>change({query:e.target.value})} placeholder="Tên, ID hoặc mã zone…" className="pl-9"/></span></Filter></>}
        <div className="flex items-end"><button onClick={()=>{setFilters(INITIAL);setFocus("all");setSort("assigned");setDirection("desc");setPage(0);}} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-500 hover:text-blue-700">Đặt lại bộ lọc</button></div>
      </div>
      {tab === "riders" && <div className={s.workload}>
        <div className={s.quickFilters} role="group" aria-label="Ưu tiên rider">{([['all','Tất cả'],['pending','Còn chờ lấy'],['onhold','Có Onhold']] as const).map(([value,label])=><button type="button" key={value} aria-pressed={focus===value} onClick={()=>{setFocus(value);if(value!=="all"&&filters.coverage==="missing")change({coverage:"all"});setPage(0);}}>{label}<small>{fmt(scopedRiders.filter(r=>value==='all'||(r.metrics&&(value==='pending'?pendingPickup(r.metrics)>0:r.metrics.onhold>0))).length)}</small></button>)}<button type="button" aria-pressed={filters.coverage==='missing'} onClick={()=>{change({coverage:filters.coverage==='missing'?'all':'missing'});setFocus('all');}}>Thiếu dữ liệu</button></div>
        <div className={s.sort}><label htmlFor="pickup-rider-sort">Sắp xếp</label><Select id="pickup-rider-sort" value={sort} onChange={e=>changeSort(e.target.value as PickupSort)} aria-label="Sắp xếp rider">{RIDER_COLUMNS.filter(c=>c.key).map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</Select><button type="button" className={s.sortDirection} onClick={()=>changeSort(sort,true)} aria-label={`Thứ tự ${direction==="asc"?"tăng":"giảm"} dần; bấm để đảo chiều`}>{direction==="asc"?<ArrowUp size={14} aria-hidden="true"/>:<ArrowDown size={14} aria-hidden="true"/>}{direction==="asc"?"Tăng dần":"Giảm dần"}</button></div>
      </div>}
      {tab === "riders" ? <>
        <div className="flex flex-wrap items-center justify-between gap-2 p-4"><div><h2 className="text-sm font-bold text-slate-900">Rider {filters.area === "all" ? "KV1–KV5" : filters.area} <span className="ml-2 rounded-md bg-slate-100 px-2 py-1 font-mono text-xs">{fmt(riders.length)}</span></h2><p className="mt-2 text-[11px] text-slate-500">KV và COT theo hồ sơ rider. Lọc phường / zone hiển thị sản lượng chi tiết trong phạm vi đó.</p></div><span className="text-[11px] text-slate-400">50 rider / trang</span></div>
        <div className="max-h-[650px] overflow-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="sticky top-0 z-10 bg-slate-100 text-[10px] uppercase tracking-wide text-slate-500"><tr>{RIDER_COLUMNS.map(({label,key},i)=><th key={label} aria-sort={key?(sort===key?(direction==="asc"?"ascending":"descending"):"none"):undefined} className={cn("px-4 py-3 font-bold",i>2 && "text-right")}>{key?<button type="button" className={s.columnSort} data-active={sort===key} onClick={()=>changeSort(key,true)} aria-label={`Sắp xếp theo ${label}`}>{label}{sort===key?(direction==="asc"?<ArrowUp size={13} aria-hidden="true"/>:<ArrowDown size={13} aria-hidden="true"/>):<ArrowUpDown size={13} aria-hidden="true"/>}</button>:label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{pageRiders.map(r => <tr key={r.id} data-onhold={!!r.metrics?.onhold} className="hover:bg-blue-50/30"><td className="px-4 py-4"><strong className="block text-slate-800">{r.name}</strong><span className="mt-1 block font-mono text-[10px] text-slate-400">{r.id}</span></td><td className="px-4 py-3"><AreaBadge area={r.area}/><span className="mt-1.5 block text-[10px] text-slate-500">{r.cot === "UNKNOWN" ? "Chưa rõ COT" : r.cot}</span></td><td className="max-w-80 px-4 py-3"><div className="flex flex-wrap gap-1">{r.routes.length ? r.routes.map(z=><span key={z} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1 font-mono text-[10px] text-slate-600">{z}</span>) : <span className="text-slate-400">Chưa có tuyến được ghi nhận</span>}</div>{r.routeSource === "inventory" && <span className="mt-1.5 block text-[10px] text-blue-600">Tuyến từ gán pickup</span>}</td>{[r.metrics?.assigned,r.metrics?.picked,r.metrics ? pendingPickup(r.metrics) : undefined,r.metrics?.onhold].map((n,i)=><td key={i} className={cn("px-4 py-3 text-right font-mono font-bold", ["text-slate-700","text-emerald-700","text-blue-700","text-rose-600"][i])}>{n === undefined ? "—" : fmt(n)}</td>)}<td className="min-w-32 px-4 py-3 text-right">{r.metrics ? <><strong className="font-mono text-emerald-700">{rateLabel(r.metrics)}</strong><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{width:`${Math.min(100,rate(r.metrics))}%`}}/></div></> : <span className="whitespace-nowrap rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-700">Chưa có dữ liệu</span>}</td></tr>)}{!riders.length && <tr><td colSpan={8} className="p-12 text-center text-slate-400">{loading ? "Đang tải rider…" : "Không có rider khớp bộ lọc."}</td></tr>}</tbody></table></div>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-4 text-xs text-slate-500"><span>{riders.length ? `${currentPage*50+1}–${Math.min((currentPage+1)*50,riders.length)} / ${fmt(riders.length)} rider` : "0 rider"}</span><div className="flex items-center gap-3"><button aria-label="Trang trước" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)} className="rounded border p-1.5 disabled:opacity-30"><ChevronLeft size={15}/></button><span>{currentPage+1} / {pageCount}</span><button aria-label="Trang sau" disabled={currentPage>=pageCount-1} onClick={()=>setPage(currentPage+1)} className="rounded border p-1.5 disabled:opacity-30"><ChevronRight size={15}/></button></div></footer>
      </> : <><div className="p-4 text-sm font-bold text-slate-800">{zones.length} zone · Tổng theo địa bàn lấy hàng</div><div className="max-h-[650px] overflow-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="sticky top-0 bg-slate-100 text-slate-500"><tr>{["Mã zone","KV","Tổng gán","Đã lấy","Onhold","Tỷ lệ"].map((h,i)=><th key={h} className={cn("px-4 py-3",i>1 && "text-right")}>{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{zones.map(z=><tr key={`${z.area}:${z.route}`} className="hover:bg-slate-50"><td className="px-4 py-3 font-mono font-semibold"><button onClick={()=>{change({route:z.route});setTab("riders");}} className="text-left hover:text-blue-700">{z.route}</button></td><td className="px-4">{z.area && <AreaBadge area={z.area}/>}</td>{[fmt(z.assigned),fmt(z.picked),fmt(z.onhold),rateLabel(z)].map((v,i)=><td key={i} className="px-4 text-right font-mono">{v}</td>)}</tr>)}{!zones.length && <tr><td colSpan={6} className="p-12 text-center text-slate-400">{loading ? "Đang tải zone…" : "Không có zone khớp bộ lọc."}</td></tr>}</tbody></table></div></>}
    </section>
  </div>;
}
function AreaBadge({area}:{area:Area}) { return <span style={{color:TONES[area].color,background:TONES[area].tint}} className="inline-block rounded px-2 py-1 font-mono text-[10px] font-bold">{area}</span>; }
function Filter({label,children}:{label:string;children:React.ReactNode}) { return <label className={s.filter}><span>{label}</span>{children}</label>; }
