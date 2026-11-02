"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, ChartNoAxesCombined, ChevronDown, Database, LoaderCircle } from "lucide-react";
import { addDays } from "@/lib/team/model";
import { todayInVietnam } from "@/lib/ai/work-date";
import type { AnalysisScope, OperationsAnalysis } from "@/lib/ai/operations-analysis";
import s from "./ai-workspace.module.css";
import { ReturnHistoryReport } from "./return-history";

const number = (value: number | null | undefined, digits = 0) => value == null ? "—" : value.toLocaleString("vi-VN", { maximumFractionDigits: digits });
const signed = (value: number | null | undefined, suffix = "") => value == null ? "Chưa đủ dữ liệu so" : `${value > 0 ? "+" : ""}${number(value, 2)}${suffix}`;
const dateLabel = (date: string) => date.split("-").reverse().join("/");
const states = { ready: "Đã tải", missing: "Thiếu dữ liệu", forbidden: "Không có quyền", error: "Lỗi nguồn", stale: "Dữ liệu cũ" };

export function OperationsAnalysisPanel({ onAsk }: { onAsk: (question: string) => void }) {
  const [today] = useState(todayInVietnam);
  const [filters, setFilters] = useState<AnalysisScope>({ from: addDays(today, -6), to: today, area: "all", hour: 23 });
  const [request, setRequest] = useState({ scope: filters, version: 0 });
  const [data, setData] = useState<OperationsAnalysis | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90_000);
    const params = new URLSearchParams({ ...request.scope, hour: String(request.scope.hour) });
    void fetch(`/api/ai/analysis?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { const result = await response.json(); if (!response.ok) throw Error(result.error || "Chưa tải được phân tích."); return result as OperationsAnalysis; })
      .then(result => { if (active) setData(result); })
      .catch(() => { if (active) setError(controller.signal.aborted ? "Đã hết thời gian tải. Thử khoảng ngày ngắn hơn." : "Không tải được phân tích. Kiểm tra khoảng ngày và thử lại."); })
      .finally(() => { window.clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [request]);
  function refresh(scope: AnalysisScope) {
    setLoading(true); setError(""); setData(null);
    setRequest(current => ({ scope: { ...scope }, version: current.version + 1 }));
  }
  const last = data?.daily.findLast(row => row.deliveryBacklog.value !== null);
  const ohDay = data?.daily.find(row => row.date === data.ohFocusDate);
  const maxBacklog = Math.max(1, ...data?.daily.map(row => row.deliveryBacklog.value ?? 0) ?? []);
  const topRate = data?.ohAreas.filter(row => row.rate !== null).sort((a, b) => b.rate! - a.rate!)[0];
  const ask = () => data && onAsk(`Phân tích từ ${dateLabel(data.scope.from)} đến ${dateLabel(data.scope.to)}, ${data.scope.area === "all" ? "toàn bộ KV1–KV5" : data.scope.area}, cùng checkpoint ${data.scope.hour}:50: backlog tăng giảm từng ngày, tỷ lệ OH và điểm nóng cần chú ý, giữ hàng qua đêm, Actual Inbound so FC và hàng Return. Nêu nguồn thiếu và việc cần kiểm tra.`);
  return <section className={s.content} aria-label="Phân tích biến động vận hành" aria-busy={loading}>
    <div className={s.sectionHeader}><div><p className={s.eyebrow}>TỪ SỐ LIỆU ĐẾN ƯU TIÊN</p><h3 className={s.heading}>Biến động vận hành</h3><p className={s.subtitle}>Đọc xu hướng từng ngày. Tìm khu vực cần chú ý.</p></div><button type="button" className={s.button} disabled={!data} onClick={() => document.getElementById("return-history-analysis")?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}><ChartNoAxesCombined size={16} aria-hidden="true" />Xem lịch sử Return</button></div>
    <form className={s.analysisFilters} onSubmit={event => { event.preventDefault(); refresh(filters); }}>
      <label>Từ ngày<input aria-label="Từ ngày" type="date" required max={today} value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })} /></label>
      <label>Đến ngày<input aria-label="Đến ngày" type="date" required min={filters.from} max={today} value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })} /></label>
      <label>Khu vực<select aria-label="Khu vực phân tích" value={filters.area} onChange={event => setFilters({ ...filters, area: event.target.value })}><option value="all">Toàn bộ 5 KV</option>{[1, 2, 3, 4, 5].map(n => <option key={n}>KV{n}</option>)}</select></label>
      <label>Mốc backlog<select aria-label="Mốc backlog" value={filters.hour} onChange={event => setFilters({ ...filters, hour: Number(event.target.value) })}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{hour}:50</option>)}</select></label>
      <button className={`${s.button} ${s.primary}`} disabled={loading} type="submit">{loading ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : null}Xem phân tích</button>
      <span className={s.footnote}>Tối đa 31 ngày · Δ so với ngày liền trước, cùng phạm vi.</span>
    </form>
    {loading && <p className={s.loadingLabel} role="status"><LoaderCircle size={16} className="animate-spin" aria-hidden="true" />Đang đối chiếu các nguồn theo ngày…</p>}
    {error && <div className={s.error} role="alert">{error}<br /><button className={s.button} onClick={() => refresh(request.scope)}>Thử lại</button></div>}
    {data && <>
      <p className={s.footnote}>{dateLabel(data.scope.from)} – {dateLabel(data.scope.to)} · {data.scope.area === "all" ? "KV1–KV5" : data.scope.area} · Đọc lúc {new Date(data.generatedAt).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" })}</p>
      {data.sources.some(source => source.state !== "ready") && <p className={s.notice}>Có nguồn chưa đủ dữ liệu hoặc quyền truy cập. Ô “—” chưa có số liệu để kết luận; xem chi tiết nguồn bên dưới.</p>}
      <div className={s.metrics}>
        <article className={s.metric}><p className={s.metricLabel}>Delivery backlog · {dateLabel(last?.date ?? data.scope.to)}</p><strong className={s.metricValue}>{number(last?.deliveryBacklog.value)}</strong><small>{signed(last?.deliveryBacklog.change?.delta, " đơn")} · {last?.deliveryBacklog.final ? "Đã chốt" : "Chưa có mốc chính thức"}<br />Mốc có dữ liệu gần nhất trong khoảng chọn</small></article>
        <article className={s.metric}><p className={s.metricLabel}>Tỷ lệ OH · {dateLabel(data.ohFocusDate)}</p><strong className={s.metricValue}>{number(ohDay?.oh.rate, 2)}{ohDay?.oh.rate != null ? "%" : ""}</strong><small>{signed(ohDay?.oh.rateChangePp, " điểm %")} {ohDay?.oh.partial ? "· Tạm tính" : ""}<br />OH {number(ohDay?.oh.orders)} / Delivery Volume {number(ohDay?.volume)}</small></article>
        <article className={s.metric}><p className={s.metricLabel}>Actual Inbound so FC · HCM</p><strong className={s.metricValue}>{data.forecast?.change ? signed(data.forecast.change.percent, "%") : "—"}</strong><small>{data.forecast && `${dateLabel(data.forecast.date)} · ${data.forecast.partial ? "Tạm tính" : "Ngày đã qua"}`}<br />Actual {number(data.forecast?.actual)} / FC {number(data.forecast?.fc)} · Δ {number(data.forecast?.change?.delta)} đơn</small></article>
        <article className={s.metric}><p className={s.metricLabel}>Return · tồn hub trên 5 ngày</p><strong className={s.metricValue}>{number(data.returns?.over5Days)}</strong><small>Đang trả trên 48h: {number(data.returns?.returningOver48h)}<br />Snapshot hiện có · không phải lịch sử đã chọn</small></article>
      </div>
      {topRate && <div className={s.taskSummary}><p><strong>OH cần chú ý: {topRate.area}</strong><br />Tỷ lệ cao nhất trong dữ liệu có mẫu số: {number(topRate.rate, 2)}% · {number(topRate.orders)} OH / {number(topRate.volume)} Volume.<small>{signed(topRate.rateChangePp, " điểm phần trăm")} so ngày trước · {dateLabel(data.ohFocusDate)}{ohDay?.oh.partial ? " · Tạm tính" : ""}. Đây là xếp hạng để kiểm tra, chưa phải kết luận nguyên nhân.</small></p></div>}
      <div className={s.sectionLabel}><h4>Delivery backlog qua từng ngày</h4><span>Cùng mốc {data.scope.hour}:50</span></div>
      <figure className={s.trend} aria-label="Biểu đồ Delivery backlog theo ngày"><div className={s.trendBars}>{data.daily.map(row => <div key={row.date} title={`${row.date}: ${number(row.deliveryBacklog.value)}${row.deliveryBacklog.final ? " đã chốt" : " chưa chốt"}`}><span>{number(row.deliveryBacklog.value)}</span><i style={{ height: row.deliveryBacklog.value == null ? 0 : `${Math.max(2, row.deliveryBacklog.value / maxBacklog * 92)}px`, opacity: row.deliveryBacklog.final ? 1 : .4 }} /><small>{row.date.slice(8)}/{row.date.slice(5, 7)}</small></div>)}</div><figcaption className={s.footnote}>Cột mờ: chưa chốt · “—”: thiếu mốc · Số chi tiết trong bảng bên dưới.</figcaption></figure>
      <div className={s.tableScroll} tabIndex={0} role="region" aria-label="Bảng số liệu từng ngày, cuộn ngang để xem đủ"><table className={s.areaTable}><thead><tr>{["Ngày", "DL backlog / Δ", "PU backlog / Δ", "OH / Δ", "OH% / Δ điểm %", "DL Volume", "Qua đêm / còn"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{data.daily.map(row => <tr key={row.date}><th scope="row">{dateLabel(row.date)}</th><td>{number(row.deliveryBacklog.value)}<small>{signed(row.deliveryBacklog.change?.delta)}{!row.deliveryBacklog.final && " · Tạm"}</small></td><td>{number(row.pickupBacklog.value)}<small>{signed(row.pickupBacklog.change?.delta)}{!row.pickupBacklog.final && " · Tạm"}</small></td><td>{number(row.oh.orders)}<small>{signed(row.oh.change?.delta)}{row.oh.partial && " · Tạm"}</small></td><td>{number(row.oh.rate, 2)}{row.oh.rate !== null && "%"}<small>{signed(row.oh.rateChangePp, " đ.%")}</small></td><td>{number(row.volume)}</td><td>{number(row.overnight?.total)} / {number(row.overnight?.remaining)}<small>Δ cohort {signed(row.overnight?.change?.delta)}</small></td></tr>)}</tbody></table></div>
      <p className={s.footnote}>Backlog/OH chỉ tính Δ khi hai ngày đủ điều kiện so. Giữ qua đêm là cohort cutoff 23h; “còn” theo trạng thái đồng bộ hiện tại, không phải trạng thái tại ngày cũ.</p>
      <div className={s.sectionLabel}><h4>Tỷ lệ OH từng KV</h4><span>{dateLabel(data.ohFocusDate)}</span></div>
      <p className={s.footnote}>Ưu tiên ngày gần nhất đã chốt OH và đủ Volume trong khoảng chọn; nếu chưa có, hiển thị OH tạm tính. Ngày đang thu thập vẫn nằm trong bảng từng ngày.</p>
      <table className={s.areaTable}><thead><tr><th>KV</th><th>OH / Volume</th><th>Tỷ lệ</th><th>Δ điểm %</th></tr></thead><tbody>{data.ohAreas.map(row => <tr key={row.area}><th scope="row">{row.area}</th><td>{number(row.orders)} / {number(row.volume)}</td><td>{number(row.rate, 2)}{row.rate !== null && "%"}</td><td>{signed(row.rateChangePp)}</td></tr>)}</tbody></table>
      <div className={s.sectionLabel}><h4>Điểm nóng OH · quận / phường</h4><span>Top 15 · {dateLabel(data.ohFocusDate)}</span></div>
      {data.ohHotspots.length ? <div className={s.analysisList}>{data.ohHotspots.map(row => <article key={JSON.stringify([row.area, row.district, row.ward])}><div><strong>{row.ward}</strong><small>{row.area} · {row.district}</small></div><div><strong>{number(row.orders)} OH</strong><small>{signed(row.change?.delta)} · {number(row.sharePct, 1)}% tổng OH</small></div></article>)}</div> : <p className={s.empty}>Chưa có điểm nóng OH trong dữ liệu đã tải.</p>}
      <p className={s.footnote}>Tỷ trọng OH của điểm / tổng OH trong phạm vi; chưa có Volume phường để tính tỷ lệ OH phường.</p>
      {data.ohReasons.length > 0 && <details className={s.sources}><summary>Lý do OH được ghi nhận<ChevronDown size={15} /></summary><ul className={s.analysisReasons}>{data.ohReasons.map(row => <li key={row.code}>{row.label}: <strong>{number(row.orders)}</strong></li>)}</ul></details>}
      <div className={s.sectionLabel}><h4>Giữ hàng qua đêm cần theo dõi</h4><span>Cohort gần nhất</span></div>
      {data.overnightHotspots.length ? <div className={s.analysisList}>{data.overnightHotspots.map(row => <article key={row.area}><div><strong>{row.area}</strong><small>Cutoff {dateLabel(row.date)}</small></div><div><strong>{number(row.remaining)} còn lại</strong><small>Trên {number(row.total)} đơn cutoff</small></div></article>)}</div> : <p className={s.empty}>Chưa có cohort đã khóa trong khoảng chọn.</p>}
      {data.forecast && <p className={s.notice}>{data.forecast.note}{data.forecast.mismatch ? " FC nguồn có chênh lệch tổng; cần kiểm tra sheet." : ""}</p>}
      <ReturnHistoryReport data={data.returnHistory} onAsk={() => onAsk(`Phân tích tồn Return từ ${dateLabel(data.scope.from)} đến ${dateLabel(data.scope.to)}, ${data.scope.area === "all" ? "toàn bộ KV1–KV5" : data.scope.area}: tăng/giảm từng ngày, KV và quận nào đang tồn hàng trả nhiều nhất, nơi tồn lâu cần chú ý. Phân biệt số tạm tính và ngày chưa có lịch sử; nêu 3 ưu tiên kiểm tra.`)} />
      <div className={s.sectionLabel}><h4>Hàng Return · snapshot hiện có</h4><span>{data.returns ? dateLabel(todayInVietnam(new Date(data.returns.snapshotAt))) : "—"}</span></div>
      {data.returns ? <><p className={s.subtitle}>{number(data.returns.total)} đơn · {number(data.returns.waiting)} chờ trả · {number(data.returns.returning)} đang trả. Thiếu mốc nhập hub: {number(data.returns.unknownHubAge)}; thiếu mốc bắt đầu trả: {number(data.returns.unknownReturningStart)}.</p><div className={s.analysisList}>{data.returns.hotspots.map(row => <article key={`${row.area}-${row.district}`}><div><strong>{row.district}</strong><small>{row.area} · {number(row.total)} đơn</small></div><div><strong>{number(row.over5Days)} tồn &gt;5 ngày</strong><small>{number(row.returningOver48h)} đang trả &gt;48h</small></div></article>)}</div><p className={s.footnote}>{data.returns.note} Tuổi hàng tính tại {new Date(data.returns.ageEvaluatedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}, theo trạng thái của snapshot.</p></> : <p className={s.empty}>Chưa có nguồn Return để phân tích.</p>}
      <div className={s.askAction}><div><p>Đọc số liệu cùng AI</p><small>Tóm tắt biến động, điểm cần kiểm tra và ưu tiên xử lý.</small></div><button className={`${s.button} ${s.primary}`} onClick={ask}>AI phân tích<ArrowUpRight size={15} aria-hidden="true" /></button></div>
      <details className={s.sources}><summary><Database size={15} aria-hidden="true" />Nguồn & cách tính<ChevronDown size={15} aria-hidden="true" /></summary><ul className={s.sourceGrid}>{data.sources.map(source => <li key={source.id} className={s.sourceCard}><strong>{source.label}</strong><span className={s.badge} data-state={source.state}>{states[source.state]}</span><p>{source.note}</p><p>{source.at ? new Date(source.at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "Chưa có thời điểm nguồn"}</p></li>)}</ul><div className={s.reportText}>{Object.values(data.definitions).map(text => <p key={text}>{text}</p>)}</div></details>
    </>}
  </section>;
}
