"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Activity, ArrowUpRight, BarChart3, Clock3, Layers3, PackageCheck, RefreshCcw, Truck } from "lucide-react";
import type { PerformanceResult } from "@/lib/performance/driver-performance";
import type { PickupRider } from "@/lib/pickup/realtime";
import { OPERATING_AREAS, normalizeOperatingArea } from "@/lib/locations/operating-areas";
import { completionRate, type OperationsOverview } from "@/lib/dashboard/operations-overview";
import { riderCotLabel } from "@/components/lmhub-inventory/pickup-inventory-model";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import { SpotlightSheen, useDashboardSpotlight } from "./dashboard-spotlight";
import spotlight from "./dashboard-spotlight.module.css";
import s from "./operations-dashboard.module.css";
import { DashboardVolume } from "./dashboard-volume";
import type { DashboardVolumeData } from "@/lib/dashboard/volume-overview";

type PickupLive = { riders: PickupRider[]; riderSnapshotAt: string | null; snapshotAt: string | null; riderStale?: boolean };
type PickupBacklog = { rows: { area: string; zone: string; cot: string; orders: number }[]; snapshotAt: string | null };
type Source<T> = { data: T | null; error: string | null };
export type DashboardOverviewData = {
  operations: Source<OperationsOverview>; performance: Source<PerformanceResult>;
  pickup: Source<PickupLive>; pickupBacklog: Source<PickupBacklog>; volume: Source<DashboardVolumeData>;
};
const empty: DashboardOverviewData = { operations: { data: null, error: null }, performance: { data: null, error: null }, pickup: { data: null, error: null }, pickupBacklog: { data: null, error: null }, volume: { data: null, error: null } };
const fmt = (n: number | null | undefined) => n == null ? "—" : n.toLocaleString("vi-VN");
const pct = (n: number | null | undefined) => n == null ? "—" : `${n.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
const dayLabel = (date: string) => `${date.slice(8,10)}/${date.slice(5,7)}`;
const stamp = (date: string | null | undefined) => date && Number.isFinite(Date.parse(date)) ? new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(date)) : "Chưa có dữ liệu";

export function OperationsDashboard() {
  const [data, setData] = useState<DashboardOverviewData>(empty);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const request = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  useReportInitialDataLoading("dashboard", loading && !updated);
  const load = useCallback(async () => {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const id = ++request.current;
    setLoading(true);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
    async function source<T>(url: string): Promise<Source<T>> {
      try {
        const res = await fetch(url, { cache: "no-store", signal: abort.signal });
        const payload = await res.json();
        if (!res.ok || payload.success === false) throw new Error(payload.error || "Không tải được dữ liệu");
        return { data: payload as T, error: null };
      } catch (error) {
        return { data: null, error: error instanceof Error ? error.message : "Không tải được dữ liệu" };
      }
    }
    const [operations, performance, pickup, pickupBacklog, volume] = await Promise.all([
      source<OperationsOverview>("/api/dashboard/operations"),
      source<PerformanceResult>(`/api/driver-performance?date=${today}&period=week&pageSize=25`),
      source<PickupLive>("/api/pickup-realtime"),
      source<PickupBacklog>("/api/pickup-inventory?view=zone-board&p_status=Assigned"),
      source<DashboardVolumeData>("/api/dashboard/volume"),
    ]);
    if (id !== request.current || abort.signal.aborted) return;
    setData({ operations, performance, pickup, pickupBacklog, volume });
    setUpdated(new Date().toISOString()); setLoading(false);
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60_000);
    return () => { clearTimeout(initial); clearInterval(timer); controller.current?.abort(); };
  }, [load]);
  useDashboardSpotlight(root, { ready: !loading, version: updated ? Date.parse(updated) : 0, scope: "operations-overview" });
  return <div ref={root} className={spotlight.root}><DashboardOverviewContent data={data} loading={loading} updated={updated} onRefresh={() => void load()} /></div>;
}

export function DashboardOverviewContent({ data, loading, updated, onRefresh }: { data: DashboardOverviewData; loading: boolean; updated: string | null; onRefresh: () => void }) {
  const live = data.operations.data?.live.data;
  const delivery = data.operations.data?.backlog.data;
  const performance = data.performance.data;
  const pickupSource = data.pickup.data;
  const pickup = useMemo(() => {
    if (!pickupSource?.riderSnapshotAt) return null;
    const riders = pickupSource.riders.filter(r => normalizeOperatingArea(r.area));
    const covered = riders.filter(r => r.metrics !== null);
    return { assigned: covered.reduce((n,r) => n + r.metrics!.assigned, 0), picked: covered.reduce((n,r) => n + r.metrics!.picked, 0), onhold: covered.reduce((n,r) => n + r.metrics!.onhold, 0), covered: covered.length, missing: riders.length - covered.length, riders };
  }, [pickupSource]);
  const pickupBacklog = useMemo(() => {
    if (!data.pickupBacklog.data?.snapshotAt) return null;
    const rows = data.pickupBacklog.data.rows.filter(r => normalizeOperatingArea(r.area) && Number.isFinite(Number(r.orders)) && Number(r.orders) > 0);
    const zones = new Map<string, { area: string; label: string; orders: number }>();
    let cot1 = 0, cot2 = 0;
    rows.forEach(r => {
      const orders = Number(r.orders), area = normalizeOperatingArea(r.area)!;
      if (riderCotLabel(r.cot) === "COT2") cot2 += orders; else cot1 += orders;
      const key = `${area}:${r.zone}`;
      const zone = zones.get(key) ?? { area, label: r.zone || "Chưa có zone", orders: 0 }; zone.orders += orders; zones.set(key, zone);
    });
    return { total: cot1 + cot2, cot1, cot2, rows, top: [...zones.values()].sort((a,b) => b.orders - a.orders).slice(0,5) };
  }, [data.pickupBacklog.data]);
  const performanceTotals = performance?.analysis.totals;
  const liveRate = live ? completionRate(live.delivered, live.assigned) : null;
  const pickupRate = pickup ? completionRate(pickup.picked, pickup.assigned) : null;
  const liveError = data.operations.error ?? data.operations.data?.live.error;
  const deliveryError = data.operations.error ?? data.operations.data?.backlog.error;
  const issues = [liveError && "Live Dashboard", data.performance.error && "Rider Performance", data.pickup.error && "Live Pickup", data.pickupBacklog.error && "Pickup Backlog", deliveryError && "Delivery Backlog"].filter(Boolean);
  return <div className={s.dashboard} aria-busy={loading}>
    <header className={s.header}>
      <div><p className={s.eyebrow}>SDD · OPERATIONS INTELLIGENCE</p><h1>Operations Overview</h1><p>Tiến độ, hiệu suất và tồn giao nhận trong một màn hình.</p></div>
      <div className={s.headerActions}><span><Clock3 size={14} />{updated ? `Đã kiểm tra ${stamp(updated)}` : "Đang tổng hợp dữ liệu"}</span><button type="button" onClick={onRefresh} disabled={loading}><RefreshCcw size={15} className={loading ? s.spinning : ""} />{loading ? "Đang tải" : "Làm mới"}</button></div>
    </header>
    <nav className={s.sourceNav} aria-label="Các trang dữ liệu nguồn">{[["Volume","#volume-overview"],["Live Dashboard","/realtime-dashboard"],["Rider Performance","/performance"],["Live Pickup","/pickup-realtime"],["Pickup Backlog","/lmhub-inventory"],["Delivery Backlog","/inventory-delivery"]].map(([label,href]) => <Link key={href} href={href}>{label}<ArrowUpRight size={13}/></Link>)}</nav>
    <div className={s.scope}><span><i/> KV1–KV5</span><span>Snapshot mới nhất của từng nguồn · Hiệu suất 7 ngày gần nhất</span><span>Tự cập nhật mỗi 60 giây · UTC+7</span></div>
    {!!issues.length && <div className={s.notice} role="status">Chưa tải được: {issues.join(", ")}. Các phần còn lại vẫn hiển thị dữ liệu đã tải.<button type="button" disabled={loading} onClick={onRefresh}>Thử lại</button></div>}

    <section className={s.kpis} aria-label="Chỉ số điều hành">
      <Kpi label="Delivery completion" value={pct(liveRate)} detail={`${fmt(live?.delivered)} / ${fmt(live?.assigned)} đơn gán`} href="/realtime-dashboard" icon={<Truck size={19}/>} tone="blue" />
      <Kpi label="Pickup completion" value={pct(pickupRate)} detail={`${fmt(pickup?.picked)} / ${fmt(pickup?.assigned)} đơn gán`} href="/pickup-realtime" icon={<PackageCheck size={19}/>} tone="teal" />
      <Kpi label="Pickup backlog" value={fmt(pickupBacklog?.total)} detail="Đơn Assigned chờ lấy · snapshot tồn" href="/lmhub-inventory" icon={<Layers3 size={19}/>} tone="purple" />
      <Kpi label="Delivery backlog" value={fmt(delivery?.total)} detail="Đơn đang tồn giao · snapshot tồn" href="/inventory-delivery" icon={<Truck size={19}/>} tone="amber" />
    </section>

    <SectionTitle number="01" title="Volume Overview" sub="Sản lượng giao nhận · ngày gần nhất và xu hướng 7/14 ngày" />
    <section id="volume-overview" aria-label="Tổng hợp Volume"><DashboardVolume source={data.volume} loading={loading}/></section>

    <SectionTitle number="02" title="Live Operations" sub="Tiến độ hiện tại" />
    <div className={s.twoColumns}>
      <Panel title="Delivery progress" eyebrow="LIVE DASHBOARD" href="/realtime-dashboard" icon={<Activity size={17}/>}>
        <SourceStatus error={liveError} at={data.operations.data?.live.snapshotAt} loading={loading} />
        <div className={s.progressLead}><strong>{pct(liveRate)}</strong><span>Đã giao thành công<small>{data.operations.data?.live.workDate ? `Ngày vận hành ${dayLabel(data.operations.data.live.workDate)}` : "Chưa có ngày vận hành"}</small></span></div>
        <Progress done={live?.delivered} total={live?.assigned} tone="blue" label="Tỷ lệ giao thành công"/>
        <Metrics items={[["Đã gán",live?.assigned],["Đã giao",live?.delivered],["Đang giao",live?.delivering],["Failed",live?.failed]]}/>
        <div className={s.panelFooter}><span>{fmt(live?.riders)} rider có dữ liệu</span><span>{fmt(live?.idleRiders)} rider còn đơn và ngừng giao ≥60 phút</span></div>
      </Panel>
      <Panel title="Pickup progress" eyebrow="LIVE PICKUP" href="/pickup-realtime" icon={<PackageCheck size={17}/>}>
        <SourceStatus error={data.pickup.error} at={pickupSource?.riderSnapshotAt} loading={loading} stale={pickupSource?.riderStale}/>
        <div className={s.progressLead} data-tone="teal"><strong>{pct(pickupRate)}</strong><span>Đã lấy thành công<small>Tổng theo rider KV1–KV5</small></span></div>
        <Progress done={pickup?.picked} total={pickup?.assigned} tone="teal" label="Tỷ lệ lấy thành công"/>
        <Metrics items={[["Đã gán",pickup?.assigned],["Đã lấy",pickup?.picked],["Chờ lấy",pickup ? Math.max(0,pickup.assigned-pickup.picked-pickup.onhold) : null],["On Hold",pickup?.onhold]]}/>
        <div className={s.panelFooter}><span>{fmt(pickup?.covered)} rider có dữ liệu</span><span>{fmt(pickup?.missing)} rider chưa có số realtime</span></div>
      </Panel>
    </div>

    <SectionTitle number="03" title="Rider Performance" sub={performance ? `${dayLabel(performance.analysis.start)}–${dayLabel(performance.analysis.end)} · 7 ngày` : "Hiệu suất 7 ngày gần nhất"}/>
    <div className={s.performanceGrid}>
      <Panel title="Xu hướng hoàn thành" eyebrow="7-DAY TREND" href="/performance" icon={<BarChart3 size={17}/>}>
        {data.performance.error ? <p className={s.error}>Không tải được hiệu suất. Thử làm mới.</p> : null}
        <div className={s.performanceTotals}><div><span>Delivery</span><strong>{pct(performanceTotals ? completionRate(performanceTotals.delivery_delivered,performanceTotals.delivery_assigned) : null)}</strong><small>{fmt(performanceTotals?.delivery_delivered)} / {fmt(performanceTotals?.delivery_assigned)} đơn</small></div><div><span>Pickup</span><strong>{pct(performanceTotals ? completionRate(performanceTotals.pickup_picked,performanceTotals.pickup_assigned) : null)}</strong><small>{fmt(performanceTotals?.pickup_picked)} / {fmt(performanceTotals?.pickup_assigned)} đơn</small></div><div><span>Rider phát sinh</span><strong>{fmt(performance?.analysis.riderCount)}</strong><small>Trong cả kỳ 7 ngày</small></div></div>
        <div className={s.trendLegend}><span><i data-tone="blue"/>Delivery</span><span><i data-tone="teal"/>Pickup</span><span>Trục tỷ lệ: 0–100%</span></div>
        <div className={s.trend} role="group" aria-label="Tỷ lệ hoàn thành delivery và pickup theo ngày">
          {(performance?.analysis.daily ?? []).map(row => {
            const deliveryRate = "missing" in row ? null : completionRate(row.delivery_delivered,row.delivery_assigned);
            const pickupRate = "missing" in row ? null : completionRate(row.pickup_picked,row.pickup_assigned);
            return <div key={row.date} className={s.trendDay}><div className={s.trendValues}><span>{pct(deliveryRate)}</span><span>{pct(pickupRate)}</span></div><div className={s.barPair} aria-hidden="true"><i data-tone="blue" style={{height:`${Math.min(100,Math.max(0,deliveryRate ?? 0))}%`}}/><i data-tone="teal" style={{height:`${Math.min(100,Math.max(0,pickupRate ?? 0))}%`}}/></div><span>{dayLabel(row.date)}</span></div>;
          })}
          {!performance && <p className={s.empty}>{loading ? "Đang tải xu hướng…" : "Chưa có dữ liệu hiệu suất"}</p>}
        </div>
        <p className={s.caption}>Tỷ lệ = số hoàn thành / số được gán. Ngày thiếu dữ liệu hiển thị “—”; tỷ lệ trên 100% giữ số thực và giới hạn chiều cao cột.</p>
      </Panel>
      <Panel title="Phân bố hiệu suất rider" eyebrow="DELIVERY SUCCESS RATE" href="/performance">
        <p className={s.caption}>Phân nhóm theo tỷ lệ delivery trong cả kỳ.</p>
        <div className={s.distribution}>{performance?.analysis.distribution.map(bin => <div key={bin.label}><span>{bin.label}</span><div><i style={{width:`${performance.analysis.riderCount ? bin.count/performance.analysis.riderCount*100 : 0}%`}}/></div><strong>{fmt(bin.count)}</strong></div>)}</div>
        <div className={s.panelFooter}><span>{fmt(performance?.analysis.withoutDelivery)} rider không có đơn delivery gán</span></div>
      </Panel>
    </div>

    <SectionTitle number="04" title="Backlog Control" sub="Hai nguồn tồn độc lập · không cộng với đơn đang giao/đang lấy"/>
    <div className={s.twoColumns}>
      <Panel title="Pickup Backlog" eyebrow="ASSIGNED · CHỜ LẤY" href="/lmhub-inventory" icon={<Layers3 size={17}/>}>
        <SourceStatus error={data.pickupBacklog.error} at={data.pickupBacklog.data?.snapshotAt} loading={loading}/>
        <Metrics items={[["Tổng tồn",pickupBacklog?.total],["COT 1",pickupBacklog?.cot1],["COT 2",pickupBacklog?.cot2]]}/>
        <h3 className={s.listTitle}>Zone có nhiều tồn nhất</h3>
        <Ranking rows={pickupBacklog?.top ?? []} ready={!!pickupBacklog} empty="Chưa ghi nhận tồn pickup"/>
      </Panel>
      <Panel title="Delivery Backlog" eyebrow="TỒN GIAO HÀNG" href="/inventory-delivery" icon={<Truck size={17}/>}>
        <SourceStatus error={deliveryError} at={data.operations.data?.backlog.snapshotAt} loading={loading}/>
        <Metrics items={[["Tổng tồn",delivery?.total],["COT 1",delivery?.cot1],["COT 2",delivery?.cot2]]}/>
        {!!delivery?.unknownCot && <p className={s.caption}>{fmt(delivery.unknownCot)} đơn chưa xác định COT.</p>}
        <h3 className={s.listTitle}>Phường có nhiều tồn nhất</h3>
        <Ranking rows={delivery?.topWards.map(r => ({ area:r.area,label:`${r.ward} · ${r.district}`,orders:r.orders })) ?? []} ready={!!delivery} empty="Chưa ghi nhận tồn delivery"/>
      </Panel>
    </div>

    <SectionTitle number="05" title="Area Overview" sub="So sánh 5 khu vực · tỷ lệ live và backlog từ các snapshot riêng"/>
    <section className={s.panel} aria-label="Tổng hợp theo khu vực"><div className={s.tableWrap}><table className={s.areaTable}><thead><tr><th>Khu vực</th><th>Delivery live<small>Đã giao / gán</small></th><th>Pickup live<small>Đã lấy / gán theo rider</small></th><th>Delivery rate<small>Snapshot giao</small></th><th>Pickup rate<small>Snapshot lấy</small></th><th>Pickup backlog</th><th>Delivery backlog</th></tr></thead><tbody>{OPERATING_AREAS.map(area => {
      const d = live?.areas.find(r=>r.area===area);
      const pickupRiders = pickup?.riders.filter(r=>r.area===area && r.metrics) ?? [];
      const p = pickupRiders.length ? pickupRiders.reduce((a,r)=>({assigned:a.assigned+r.metrics!.assigned,picked:a.picked+r.metrics!.picked}),{assigned:0,picked:0}) : null;
      const pb = pickupBacklog ? pickupBacklog.rows.filter(r=>normalizeOperatingArea(r.area)===area).reduce((n,r)=>n+Number(r.orders),0) : null;
      const db = delivery?.areas.find(r=>r.area===area)?.orders;
      return <tr key={area}><th><span className={s.areaBadge}>{area}</span></th><td>{d ? `${fmt(d.delivered)} / ${fmt(d.assigned)}` : "—"}</td><td>{p ? `${fmt(p.picked)} / ${fmt(p.assigned)}` : "—"}</td><td><Rate value={d ? completionRate(d.delivered,d.assigned):null} tone="blue"/></td><td><Rate value={p ? completionRate(p.picked,p.assigned):null} tone="teal"/></td><td>{fmt(pb)}</td><td>{fmt(db)}</td></tr>;
    })}</tbody></table></div></section>
  </div>;
}

function SectionTitle({number,title,sub}:{number:string;title:string;sub:string}) { return <div className={s.sectionHeading}><div><span>{number}</span><h2>{title}</h2></div><p>{sub}</p></div>; }
function Kpi({label,value,detail,href,icon,tone}:{label:string;value:string;detail:string;href:string;icon:ReactNode;tone:string}) { return <Link className={s.kpi} href={href} data-tone={tone} data-dashboard-spotlight={label} data-spotlight-value={value}><div><span>{label}</span>{icon}</div><strong>{value}</strong><p>{detail}</p><ArrowUpRight className={s.kpiArrow} size={15}/><SpotlightSheen/></Link>; }
function Panel({title,eyebrow,href,icon,children}:{title:string;eyebrow:string;href:string;icon?:ReactNode;children:ReactNode}) { return <section className={s.panel}><div className={s.panelHeading}><div><p className={s.eyebrow}>{eyebrow}</p><h2>{icon}{title}</h2></div><Link href={href} aria-label={`Xem chi tiết ${title}`}>Chi tiết<ArrowUpRight size={14}/></Link></div>{children}</section>; }
function SourceStatus({at,error,loading,stale}:{at?:string|null;error?:string|null;loading:boolean;stale?:boolean}) { return <p className={error || stale ? s.error : s.sourceStatus}>{error ? "Không tải được nguồn này. Thử làm mới." : `${loading && !at ? "Đang tải…" : `Snapshot ${stamp(at)}`}${stale ? " · Dữ liệu rider chưa mới" : ""}`}</p>; }
function Metrics({items}:{items:[string,number|null|undefined][]}) { return <dl className={s.metrics}>{items.map(([label,n])=><div key={label}><dt>{label}</dt><dd>{fmt(n)}</dd></div>)}</dl>; }
function Progress({done,total,tone,label}:{done?:number;total?:number;tone:string;label:string}) { const rate=done!=null&&total!=null?completionRate(done,total):null;return <div className={s.progress} data-tone={tone} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={rate==null?undefined:Math.min(100,Math.max(0,rate))} aria-valuetext={pct(rate)}><i style={{width:`${Math.min(100,Math.max(0,rate??0))}%`}}/></div>; }
function Ranking({rows,ready,empty}:{rows:{area:string;label:string;orders:number}[];ready:boolean;empty:string}) {const max=Math.max(...rows.map(r=>r.orders),1);return <div className={s.ranking}>{rows.map((r,index)=><div key={`${r.area}:${r.label}`}><span className={s.rankIndex}>{index+1}</span><div><span>{r.label}<small>{r.area}</small></span><div className={s.rankTrack}><i style={{width:`${r.orders/max*100}%`}}/></div></div><strong>{fmt(r.orders)}</strong></div>)}{!rows.length&&<p className={s.empty}>{ready?empty:"Chưa có dữ liệu nguồn"}</p>}</div>; }
function Rate({value,tone}:{value:number|null;tone:string}) {return <div className={s.rate} data-tone={tone}><span>{pct(value)}</span><i><b style={{width:`${Math.min(100,Math.max(0,value??0))}%`}}/></i></div>; }
