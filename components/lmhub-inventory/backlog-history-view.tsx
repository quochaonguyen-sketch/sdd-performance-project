"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, Clock3, Maximize2, RefreshCcw, X } from "lucide-react";
import { readJsonResponse } from "@/lib/http/json-response";
import { hourlyValue, vietnamDay, type BacklogCot, type BacklogHourlyDay, type BacklogSource } from "@/lib/dashboard/backlog-history";
import { BacklogTrendChart } from "./backlog-hourly-charts";
import styles from "./backlog-history.module.css";

const fmt = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("vi-VN");
const hh = (hour: number) => `${String(hour).padStart(2, "0")}h`;
const stamp = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
const names = { pickup: "Pickup", delivery: "Delivery" };
const statuses: Record<string, string> = { CAPTURED: "Đã chốt", PROVISIONAL: "Tạm tính", FUTURE: "Chưa đến giờ", PENDING: "Chờ chốt", QUEUED: "Đang lấy nguồn", MISSED: "Lỡ mốc chốt", FAILED: "Lấy nguồn lỗi" };

async function read(source: BacklogSource, day: string, signal: AbortSignal): Promise<BacklogHourlyDay> {
  const response = await fetch(`/api/backlog-history?${new URLSearchParams({ source, day, mode: "hourly" })}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]), cache: "no-store" });
  const payload = await readJsonResponse(response, "Lịch sử tồn");
  if (!response.ok) throw new Error(payload.error ?? "Không tải được lịch sử tồn.");
  return payload;
}

export async function loadBacklogHistory(day: string, signal: AbortSignal) {
  const kinds = ["pickup", "delivery"] as const;
  const results = await Promise.allSettled(kinds.map(kind => read(kind, day, signal)));
  const daily: Partial<Record<BacklogSource, BacklogHourlyDay>> = {}, errors: string[] = [];
  results.forEach((entry, index) => {
    if (entry.status === "fulfilled") daily[kinds[index]] = entry.value;
    else errors.push(`${names[kinds[index]]}: ${entry.reason instanceof Error ? entry.reason.message : "Không tải được dữ liệu."}`);
  });
  return { day, daily, errors };
}

export function BacklogHistoryView({ initialSource = "pickup" }: { initialSource?: BacklogSource }) {
  const [source, setSource] = useState(initialSource);
  const [day, setDay] = useState(vietnamDay);
  const [area, setArea] = useState("");
  const [cot, setCot] = useState<BacklogCot>("orders");
  const [result, setResult] = useState<{ day: string; daily: Partial<Record<BacklogSource, BacklogHourlyDay>>; errors: string[] }>({ day: "", daily: {}, errors: [] });
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [hour, setHour] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (day !== vietnamDay()) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") setVersion(value => value + 1); }, 60_000);
    return () => clearInterval(timer);
  }, [day]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      const next = await loadBacklogHistory(day, controller.signal);
      if (controller.signal.aborted) return;
      setResult(next);
      setLoading(false);
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [day, version]);
  useEffect(() => { if (expanded) dialog.current?.showModal(); }, [expanded]);

  const daily = useMemo(() => result.day === day ? result.daily : {}, [result, day]);
  const current = daily[source];
  const observed = useMemo(() => current?.hours.filter(point => point.snapshot_id) ?? [], [current]);
  const latest = observed.at(-1);
  const peak = observed.length ? Math.max(...observed.map(point => hourlyValue(point, cot, area) ?? 0)) : null;
  const selected = hour ?? latest?.hour ?? null;
  const areas = useMemo(() => latest?.areas.filter(row => !area || row.area === area).slice().sort((a, b) => b[cot] - a[cot]) ?? [], [latest, area, cot]);
  const sourceError = result.day === day && result.errors.some(error => error.startsWith(`${names[source]}:`));

  return <div className={styles.page}>
    <header className={styles.header}><h1>Backlog History</h1><div className={styles.headerActions}>
      <Link href={source === "pickup" ? "/lmhub-inventory" : "/inventory-delivery"}>Tồn hiện tại<ArrowUpRight size={15} aria-hidden="true"/></Link>
      <button type="button" disabled={loading} onClick={() => setVersion(value => value + 1)}><RefreshCcw size={16} aria-hidden="true" className={loading ? styles.spinning : undefined}/>{loading ? "Đang tải…" : "Làm mới"}</button>
    </div></header>

    <div className={styles.toolbar}>
      <div className={styles.sourceTabs} role="group" aria-label="Chọn nguồn lịch sử tồn">{(["pickup", "delivery"] as const).map(kind => <button type="button" key={kind} aria-pressed={source === kind} onClick={() => { setSource(kind); setHour(null); }}>{names[kind]}</button>)}</div>
      <label>Ngày xem<input type="date" max={vietnamDay()} value={day} required onChange={event => { if (event.target.value) { setDay(event.target.value); setHour(null); } }}/></label>
      <label>Khu vực<select value={area} onChange={event => setArea(event.target.value)}><option value="">Tất cả khu vực</option>{[1, 2, 3, 4, 5].map(number => <option key={number}>KV{number}</option>)}</select></label>
      <label>COT<select value={cot} onChange={event => setCot(event.target.value as BacklogCot)}><option value="orders">Tất cả COT</option><option value="cot1">COT 1</option><option value="cot2">COT 2</option><option value="other">Chưa rõ COT</option></select></label>
    </div>
    {result.day === day && result.errors.length > 0 && <p role="alert" className={styles.error}>{result.errors.join(" · ")}</p>}

    <section className={styles.overview} aria-label="Tổng hợp lịch sử tồn" aria-busy={loading}>
      <div><p>TỒN {names[source].toLocaleUpperCase("en")}</p><div className={styles.total}><strong>{fmt(hourlyValue(latest, cot, area))}</strong><span>đơn</span></div>
        <span className={styles.context}>{day.split("-").reverse().join("/")} · {area || "Tất cả khu vực"}{latest ? ` · ${hh(latest.hour)} ${latest.is_final ? "đã chốt" : "tạm tính"}` : loading ? " · Đang tải" : sourceError ? " · Chưa tải được nguồn" : " · Chưa có dữ liệu"}</span>
      </div>
      <div className={styles.overviewStats}><div><span>Đỉnh trong ngày</span><strong>{fmt(peak)}</strong></div><div><span>Giờ đã chốt</span><strong>{current ? observed.filter(point => point.is_final).length : "—"}<small> / 24</small></strong></div></div>
    </section>

    <div className={styles.analysis}>
      <section className={styles.panel} aria-label="Biểu đồ lịch sử tồn">
        <div className={styles.panelHeading}><h2>Diễn biến tồn trong ngày</h2><button type="button" aria-label="Phóng to biểu đồ" onClick={() => setExpanded(true)}><Maximize2 size={16} aria-hidden="true"/></button></div>
        <div className={styles.legend}><span><i data-source="pickup"/>Pickup</span><span><i data-source="delivery"/>Delivery</span><small>Nét đứt: tạm tính · Khoảng trống: chưa có dữ liệu</small></div>
        <BacklogTrendChart daily={daily} active={source} cot={cot} area={area} selected={selected} onSelect={setHour}/>
      </section>
      <section className={styles.panel} aria-label="Tồn gần nhất theo khu vực">
        <div className={styles.panelHeading}><h2>Theo khu vực</h2><span>{latest ? hh(latest.hour) : "—"}</span></div>
        <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Bảng tồn theo khu vực"><table><thead><tr><th scope="col">Khu vực</th><th scope="col">Đơn tồn</th></tr></thead><tbody>{areas.map(row => <tr key={row.area}><th scope="row">{row.area}</th><td>{fmt(row[cot])}</td></tr>)}</tbody></table></div>
        {!latest && <p className={styles.empty}>{loading ? "Đang tải dữ liệu…" : sourceError ? "Không tải được nguồn này. Nhấn Làm mới để thử lại." : "Chưa có dữ liệu trong ngày này."}</p>}
        {latest && <p className={styles.note}>Nguồn cập nhật {stamp(latest.source_snapshot_at)} · {latest.is_final ? "Đã chốt" : "Tạm tính"}</p>}
      </section>
    </div>

    <details className={styles.checkpoints}><summary><span><Clock3 size={16} aria-hidden="true"/>Trạng thái ghi nhận</span><ChevronDown size={16} aria-hidden="true"/></summary><div className={styles.checkpointBody}>
      {current?.checkpoints.map(point => <div className={styles.checkpoint} key={point.scheduled_for}><strong>{stamp(point.scheduled_for)}</strong><span>{statuses[point.status] ?? point.status}</span></div>)}
      {!current?.checkpoints.length && <p className={styles.note}>{loading ? "Đang tải trạng thái…" : sourceError ? "Không tải được trạng thái nguồn." : "Chưa có mốc ghi nhận."}</p>}
      <p className={styles.note}>Giờ Việt Nam. “—” là chưa có dữ liệu; 0 là đã ghi nhận không có tồn.</p>
    </div></details>
    {expanded && <dialog ref={dialog} className={styles.dialog} aria-labelledby="backlog-chart-title" onClose={() => setExpanded(false)}>
      <div className={styles.panelHeading}><h2 id="backlog-chart-title">Lịch sử tồn · {day}</h2><button type="button" aria-label="Đóng biểu đồ" autoFocus onClick={() => dialog.current?.close()}><X size={18} aria-hidden="true"/></button></div>
      <BacklogTrendChart daily={daily} active={source} cot={cot} area={area} selected={selected} onSelect={setHour} large/>
    </dialog>}
  </div>;
}
