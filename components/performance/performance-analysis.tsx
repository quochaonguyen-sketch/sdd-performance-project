"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChartNoAxesCombined, Grid2X2, Users } from "lucide-react";
import { performanceRate, type PerformanceAnalysis as Analysis, type AreaPerformance } from "@/lib/performance/analysis";
import styles from "./performance-analysis.module.css";

const number = (value: number) => value.toLocaleString("vi-VN");
const percent = (value: number | null) => value === null ? "—" : `${value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
const dateLabel = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}`;

function ChartHeading({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div className={styles.heading}><div className={styles.headingIcon}>{icon}</div><div><h2>{title}</h2><p>{description}</p></div></div>;
}

export function PerformanceAnalysis({ analysis, isLoading, onArea }: { analysis?: Analysis; isLoading: boolean; onArea: (area: string) => void }) {
  if (!analysis) return <section className={styles.panel} aria-busy={isLoading}><p className={styles.empty}>{isLoading ? "Đang tải phân tích hiệu suất…" : "Chưa có dữ liệu phân tích."}</p></section>;
  return <div className={styles.dashboard} aria-busy={isLoading}>
    <section className={styles.panel}>
      <div className={styles.panelTop}><ChartHeading icon={<ChartNoAxesCombined size={19} />} title="Xu hướng tỷ lệ hoàn thành" description={`${dateLabel(analysis.start)}–${dateLabel(analysis.end)} · cùng bộ lọc khu vực, địa bàn, COT rider và tìm kiếm`} /><div className={styles.legend}><span><i className={styles.deliDot} />Deli</span><span><i className={styles.pickDot} />Pick</span></div></div>
      <div className={styles.periodTotals} aria-label="Tổng hợp hiệu suất trong kỳ">
        <div><span>Delivery</span><strong>{percent(performanceRate(analysis.totals.delivery_delivered, analysis.totals.delivery_assigned))}</strong><small>{number(analysis.totals.delivery_delivered)} / {number(analysis.totals.delivery_assigned)} đơn</small></div>
        <div><span>Pickup</span><strong>{percent(performanceRate(analysis.totals.pickup_picked, analysis.totals.pickup_assigned))}</strong><small>{number(analysis.totals.pickup_picked)} / {number(analysis.totals.pickup_assigned)} đơn</small></div>
        <div><span>Rider phát sinh</span><strong>{number(analysis.riderCount)}</strong><small>Trong kỳ đang chọn</small></div>
      </div>
      <TrendChart key={`${analysis.start}:${analysis.end}`} daily={analysis.daily} />
      <p className={styles.method}>Mỗi ngày dùng dữ liệu đồng bộ gần nhất; ngày đang diễn ra có thể chưa đủ. Đường ngắt tại ngày thiếu dữ liệu. Deli = Total Delivered / Total Assigned Deli; Pick = Total Picked / Total Assigned Pick.</p>
    </section>
    <div className={styles.twoColumns}>
      <section className={styles.panel}>
        <ChartHeading icon={<Grid2X2 size={18} />} title="Hiệu suất theo khu × COT" description="Nhóm theo COT rider · COT1 đã gộp 1.1 + 1.2" />
        <CotMatrix areas={analysis.areas} onArea={onArea} />
        <p className={styles.method}>Ô hiển thị tỷ lệ và Total Delivered / Total Assigned Deli hoặc Total Picked / Total Assigned Pick. Bấm tên khu để lọc; ô không có đơn phân hiển thị “—”.</p>
      </section>
      <section className={styles.panel}>
        <ChartHeading icon={<Users size={18} />} title="Phân bố hiệu suất rider" description="Số rider theo tỷ lệ giao trong kỳ đang chọn" />
        <Distribution analysis={analysis} />
        <p className={styles.method}>{number(analysis.riderCount - analysis.withoutDelivery)} rider có đơn giao được phân · {number(analysis.withoutDelivery)} rider chưa có mẫu số giao.{analysis.anomalyCount > 0 && ` ${number(analysis.anomalyCount)} rider có tỷ lệ ngoài 0–100%, cần đối chiếu dữ liệu.`}</p>
      </section>
    </div>
  </div>;
}

function useChartWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(220, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function TrendChart({ daily }: { daily: Analysis["daily"] }) {
  const { ref, width } = useChartWidth();
  const [selected, setSelected] = useState(daily.length - 1);
  const active = daily[Math.min(selected, daily.length - 1)];
  const height = 260, left = 45, right = 20, top = 20, bottom = 35, plotWidth = width - left - right, plotHeight = height - top - bottom;
  const rate = (row: Analysis["daily"][number], type: "delivery" | "pickup") => "missing" in row ? null : type === "delivery" ? performanceRate(row.delivery_delivered, row.delivery_assigned) : performanceRate(row.pickup_picked, row.pickup_assigned);
  const max = Math.max(100, Math.ceil(Math.max(...daily.flatMap(row => [rate(row, "delivery") ?? 0, rate(row, "pickup") ?? 0])) / 25) * 25);
  const x = (index: number) => left + (daily.length === 1 ? plotWidth / 2 : index / (daily.length - 1) * plotWidth);
  const y = (value: number) => top + plotHeight * (1 - value / max);
  function path(type: "delivery" | "pickup") {
    let previous = false;
    return daily.map((row, index) => {
      const value = rate(row, type);
      if (value === null) { previous = false; return ""; }
      const command = `${previous ? "L" : "M"}${x(index)},${y(value)}`;
      previous = true;
      return command;
    }).join(" ");
  }
  const hasData = daily.some(row => !("missing" in row));
  return <div ref={ref} className={styles.trend}>
    {hasData ? <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className={styles.chart} role="img" aria-label="Tỷ lệ giao và lấy thành công theo ngày. Chọn điểm hoặc dùng bảng dữ liệu bên dưới." onPointerMove={event => {
      const box = event.currentTarget.getBoundingClientRect();
      const localX = (event.clientX - box.left) * width / box.width;
      setSelected(Math.max(0, Math.min(daily.length - 1, Math.round((localX - left) / plotWidth * (daily.length - 1)))));
    }}>
      <title>Xu hướng Deli và Pick</title>
      {[0, 1, 2, 3, 4].map(tick => { const value = tick * max / 4; return <g key={tick}><line className={styles.gridline} x1={left} x2={width - right} y1={y(value)} y2={y(value)} /><text x={left - 8} y={y(value) + 4} textAnchor="end">{percent(value)}</text></g>; })}
      {daily.map((row, index) => (index === 0 || index === daily.length - 1 || index % Math.max(1, Math.ceil(daily.length / (width < 450 ? 4 : 8))) === 0) && <text key={row.date} x={x(index)} y={height - 10} textAnchor="middle">{dateLabel(row.date)}</text>)}
      {active && <line x1={x(selected)} x2={x(selected)} y1={top} y2={height - bottom} className={styles.guide} />}
      {(["delivery", "pickup"] as const).map(type => <g key={type} className={type === "delivery" ? styles.delivery : styles.pickup}>
        <path d={path(type)} fill="none" stroke="currentColor" strokeWidth={2.5} strokeDasharray={type === "pickup" ? "6 4" : undefined} strokeLinejoin="round" />
        {daily.map((row, index) => { const value = rate(row, type); return value === null ? null : <circle key={row.date} cx={x(index)} cy={y(value)} r={index === selected ? 5 : 3.5} fill="currentColor" tabIndex={0} onFocus={() => setSelected(index)} onClick={() => setSelected(index)} aria-label={`${row.date}, ${type === "delivery" ? "Deli" : "Pick"}: ${percent(value)}`}><title>{`${row.date}: ${percent(value)}`}</title></circle>; })}
      </g>)}
    </svg> : <div className={styles.empty}>Chưa có dữ liệu xu hướng cho phạm vi này.</div>}
    <div className={styles.trendDetail} aria-live="polite">
      <strong>{active ? dateLabel(active.date) : "—"}</strong>
      {!active || "missing" in active ? <span>Chưa có dữ liệu</span> : <><span><i className={styles.deliDot} />Deli <b>{percent(rate(active, "delivery"))}</b><small>{number(active.delivery_delivered)} / {number(active.delivery_assigned)}</small></span><span><i className={styles.pickDot} />Pick <b>{percent(rate(active, "pickup"))}</b><small>{number(active.pickup_picked)} / {number(active.pickup_assigned)}</small></span><span>{number(active.riders)} rider</span></>}
    </div>
    <details className={styles.dataDetails}><summary>Xem số liệu từng ngày</summary><div className={styles.tableScroll}><table><thead><tr><th>Ngày</th><th>Total Delivered / Total Assigned Deli</th><th>Tỷ lệ giao</th><th>Total Picked / Total Assigned Pick</th><th>Tỷ lệ lấy</th></tr></thead><tbody>{daily.map(row => <DailyRow key={row.date} row={row} />)}</tbody></table></div></details>
  </div>;
}

function DailyRow({ row }: { row: Analysis["daily"][number] }) {
  return "missing" in row ? <tr><td>{dateLabel(row.date)}</td><td colSpan={4}>Chưa có dữ liệu</td></tr> : <tr><td>{dateLabel(row.date)}</td><td>{number(row.delivery_delivered)} / {number(row.delivery_assigned)}</td><td>{percent(performanceRate(row.delivery_delivered, row.delivery_assigned))}</td><td>{number(row.pickup_picked)} / {number(row.pickup_assigned)}</td><td>{percent(performanceRate(row.pickup_picked, row.pickup_assigned))}</td></tr>;
}

function CotMatrix({ areas, onArea }: { areas: AreaPerformance[]; onArea: (area: string) => void }) {
  const unknownDelivery = areas.reduce((sum, area) => sum + Math.max(0, area.delivery_assigned - area.delivery_assigned_cot1 - area.delivery_assigned_cot2), 0);
  const unknownPickup = areas.reduce((sum, area) => sum + Math.max(0, area.pickup_assigned - area.pickup_assigned_cot1 - area.pickup_assigned_cot2), 0);
  return <div className={styles.tableScroll}><table className={styles.matrix}><thead><tr><th scope="col">Khu</th><th scope="col">Deli <span>COT1</span></th><th scope="col">Deli <span>COT2</span></th><th scope="col">Pick <span>COT1</span></th><th scope="col">Pick <span>COT2</span></th></tr></thead><tbody>
    {areas.length === 0 ? <tr><td colSpan={5} className={styles.empty}>Chưa có dữ liệu trong kỳ đang chọn.</td></tr> : areas.map(area => <tr key={area.kv}><th scope="row"><button type="button" onClick={() => onArea(area.kv)} aria-label={`Lọc theo ${area.kv}`}>{area.kv}<ArrowUpRight size={12} /></button></th>{[
      [area.delivery_delivered_cot1, area.delivery_assigned_cot1], [area.delivery_delivered_cot2, area.delivery_assigned_cot2],
      [area.pickup_picked_cot1, area.pickup_assigned_cot1], [area.pickup_picked_cot2, area.pickup_assigned_cot2],
    ].map(([completed, assigned], index) => { const rate = performanceRate(completed, assigned); const opacity = rate === null ? 0 : Math.min(28, Math.max(5, (rate - 50) * .56)); return <td key={index}><div className={`${styles.matrixCell} ${index > 1 ? styles.pickup : styles.delivery}`} style={{ background: rate === null ? undefined : `color-mix(in srgb, currentColor ${opacity}%, var(--color-paper))` }}><strong>{percent(rate)}</strong><small>{number(completed)} / {number(assigned)}</small></div></td>; })}</tr>)}
  </tbody></table><div className={styles.matrixLegend}><span>Thấp</span><i /><span>Cao · thang màu 50–100%</span></div>{(unknownDelivery > 0 || unknownPickup > 0) && <p className={styles.method}>Chưa xác định COT rider: {number(unknownDelivery)} đơn giao phân, {number(unknownPickup)} đơn lấy phân. Các đơn này vẫn nằm trong tổng quan.</p>}</div>;
}

function Distribution({ analysis }: { analysis: Analysis }) {
  const { ref, width } = useChartWidth();
  const height = 260, left = 34, right = 12, top = 25, bottom = 45, plotHeight = height - top - bottom, plotWidth = width - left - right;
  const bins = analysis.distribution.filter((bin, index) => index < 5 || bin.count > 0);
  const maxCount = Math.max(1, ...bins.map(bin => bin.count)), step = Math.max(1, Math.ceil(maxCount / 4)), max = step * 4;
  return <div ref={ref}>
    {analysis.riderCount > analysis.withoutDelivery ? <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className={styles.chart} role="img" aria-label={`Phân bố ${number(analysis.riderCount - analysis.withoutDelivery)} rider có đơn giao được phân`}>
      <title>Phân bố tỷ lệ giao của rider</title>
      {[0, 1, 2, 3, 4].map(tick => { const y = top + plotHeight * (1 - tick / 4); return <g key={tick}><line className={styles.gridline} x1={left} x2={width - right} y1={y} y2={y} /><text x={left - 8} y={y + 4} textAnchor="end">{number(step * tick)}</text></g>; })}
      <text x={left} y={12}>Rider</text>
      {bins.map((bin, index) => { const barWidth = plotWidth / bins.length * .65, x = left + index * plotWidth / bins.length + plotWidth / bins.length * .175, y = top + plotHeight * (1 - bin.count / max); return <g key={bin.label}><rect x={x} y={y} width={barWidth} height={Math.max(0, top + plotHeight - y)} rx={4} className={styles.histogramBar}><title>{`${bin.label}: ${number(bin.count)} rider`}</title></rect><text x={x + barWidth / 2} y={y - 8} textAnchor="middle" className={styles.countLabel}>{number(bin.count)}</text><text x={x + barWidth / 2} y={height - 22} textAnchor="middle">{bin.label.replaceAll("%", "")}</text></g>; })}
      <text x={width - right} y={height - 3} textAnchor="end">Tỷ lệ giao (%)</text>
    </svg> : <div className={styles.empty}>Chưa có rider có đơn giao được phân trong kỳ.</div>}
    <details className={styles.dataDetails}><summary>Xem số rider theo dải tỷ lệ</summary><div className={styles.binList}>{bins.map(bin => <span key={bin.label}>{bin.label}<strong>{number(bin.count)} rider</strong></span>)}</div></details>
  </div>;
}
