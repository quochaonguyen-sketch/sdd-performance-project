"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChartNoAxesCombined, Clock3, MapPin, Users } from "lucide-react";
import { buildOHOverview, type OHOverviewRank, type ohChange } from "@/lib/dashboard/onhold-overview";
import type { OHData } from "@/lib/onhold/model";
import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import s from "./dashboard-onhold.module.css";

const fmt = (value: number) => value.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const dateLabel = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const share = (orders: number, total: number | null) => total ? `${fmt(orders / total * 100)}%` : "0%";
const barWidth = (orders: number, total: number | null) => `${total ? orders / total * 100 : 0}%`;
type Change = ReturnType<typeof ohChange>;

export function DashboardOnhold({ source, end, loading }: {
  source: { data: OHData | null; error: string | null }; end: string; loading: boolean;
}) {
  const [days, setDays] = useState(7);
  const [area, setArea] = useState("all");
  const [selected, setSelected] = useState<string>();
  const [kind, setKind] = useState<"rider" | "ward">("rider");
  const [limit, setLimit] = useState(5);
  const view = useMemo(() => buildOHOverview(source.data ?? { cells: [], reports: [] }, end, days, area, selected), [source.data, end, days, area, selected]);
  const max = Math.max(1, ...view.daily.map(r => r.orders ?? 0));
  const total = view.orders;
  const dayRanks = kind === "rider" ? view.riders : view.wards;
  const ranks = kind === "rider" ? view.week.riders : view.week.wards;
  const weekTotal = view.week.total;
  const topOrders = dayRanks.slice(0, 5).reduce((n, r) => n + r.orders, 0);
  const otherReasons = view.reasons.slice(4).reduce((n, r) => n + r.orders, 0);
  const covered = view.daily.filter(r => r.orders !== null).length;
  const snapshot = view.report?.fetched_at ? new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }).format(new Date(view.report.fetched_at)) : null;

  return <section id="onhold-overview" className={s.root} aria-label="Phân tích Onhold" aria-busy={loading}>
    <div className={s.workspace}>
      <header className={s.toolbar}>
        <div className={s.identity}><span className={s.icon}><ChartNoAxesCombined size={20} aria-hidden="true"/></span><div><h3>Phân tích Onhold</h3><p>Biến động theo ngày & điểm tập trung OH</p></div></div>
        <div className={s.controls}>
          <label className={s.area}>Khu vực<select aria-label="Khu vực OH" value={area} onChange={e => setArea(e.target.value)}><option value="all">Tất cả KV</option>{OPERATING_AREAS.map(a => <option key={a}>{a}</option>)}</select></label>
          <div className={s.segment} role="group" aria-label="Khoảng ngày OH">{[7, 14].map(n => <button key={n} type="button" aria-pressed={days === n} onClick={() => setDays(n)}>{n} ngày</button>)}</div>
          <Link className={s.detail} href="/onhold">Báo cáo OH<ArrowUpRight size={14} aria-hidden="true"/></Link>
        </div>
      </header>
      {source.error && <p className={s.warning} role="status">{source.error}{source.data ? " · Dữ liệu lần tải trước." : ""}</p>}
      {loading && !source.data ? <div className={s.empty} role="status">Đang tải phân tích Onhold…</div> : !source.data ? <div className={s.empty}>Chưa có dữ liệu OH. Nhấn Làm mới để thử lại.</div> : <>
        <div className={s.context}>
          <label>Ngày phân tích<select aria-label="Ngày phân tích OH" value={view.day} onChange={e => setSelected(e.target.value)}>{[...view.daily].reverse().map(r => <option key={r.date} value={r.date}>{dateLabel(r.date)}{r.partial ? " · Đang cập nhật" : r.orders === null ? " · Chưa có dữ liệu" : ""}</option>)}</select></label>
          <span className={s.status} data-partial={view.partial || undefined}><i/>{total === null ? "Chưa có báo cáo" : view.partial ? "Chưa chốt ngày" : view.report?.finalized_at ? "Đã chốt ngày" : "Snapshot ngày"}</span>
          <span className={s.stamp}><Clock3 size={13} aria-hidden="true"/>{snapshot ? `Cập nhật ${snapshot} · ${dateLabel(view.day)}` : "Chưa có lần cập nhật"}</span>
        </div>
        <div className={s.metrics}>
          <article className={s.leadMetric}><span>Đơn ghi nhận OH <small>{dateLabel(view.day)}</small></span><strong>{total === null ? "—" : fmt(total)}<small>đơn</small></strong><p>{area === "all" ? "Toàn bộ KV1–KV5" : area} · {total === null ? "Chưa có dữ liệu" : `${fmt(view.riders.length)} rider / ${fmt(view.wards.length)} phường`}</p></article>
          <article><span>So với ngày trước <small>{dateLabel(view.previousDay)}</small></span>{view.comparable ? <><strong className={tone(view.change)}>{view.change && view.change.delta > 0 ? <ArrowUpRight size={22} aria-hidden="true"/> : view.change && view.change.delta < 0 ? <ArrowDownRight size={22} aria-hidden="true"/> : null}{deltaLabel(view.change)}<small>đơn</small></strong><p>{changeText(view.change)}</p></> : <><strong className={s.pending}>{view.partial ? "Đang ghi nhận" : "Chưa đủ dữ liệu"}</strong><p>Ngày trước: {view.previousOrders === null ? "chưa có dữ liệu" : `${fmt(view.previousOrders)} đơn`}</p></>}</article>
          <article><span>Mức tập trung OH <small>Top 5 {kind === "rider" ? "rider" : "phường"}</small></span><strong>{total === null ? "—" : share(topOrders, total)}</strong><p>{fmt(topOrders)} đơn từ top 5 · {total === null ? "—" : fmt(dayRanks.length)} {kind === "rider" ? "rider" : "phường"} có OH</p></article>
        </div>
        {view.partial && <p className={s.partialNote} role="status"><Clock3 size={15} aria-hidden="true"/><span>Ngày {dateLabel(view.day)} chưa chốt. Chưa tính tăng/giảm với tổng cả ngày hôm trước.</span></p>}
        <div className={s.analysis}>
          <section className={s.trend} aria-label="Xu hướng OH theo ngày">
            <div className={s.panelHeading}><div><h4>Xu hướng Onhold</h4><p>{dateLabel(view.daily[0].date)}–{dateLabel(end)} · {covered}/{days} ngày có báo cáo</p></div><span className={s.unit}>Đơn / ngày</span></div>
            <div className={s.chartScroll} tabIndex={0} aria-label="Biểu đồ OH, cuộn ngang để xem đủ ngày"><div className={s.chart} style={{ gridTemplateColumns: `repeat(${days}, minmax(${days === 14 ? 36 : 32}px, 1fr))` }}>
              {view.daily.map(row => <button type="button" key={row.date} className={s.day} data-partial={row.partial || undefined} aria-pressed={row.date === view.day} onClick={() => setSelected(row.date)} aria-label={`${dateLabel(row.date)}: ${row.orders === null ? "Chưa có dữ liệu" : `${fmt(row.orders)} đơn OH`}. ${row.partial ? "Chưa chốt ngày" : row.comparable ? changeText(row.change) : "Chưa đủ dữ liệu so sánh"}`}>
                <strong>{row.orders === null ? "—" : fmt(row.orders)}</strong><span className={s.barTrack}>{row.orders === null ? <span className={s.missing}>N/A</span> : <i style={{ height: `${row.orders / max * 100}%`, minHeight: row.orders > 0 ? 3 : 0 }}/>}</span><span>{dateLabel(row.date)}</span><small className={row.comparable ? tone(row.change) : undefined}>{row.partial ? "Chưa chốt" : row.comparable ? deltaLabel(row.change) : "—"}</small>
              </button>)}
            </div></div>
            <div className={s.legend}><span><i/>OH theo ngày</span><span><i className={s.partialSwatch}/>Ngày chưa chốt</span><span>Chọn cột để xem chi tiết</span></div>
          </section>
          <section className={s.reasons} aria-label="OH reasons">
            <div className={s.panelHeading}><div><h4>OH reasons</h4><p>Reason distribution · {dateLabel(view.day)}</p></div><span className={s.unit}>{view.reasons.length} reasons</span></div>
            <div className={s.reasonList}>{view.reasons.slice(0, 4).map((r, i) => <div className={s.reason} key={r.reason}><div><span><i data-index={i}/>{r.label}</span><strong>{fmt(r.orders)}<small>{share(r.orders, total)}</small></strong></div><div className={s.reasonTrack}><i data-index={i} style={{ width: barWidth(r.orders, total) }}/></div></div>)}{otherReasons > 0 && <div className={s.other}><span>Other reasons</span><strong>{fmt(otherReasons)} <small>{share(otherReasons, total)}</small></strong></div>}{!view.reasons.length && <p className={s.empty}>{total === null ? "No report for this date" : "No OH recorded"}</p>}</div>
          </section>
        </div>
        <section className={s.ranking} aria-label="Bảng xếp hạng OH">
          <div className={s.rankingHeader}><div><h4>Điểm tập trung Onhold · 1 tuần</h4><p>{dateLabel(view.week.start)}–{dateLabel(view.week.end)} · 7 ngày · {area === "all" ? "Tất cả khu vực" : area} · Xếp theo số đơn giảm dần</p></div><div className={s.rankControls}><div className={s.segment} role="group" aria-label="Loại xếp hạng OH"><button type="button" aria-pressed={kind === "rider"} onClick={() => setKind("rider")}><Users size={14} aria-hidden="true"/>Rider <small>{view.week.riders.length}</small></button><button type="button" aria-pressed={kind === "ward"} onClick={() => setKind("ward")}><MapPin size={14} aria-hidden="true"/>Phường <small>{view.week.wards.length}</small></button></div><label className={s.limit}>Hiển thị<select aria-label="Số dòng xếp hạng OH" value={limit} onChange={e => setLimit(Number(e.target.value))}><option value={5}>Top 5</option><option value={10}>Top 10</option></select></label></div></div>
          <p className={s.weekNote}>{view.week.coverage}/7 ngày có báo cáo{view.week.partial ? " · Có ngày chưa chốt" : ""}. Tổng lượt OH theo ngày; một đơn có thể xuất hiện nhiều ngày. {!view.week.comparable && "Chưa so sánh tuần trước vì chưa đủ 14 ngày có báo cáo hoàn tất."}</p>
          <div className={s.tableWrap}><table className={s.table}><caption className={s.srOnly}>Top {limit} {kind === "rider" ? "rider" : "phường"} OH từ {view.week.start} đến {view.week.end}</caption><thead><tr><th scope="col">#</th><th scope="col">{kind === "rider" ? "Rider / Mã rider" : "Phường / Quận"}</th><th scope="col" className={s.locationCol}>Khu vực / Địa bàn</th><th scope="col">Đơn OH</th><th scope="col">Tỷ trọng OH</th><th scope="col">So với tuần trước</th></tr></thead><tbody>{ranks.slice(0, limit).map((row, i) => <RankRow key={row.key} row={row} index={i} kind={kind} total={weekTotal}/>)}</tbody></table></div>
          {!ranks.length && <p className={s.empty}>{weekTotal === null ? "Chưa có báo cáo trong tuần này" : "Không ghi nhận OH trong phạm vi đã chọn"}</p>}
          <footer className={s.tableFooter}><span>{Math.min(limit, ranks.length)}/{fmt(ranks.length)} {kind === "rider" ? "rider" : "phường"} · Tỷ trọng trên {weekTotal === null ? "—" : fmt(weekTotal)} lượt OH / tuần</span><Link href="/onhold">Xem toàn bộ<ArrowUpRight size={13} aria-hidden="true"/></Link></footer>
        </section>
        <details className={s.dataNotes}><summary>Cách đọc dữ liệu</summary><p>OH gồm các trạng thái ghi nhận 1 và 5 trong nguồn phân tích OH. “—” / N/A là thiếu báo cáo; 0 là không có OH. Tỷ trọng = số OH của nhóm / tổng OH trong ngày và khu vực đang chọn, không phải tỷ lệ trên đơn gán. Bảng điểm tập trung cộng 7 ngày kết thúc ở ngày phân tích, so với 7 ngày liền trước đó. Một đơn có thể được ghi nhận ở nhiều ngày. Biến động chỉ hiển thị khi cả hai kỳ đủ báo cáo và không còn đang cập nhật.</p></details>
      </>}
    </div>
  </section>;
}

function deltaLabel(change: Change) { return change ? `${change.delta > 0 ? "+" : ""}${fmt(change.delta)}` : "—"; }
function tone(change: Change) { return change?.delta ? change.delta > 0 ? s.up : s.down : undefined; }
function changeText(change: Change) {
  if (!change) return "Chưa đủ dữ liệu so sánh";
  if (!change.delta) return "Không thay đổi so với ngày trước";
  return `${change.delta > 0 ? "Tăng" : "Giảm"} ${change.percent === null ? "từ mức 0 · Không tính %" : `${fmt(Math.abs(change.percent))}%`} so với ngày trước`;
}
function RankRow({ row, index, kind, total }: { row: OHOverviewRank; index: number; kind: "rider" | "ward"; total: number | null }) {
  const location = [row.area, kind === "rider" ? row.district : null].filter(Boolean).join(" · ");
  return <tr><td><span className={s.rankIndex} data-leading={index < 3 || undefined}>{index + 1}</span></td><th scope="row"><span className={s.name}>{row.name}</span><small>{row.detail}</small><small className={s.mobileLocation}>{location}</small></th><td className={s.locationCol}>{location || "Chưa rõ địa bàn"}</td><td className={s.orderCount}>{fmt(row.orders)}</td><td><span>{share(row.orders, total)}</span><div className={s.shareTrack}><i style={{ width: barWidth(row.orders, total) }}/></div></td><td><span className={tone(row.change)}>{deltaLabel(row.change)}</span>{row.change && <small>{row.change.percent === null ? "Từ mức 0" : `${row.change.percent > 0 ? "+" : ""}${fmt(row.change.percent)}%`}</small>}</td></tr>;
}
