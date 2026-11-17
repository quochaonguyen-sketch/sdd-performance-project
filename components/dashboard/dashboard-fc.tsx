"use client";
import { useState } from "react";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { compareHubInbound, type HubFc } from "@/lib/dashboard/hub-fc";
import { HUB_SHEET_ID, type HubSheetData } from "@/lib/dashboard/hub-sheet";
import s from "./dashboard-fc.module.css";

const fmt = (n: number | null | undefined) => n?.toLocaleString("vi-VN") ?? "—";
const signedOrders = new Intl.NumberFormat("vi-VN", { signDisplay: "exceptZero" });
const signedPercent = new Intl.NumberFormat("vi-VN", { style: "percent", signDisplay: "exceptZero", maximumFractionDigits: 1 });
const dateLabel = (date: string) => date.split("-").reverse().join("/");
const direction = (delta: number | null) => delta === null || delta === 0 ? undefined : delta > 0 ? "above" : "below";

export function DashboardFc({ source, hub }: { source?: { data: HubFc | null; error: string | null }; hub?: Pick<HubSheetData, "date" | "totals"> | null }) {
  const [month, setMonth] = useState("");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const data = source?.data;
  const snapshotDate = hub && hub.date <= today ? hub.date : today;
  const snapshotMonth = snapshotDate.slice(0, 7);
  const selectedMonth = data?.months.includes(month) ? month : data?.months.includes(snapshotMonth) ? snapshotMonth : data?.months[0] ?? "";
  const rows = data?.rows.filter(r => r.date.startsWith(selectedMonth)) ?? [];
  const forecast = data?.rows.find(row => row.date === snapshotDate);
  const current = compareHubInbound({ date: snapshotDate, total: forecast?.total ?? null }, hub, today);
  const loading = !data && !source?.error;
  const scale = Math.max(1, forecast?.total ?? 0, current.actual ?? 0);
  const values = [
    { key: "forecast", label: "Dự báo FC", value: forecast?.total ?? null },
    { key: "actual", label: "Thực tế nhập hub", value: current.actual },
  ];

  return <>
    <section id="fc-overview" className={`${s.panel} ${s.overview}`} aria-labelledby="fc-overview-title" aria-busy={loading}>
      <header className={s.header}>
        <div><h3 id="fc-overview-title">FC so với thực tế</h3><p>Sản lượng nhập hub HCM</p></div>
        {!loading && (!source?.error || current.actual !== null) && <div className={s.date}>
          <CalendarDays size={15} aria-hidden="true" />
          <time dateTime={snapshotDate}>{dateLabel(snapshotDate)}</time>
        </div>}
      </header>
      {loading ? <div className={s.loading}>
        <p role="status">Đang tải dự báo FC và sản lượng thực tế…</p>
        <div className={s.summarySkeleton} aria-hidden="true"><i /><i /><i /></div>
      </div> : <div className={s.overviewBody}>
        {source?.error ? <p className={s.error} role="status">{source.error}</p> : <div className={s.variance} data-direction={direction(current.delta)}>
          <div>
            <p>{current.delta === null ? "Chênh lệch so với dự báo" : current.delta < 0 ? "Thấp hơn dự báo" : current.delta > 0 ? "Cao hơn dự báo" : "Đúng dự báo"}</p>
            {current.delta === null ? <span className={s.pending}>Chưa đủ số liệu cùng ngày</span> : <strong>{signedOrders.format(current.delta)} <small>đơn</small></strong>}
          </div>
          {current.ratio !== null && <span className={s.variancePercent}>{signedPercent.format(current.ratio)}</span>}
        </div>}
        {(!source?.error || current.actual !== null) && <dl className={s.values}>
          {values.map(item => <div key={item.key} className={s.value} data-series={item.key}>
            <div><dt>{item.label}</dt><dd>{fmt(item.value)}{item.value !== null && <small> đơn</small>}</dd></div>
            {item.value !== null && current.delta !== null && <span className={s.track} aria-hidden="true"><i style={{ width: `${item.value / scale * 100}%` }} /></span>}
          </div>)}
        </dl>}
        {current.partial && <p className={s.note}>Hôm nay, tạm tính theo snapshot Hub Overview.</p>}
        {forecast?.mismatch && <p className={`${s.note} ${s.warning}`}>FC HCM Total trên sheet lệch tổng MP + WH.</p>}
      </div>}
    </section>

    <section className={`${s.panel} ${s.detail}`} aria-labelledby="fc-month-title" aria-busy={loading}>
      <header className={s.header}>
        <h3 id="fc-month-title">FC theo tháng</h3>
        <div className={s.controls}>
          {data && <label>Tháng<select value={selectedMonth} onChange={e => setMonth(e.target.value)}>{data.months.map(m => <option key={m} value={m}>{m.slice(5)}/{m.slice(0, 4)}</option>)}</select></label>}
          <a href={`https://docs.google.com/spreadsheets/d/${HUB_SHEET_ID}/edit#range=FC!A1`} target="_blank" rel="noreferrer">Nguồn FC <ArrowUpRight size={14} aria-hidden="true" /></a>
        </div>
      </header>
      {loading ? <div className={s.tableSkeleton} aria-hidden="true"><i /><i /><i /><i /><i /></div> : data && !source?.error ? <>
        <div className={s.tableWrap} role="region" aria-label="FC và thực tế theo tháng" tabIndex={0}>
          <table>
            <caption>FC và thực tế tháng {selectedMonth.slice(5)}/{selectedMonth.slice(0, 4)}</caption>
            <thead><tr>{["Ngày", "FC", "Thực tế", "Lệch FC"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{rows.map(row => {
              const comparison = compareHubInbound(row, hub, today);
              return <tr key={row.date} data-compared={comparison.actual !== null}>
                <th scope="row"><time dateTime={row.date}>{dateLabel(row.date).slice(0, 5)}</time>{comparison.partial && <small>Tạm tính</small>}</th>
                <td>{fmt(row.total)}<small className={s.split}><span>MP {fmt(row.mp)}</span><span>WH {fmt(row.wh)}</span></small>{row.mismatch && <small className={s.warning} title="HCM Total trên nguồn khác tổng MP + WH">Lệch tổng FC</small>}</td>
                <td>{fmt(comparison.actual)}</td>
                <td data-direction={direction(comparison.delta)}>{comparison.delta === null ? "—" : signedOrders.format(comparison.delta)}
                  {comparison.ratio !== null && <small>{signedPercent.format(comparison.ratio)}</small>}
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <footer className={s.footer}>Chênh lệch = thực tế − FC cùng ngày. Số thực tế lấy từ snapshot Hub Overview gần nhất.</footer>
      </> : <p className={s.message}>Bảng tháng sẽ hiển thị khi nguồn FC khả dụng.</p>}
    </section>
  </>;
}
