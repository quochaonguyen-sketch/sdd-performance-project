import type { ReturnHistoryAnalysis } from "@/lib/return-orders/history";
import s from "./ai-workspace.module.css";

const n = (value: number | null | undefined, digits = 0) => value == null ? "—" : value.toLocaleString("vi-VN", { maximumFractionDigits: digits });
const date = (value: string) => value.split("-").reverse().join("/");
const at = (value: string | null) => value ? new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "Chưa có snapshot";
const signed = (value: number | null | undefined, suffix = "") => value == null ? "—" : `${value > 0 ? "+" : ""}${n(value, 2)}${suffix}`;

export function ReturnHistoryReport({ data, onAsk }: { data: ReturnHistoryAnalysis | null; onAsk: () => void }) {
  const latest = data?.latest, top = data?.areas[0];
  return <section id="return-history-analysis" aria-label="Lịch sử tồn Return theo ngày" className={s.returnHistory}>
    <div className={s.sectionLabel}><h4>Lịch sử tồn Return theo ngày</h4><span>{data?.focusDate ? date(data.focusDate) : "Chưa có ngày lưu"}</span></div>
    {!latest ? <p className={s.empty}>Chưa có lịch sử Return trong khoảng chọn. Hệ thống tự lưu khi nguồn đồng bộ thành công; ngày chưa có dữ liệu không được tính là 0.</p> : <>
      <p className={s.subtitle}>Snapshot cuối được lưu: <strong>{at(latest.capturedAt)}</strong> · {latest.partial ? "Hôm nay · tạm tính" : "Lần đồng bộ cuối của ngày đã qua"}. Tuổi hàng trong lịch sử tính tại snapshot.</p>
      <div className={s.askAction}><div><p>Đánh giá hàng trả cùng AI</p><small>Tăng/giảm tồn, KV tập trung nhiều hàng và điểm tồn lâu.</small></div><button type="button" className={`${s.button} ${s.primary}`} onClick={onAsk}>AI phân tích Return</button></div>
      <div className={s.metrics}>
        <article className={s.metric}><p className={s.metricLabel}>Tồn Return · {date(latest.date)}</p><strong className={s.metricValue}>{n(latest.counts?.total)}</strong><small>{n(latest.counts?.waiting)} chờ trả · {n(latest.counts?.returning)} đang trả<br />{latest.partial ? "Δ tạm" : "Δ"} {signed((latest.change ?? latest.provisionalChange)?.delta, " đơn")} ({signed((latest.change ?? latest.provisionalChange)?.percent, "%")}) so ngày trước</small></article>
        <article className={s.metric}><p className={s.metricLabel}>Khu vực tồn nhiều nhất</p><strong className={s.metricValue}>{top && top.total > 0 ? top.area : "—"}</strong><small>{top ? `${n(top.total)} đơn · ${n(top.sharePct, 1)}% tồn trong phạm vi` : "Chưa có dữ liệu"}<br />Tồn &gt;5 ngày: {n(top?.over5Days)} · Đang trả &gt;48h: {n(top?.returningOver48h)}</small></article>
      </div>
      {latest.change === null && latest.provisionalChange === null && <p className={s.notice}>Chưa có snapshot ngày liền trước để tính tăng/giảm cho {date(latest.date)}. Số liệu được giữ từ ngày bắt đầu lưu; không suy ngược những ngày chưa có lịch sử.</p>}
      {(latest.unknownAreaOrders ?? 0) > 0 && <p className={s.footnote}>Toàn nguồn có {n(latest.unknownAreaOrders)} đơn chưa rõ KV, được lưu riêng và không cộng vào tổng KV1–KV5 ở đây.</p>}
      <div className={s.sectionLabel}><h4>KV đang tồn hàng trả nhiều</h4><span>Xếp theo tổng tồn</span></div>
      <div className={s.analysisList}>{data!.areas.map((row, index) => <article key={row.area}>
        <div className={s.returnRank}><strong>#{index + 1} · {row.area}</strong><small>{n(row.waiting)} chờ trả · {n(row.returning)} đang trả</small><div className={s.progress} aria-hidden="true"><span style={{ width: `${top?.total ? row.total / top.total * 100 : 0}%` }} /></div></div>
        <div><strong>{n(row.total)} đơn</strong><small>{n(row.sharePct, 1)}% tồn · {n(row.over5Days)} &gt;5 ngày<br />{latest.partial ? "Δ tạm" : "Δ"} {signed((row.change ?? row.provisionalChange)?.delta)}</small></div>
      </article>)}</div>
      <div className={s.sectionLabel}><h4>Tăng / giảm từng ngày</h4><span>Δ tồn so ngày liền trước</span></div>
      <div className={s.tableScroll} role="region" tabIndex={0} aria-label="Bảng lịch sử Return, cuộn ngang để xem đủ"><table className={s.areaTable}>
        <thead><tr>{["Ngày / snapshot", "Tổng tồn", "Chờ trả", "Đang trả", "Tồn >5 ngày", "Δ đơn / %"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{data!.daily.map(row => <tr key={row.date}><th scope="row">{date(row.date)}<small>{at(row.capturedAt)}{row.counts && row.partial ? " · Tạm tính" : ""}</small></th><td>{n(row.counts?.total)}</td><td>{n(row.counts?.waiting)}</td><td>{n(row.counts?.returning)}</td><td>{n(row.counts?.over5Days)}</td><td>{signed((row.change ?? row.provisionalChange)?.delta)}<small>{signed((row.change ?? row.provisionalChange)?.percent, "%")}{row.counts && row.partial ? " · Δ tạm" : ""}</small></td></tr>)}</tbody>
      </table></div>
      <div className={s.sectionLabel}><h4>Quận tồn hàng trả nhiều</h4><span>Top 15 · {date(latest.date)}</span></div>
      <div className={s.analysisList}>{data!.hotspots.map(row => <article key={JSON.stringify([row.area, row.district])}><div><strong>{row.district}</strong><small>{row.area} · {n(row.waiting)} chờ trả · {n(row.returning)} đang trả</small></div><div><strong>{n(row.total)} đơn</strong><small>{n(row.over5Days)} &gt;5 ngày · {n(row.returningOver48h)} đang trả &gt;48h<br />{latest.partial ? "Δ tạm" : "Δ"} {signed((row.change ?? row.provisionalChange)?.delta)}</small></div></article>)}</div>
      <p className={s.footnote}>{data!.definition}</p>
    </>}
  </section>;
}
