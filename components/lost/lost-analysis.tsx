"use client";

import { useEffect, useRef, useState } from "react";
import { WhDateRangePicker } from "@/components/wh/wh-date-picker";
import { recentLostDays, type LostAnalysisData, type LostAnalysisFilters, type LostRank } from "@/lib/lost/analysis";
import { formatVnDate, getMonthRange } from "@/lib/wh/model";
import styles from "./lost-analysis.module.css";

const number = new Intl.NumberFormat("vi-VN");
const label = (from: string, to: string) => from === to ? formatVnDate(from) : `${formatVnDate(from)} – ${formatVnDate(to)}`;
const shortDate = (day: string) => formatVnDate(day).slice(0, 5);

export function LostAnalysis({ initial }: { initial: LostAnalysisData }) {
  const [data, setData] = useState(initial);
  const [filters, setFilters] = useState(initial.filters);
  const [month, setMonth] = useState(initial.today.slice(0, 7));
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function load(next: LostAnalysisFilters) {
    setFilters(next);
    setError("");
    setLoading(true);
    request.current?.abort();
    const pending = new AbortController();
    request.current = pending;
    try {
      const params = new URLSearchParams({ view: "analysis", ...next });
      const response = await fetch(`/api/lost?${params}`, { signal: pending.signal });
      if (!response.ok) throw Error(response.status === 400 ? "Chọn khoảng ngày hợp lệ đến hôm nay." : "Chưa tải được phân tích.");
      const result = await response.json();
      if (!pending.signal.aborted) {
        setData(result);
        if (next.from !== data.filters.from || next.to !== data.filters.to) setSelectedPoint(null);
      }
    } catch (error) {
      if (!pending.signal.aborted) setError(error instanceof Error ? error.message : "Chưa tải được phân tích.");
    } finally {
      if (!pending.signal.aborted) setLoading(false);
    }
  }

  const recent = recentLostDays(data.today);
  const activeRecent = filters.from === recent.from && filters.to === recent.to;
  const { points, totals, riders } = data;
  const max = Math.max(1, ...points.flatMap(point => [point.pickup, point.notReceived]));
  const tick = Math.ceil(max / 4);
  const axisMax = tick * 4;
  const activeIndex = selectedPoint ?? points.findLastIndex(point => point.pickup || point.notReceived);
  const active = points[activeIndex];
  const labelStep = Math.ceil(points.length / 6);

  return <section className={styles.analysis} aria-labelledby="lost-analysis-title">
    <header className={styles.header}>
      <div>
        <h2 id="lost-analysis-title">Phân tích đối soát</h2>
        <p>Theo ngày báo cáo · {label(data.filters.from, data.filters.to)}</p>
      </div>
      <div className={styles.periods} role="group" aria-label="Khoảng ngày phân tích">
        <button type="button" aria-pressed={activeRecent} onClick={() => void load({ ...recent, rank: filters.rank })}>30 ngày gần nhất</button>
        <form onSubmit={event => {
          event.preventDefault();
          if (!/^\d{4}-\d{2}$/.test(month) || month > data.today.slice(0, 7)) return;
          const range = getMonthRange(month);
          void load({ ...range, to: range.to < data.today ? range.to : data.today, rank: filters.rank });
        }}>
          <input type="month" aria-label="Tháng phân tích" max={data.today.slice(0, 7)} required value={month} onChange={event => setMonth(event.target.value)} />
          <button type="submit">Xem tháng</button>
        </form>
        <WhDateRangePicker from={filters.from} to={filters.to} maxDate={data.today}
          onApply={(from, to) => void load({ ...filters, from, to })} />
      </div>
    </header>
    {loading && <p className={styles.notice} role="status">Đang tải phân tích…</p>}
    {error && <p className={styles.error} role="alert">{error} <button type="button" onClick={() => void load(filters)}>Thử lại</button></p>}

    <section className={styles.chart} aria-labelledby="lost-trend-title" aria-busy={loading}>
      <div className={styles.sectionHead}>
        <div><h3 id="lost-trend-title">Số đơn theo {data.step === 1 ? "ngày" : `khoảng ${data.step} ngày`}</h3>
          <p>Pickup gồm Pickup Done và Handedover.</p></div>
        <div className={styles.legend} aria-label="Chú giải">
          <span><i className={styles.pickup} aria-hidden="true" /> Pickup <strong>{number.format(totals.pickup)}</strong></span>
          <span><i className={styles.notReceived} aria-hidden="true" /> Buyer/Seller chưa nhận hàng <strong>{number.format(totals.notReceived)}</strong></span>
        </div>
      </div>
      {active ? <>
        <div className={styles.chartScroll} tabIndex={0} role="region" aria-label="Biểu đồ số đơn đối soát">
          <div className={styles.chartFrame} style={{ minWidth: Math.max(230, points.length * 25 + 35) }}>
            <div className={styles.axis} aria-hidden="true">{[4, 3, 2, 1, 0].map(value => <span key={value}>{number.format(tick * value)}</span>)}</div>
            <div className={styles.plot} style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
              {points.map((point, index) => <div className={styles.slot} key={point.from}>
                <button type="button" aria-pressed={index === activeIndex}
                  aria-label={`${label(point.from, point.to)}, Pickup ${point.pickup}, Buyer/Seller chưa nhận ${point.notReceived}`}
                  onFocus={() => setSelectedPoint(index)} onClick={() => setSelectedPoint(index)}>
                  <span className={styles.pickup} aria-hidden="true" style={{ height: `${100 * point.pickup / axisMax}%` }} />
                  <span className={styles.notReceived} aria-hidden="true" style={{ height: `${100 * point.notReceived / axisMax}%` }} />
                </button>
                <small aria-hidden="true">{index % labelStep === 0 || index === points.length - 1 ? shortDate(point.from) : ""}</small>
              </div>)}
            </div>
          </div>
        </div>
        <p className={styles.chartDetail}><strong>{label(active.from, active.to)}</strong>
          <span>Pickup {number.format(active.pickup)}</span><span>Buyer/Seller chưa nhận {number.format(active.notReceived)}</span></p>
      </> : <p className={styles.empty}>Khoảng này chưa có đơn thuộc hai nhóm phân tích.</p>}
    </section>

    <section className={styles.rank} aria-labelledby="lost-rank-title" aria-busy={loading}>
      <div className={styles.sectionHead}>
        <div><h3 id="lost-rank-title">Top 10 rider theo số đơn đối soát</h3>
          <p>Pickup dùng rider lấy hàng · Buyer/Seller chưa nhận dùng rider giao hàng.</p></div>
        <label className={styles.rankFilter}>Xếp theo
          <select value={filters.rank} onChange={event => void load({ ...filters, rank: event.target.value as LostRank })}>
            <option value="total">Tổng số đơn</option><option value="pickup">Pickup</option><option value="notReceived">Buyer/Seller chưa nhận</option>
          </select>
        </label>
      </div>
      {riders.length ? <div className={styles.rankScroll}><table>
        <thead><tr><th scope="col">Hạng</th><th scope="col">Rider</th><th scope="col">Pickup</th><th scope="col">Buyer/Seller chưa nhận</th><th scope="col">Tổng</th></tr></thead>
        <tbody>{riders.map((rider, index) => <tr key={rider.key}>
          <td>{index + 1}</td><th scope="row">{rider.rider}{rider.code && <small>{rider.code}</small>}</th>
          <td>{number.format(rider.pickup)}</td><td>{number.format(rider.notReceived)}</td><td><strong>{number.format(rider.total)}</strong></td>
        </tr>)}</tbody>
      </table></div> : <p className={styles.empty}>Chưa có rider đủ dữ liệu trong phạm vi đang xem.</p>}
      {data.withoutRider > 0 && <p className={styles.rankNote}>{number.format(data.withoutRider)} đơn chưa xác minh được rider.</p>}
    </section>
  </section>;
}
