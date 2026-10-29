"use client";
import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpRight, CheckCheck, ChevronDown, Clock3, PackageCheck, Users } from "lucide-react";
import { HUB_METRICS, HUB_SHEET_ID, type HubSheetData } from "@/lib/dashboard/hub-sheet";
import type { HubRoster } from "@/lib/dashboard/hub-roster";
import type { HubFc } from "@/lib/dashboard/hub-fc";
import type { RiderHiring } from "@/lib/dashboard/rider-hiring";
import s from "./dashboard-hub-sheet.module.css";

const primary = [
  { key: "lm_hub_inbounded_order_qty_eod", label: "Inbound", note: "Đã nhập hub", icon: ArrowDownToLine, tone: "blue" },
  { key: "Picked", label: "Picked", note: "Đã lấy hàng", icon: PackageCheck, tone: "blue" },
  { key: "lm_hub_delivered_order_qty_eod", label: "Delivered", note: "Đã giao thành công", icon: CheckCheck, tone: "green" },
  { key: "pending_outbound", label: "Pending Outbound", note: "Chờ xuất hub", icon: Clock3, tone: "amber" },
  { key: "lm_hub_total_driver_qty_eod", label: "Total Driver", note: "Tài xế trong snapshot", icon: Users, tone: "neutral" },
];
const groups = [
  { title: "Luồng hàng", keys: ["Outbound", "pending_inbound", "Total FM Inbound", "pending_pickup_total", "handover"] },
  { title: "Trạng thái giao", keys: ["backlog_d0", "lm_hub_fleet_received_in_system_order_qty_td", "lm_hub_fleet_delivering_in_system_order_qty_eod", "lm_hub_fleet_onhold_in_system_order_qty_eod"] },
  { title: "Pickup backlog", keys: ["pending_pickup_from_seller_backlog", "pending_pickup_from_seller_backlog_1_2_days", "pending_pickup_from_seller_backlog_3_5_days", "pending_pickup_from_seller_backlog_gt_5_days"] },
];

export function useHubSheet(refreshKey: number) {
  const [data, setData] = useState<(HubSheetData & { roster?: { data: HubRoster | null; error: string | null }; fc?: { data: HubFc | null; error: string | null }; hiring?: { data: RiderHiring | null; error: string | null } }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function load(force = false) {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/dashboard/hub-sheet", { cache: "no-store", headers: force ? { "x-dashboard-refresh": "1" } : undefined, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]) });
        const payload = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) throw Error(payload.error || "Không tải được dữ liệu hub");
        setData(payload); setError(null);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Không tải được dữ liệu hub"); }
      finally { inFlight = false; }
    }
    void load(refreshKey > 0);
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 60000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [refreshKey]);
  return { data, error };
}

export function DashboardHubSheet({ source }: { source: ReturnType<typeof useHubSheet> }) {
  const { data, error } = source;
  const value = (key: string) => data?.totals[key]?.toLocaleString("vi-VN") ?? "—";
  const roster = data?.roster?.data;
  const people = (n: number | null | undefined) => n?.toLocaleString("vi-VN") ?? "—";
  return <section id="hub-overview" className={s.panel} aria-label="Hub Overview">
    <header className={s.header}>
      <div><p className={s.eyebrow}>TỔNG QUAN VẬN HÀNH</p><h2>Hub Overview</h2><p className={s.station}>{data ? data.stations.map(r => r.stationName).join(" · ") : "Đang tải dữ liệu hub…"}</p></div>
      <div className={s.meta}><span className={s.date}>{data ? `Ngày ${data.date.split("-").reverse().join("/")}` : "Đang tải…"}</span><a href={`https://docs.google.com/spreadsheets/d/${HUB_SHEET_ID}/edit#range=dashboard!A1`} target="_blank" rel="noreferrer">Google Sheets <ArrowUpRight size={14} aria-hidden="true" /></a></div>
    </header>
    {error && <p className={s.error} role="status">{error}{data ? " · Đang giữ snapshot trước đó." : ""}</p>}
    <div className={s.kpis}>{primary.map(({key,label,note,icon:Icon,tone}) => <article key={key} className={s.kpi} data-tone={tone}><div className={s.label}><span>{label}</span><Icon size={17} aria-hidden="true" /></div><strong>{value(key)}<small>{key.includes("driver") ? "người" : "đơn"}</small></strong><p>{note}</p></article>)}</div>
    <section className={s.staffing} aria-label="Nhân sự trong ca hiện tại">
      <div className={s.staffingHeader}><div><h3><Users size={16} aria-hidden="true" />Nhân sự trong ca hiện tại</h3><p>{roster ? `Ca theo giờ Việt Nam · ${new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }).format(new Date(roster.checkedAt))} · ${roster.today.split("-").reverse().join("/")}` : "Đang đọc Roster Shifts D0…"}</p></div><a href={`https://docs.google.com/spreadsheets/d/${HUB_SHEET_ID}/edit#range='Roster%20Shifts%20D0'!A1`} target="_blank" rel="noreferrer">Nguồn roster <ArrowUpRight size={14} aria-hidden="true" /></a></div>
      {data?.roster?.error && <p className={s.error} role="status">{data.roster.error}</p>}
      {roster && !roster.active && <p className={s.error} role="status">Chưa có roster cho hôm nay. Tổng ngày bên dưới thuộc ngày {roster.date}.</p>}
      <div className={s.staffingBody}>
        <div className={s.staffingTotal}><span>TỔNG TRONG CA</span><strong>{people(roster?.active?.actual_people)}<small>người</small></strong><p>{roster ? `${roster.activeShifts.length} ca đang diễn ra` : "Chờ dữ liệu ca"}</p><dl><div><dt>Kế hoạch trong ca</dt><dd>{people(roster?.active?.planned_people)}</dd></div><div><dt>Tổng ghi nhận cả ngày</dt><dd>{people(roster?.daily.actual_people)}</dd></div></dl></div>
        <div className={s.staffingBreakdown}><table><caption>Cơ cấu FTE, OS, BPO trong ca và cả ngày</caption><thead><tr><th scope="col">Nhóm nhân sự</th><th scope="col">Trong ca <small>hiện tại</small></th><th scope="col">Cả ngày <small>{roster ? roster.date.split("-").reverse().join("/") : "—"}</small></th></tr></thead><tbody>{([ ["actual_fte", "FTE"], ["actual_os", "OS"], ["actual_bpo", "BPO"] ] as const).map(([key,label]) => <tr key={key}><th scope="row"><i data-group={label} aria-hidden="true" />{label}</th><td>{people(roster?.active?.[key])}</td><td>{people(roster?.daily[key])}</td></tr>)}</tbody></table></div>
      </div>
      {roster && <details className={s.rosterDetails}><summary>{roster.activeShifts.length} ca đang diễn ra · Xem cách tính</summary><p>{roster.activeShifts.length ? roster.activeShifts.map(r => r.shift).join(" · ") : "Không có ca diễn ra theo lịch nguồn."}</p><p>Tổng theo các cột actual trong roster, chưa xác nhận có mặt trực tiếp và chưa loại trùng người giữa các ca. Ca kết thúc được loại khỏi tổng hiện tại; ca qua đêm tính theo ngày bắt đầu.</p><p>Snapshot roster: {roster.fetchedAt ?? "chưa có thời gian"} · UTC+7. Tổng ngày cộng các ca thuộc ngày {roster.date}.</p></details>}
    </section>
    <details className={s.details}><summary><span>Chi tiết vận hành <small>Luồng hàng · Trạng thái giao · Pickup backlog</small></span><ChevronDown size={18} aria-hidden="true" /></summary><div className={s.groups}>{groups.map(group => <section key={group.title}><h3>{group.title}</h3><dl>{group.keys.map(key => <div key={key}><dt>{HUB_METRICS.find(m => m[0] === key)?.[1]}</dt><dd>{value(key)}</dd></div>)}</dl></section>)}</div></details>
    <footer className={s.footer}><span><Clock3 size={13} aria-hidden="true" />{data ? data.stations.map(r => r.fetchedAt ? `Nguồn cập nhật ${r.fetchedAt} · UTC+7` : "Nguồn chưa có thời gian cập nhật").join(" · ") : "Chờ snapshot nguồn"}</span><span>Hub: 1 phút · Roster: 5 phút · FC: 15 phút</span></footer>
  </section>;
}
