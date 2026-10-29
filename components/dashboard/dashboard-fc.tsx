"use client";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { HubFc } from "@/lib/dashboard/hub-fc";
import { HUB_SHEET_ID } from "@/lib/dashboard/hub-sheet";
import s from "./dashboard-fc.module.css";

const fmt = (n: number | null | undefined) => n?.toLocaleString("vi-VN") ?? "—";
export function DashboardFc({ source }: { source?: { data: HubFc | null; error: string | null } }) {
  const [month, setMonth] = useState("");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const data = source?.data;
  const selectedMonth = data?.months.includes(month) ? month : data?.months.includes(today.slice(0,7)) ? today.slice(0,7) : data?.months[0] ?? "";
  const rows = data?.rows.filter(r => r.date.startsWith(selectedMonth)) ?? [];
  const current = data?.rows.find(r => r.date === today);
  return <section id="fc-overview" className={s.panel} aria-label="Bảng FC">
    <header className={s.header}><div><p>FC · SẢN LƯỢNG THEO NGÀY</p><h2>HCM MP &amp; HCM WH</h2><span>Dữ liệu từ tab FC · Đơn/ngày</span></div><div className={s.controls}><label>Tháng<select value={selectedMonth} onChange={e => setMonth(e.target.value)} disabled={!data}>{data?.months.map(m => <option key={m} value={m}>{m.slice(5)}/{m.slice(0,4)}</option>)}</select></label><a href={`https://docs.google.com/spreadsheets/d/${HUB_SHEET_ID}/edit#range=FC!A1`} target="_blank" rel="noreferrer">Xem nguồn <ArrowUpRight size={14} aria-hidden="true" /></a></div></header>
    <div className={s.today}><span>Hôm nay · {today.split("-").reverse().join("/")}</span><dl>{([ ["HCM MP",current?.mp],["HCM WH",current?.wh],["HCM Total",current?.total] ] as const).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{fmt(value)}</dd></div>)}</dl></div>
    {source?.error ? <p className={s.error} role="status">{source.error}</p> : !data ? <p className={s.message}>Đang tải bảng FC…</p> : <><div className={s.tableWrap} role="region" aria-label="Bảng FC theo tháng, cuộn để xem các ngày" tabIndex={0}><table><caption>FC tháng {selectedMonth.slice(5)}/{selectedMonth.slice(0,4)}</caption><thead><tr>{["Date","Day","HCM MP","HCM WH","HCM Total"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.date} data-today={row.date === today} data-future={row.date > today}><th scope="row">{row.date.replaceAll("-","/")}{row.date === today && <small>Hôm nay</small>}</th><td>{row.day}</td><td>{fmt(row.mp)}</td><td>{fmt(row.wh)}</td><td>{fmt(row.total)}{row.mismatch && <span className={s.warning} title="HCM Total trên nguồn khác tổng MP + WH"> · Lệch tổng</span>}</td></tr>)}</tbody></table></div><footer className={s.footer}><span>{rows.length} ngày · Cache nguồn 15 phút</span><span>Gồm cả ngày tương lai theo Sheet · “—” là chưa có số liệu</span></footer></>}
  </section>;
}
