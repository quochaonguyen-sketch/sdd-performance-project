"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { LostCompensationData } from "@/lib/lost/analysis";
import styles from "./lost-compensation.module.css";

const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });
const axisNumber = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });
const monthlyLabel = (month: string) => `${month.slice(5)}/${month.slice(0, 4)}`;
const moneyLabel = (value: number | null) => value === null ? "—" : money.format(value);
const pointLabel = (value: number | null) => value === null ? "Chưa có số tiền" : money.format(value);

export function LostCompensation({ data }: { data: LostCompensationData }) {
  const [selected, setSelected] = useState<number | null>(null);
  const { currentMonth, previousMonth, currentEnd, previousDays, currentTotal, previousTotal, previousMonthTotal, delta, change, points } = data;
  const current = monthlyLabel(currentMonth);
  const previous = monthlyLabel(previousMonth);
  const chartHasData = currentTotal !== null || previousTotal !== null;
  const active = points.find(point => point.day === selected) ?? points.at(-1);
  const trend = delta === null ? "empty" : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const Trend = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const values = points.flatMap(point => [point.current ?? 0, point.previous ?? 0]);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const roughStep = Math.max(1, (max - min) / 4);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = Math.ceil(roughStep / magnitude) * magnitude;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const bottom = Math.floor(min / step) * step;
  const ticks = Array.from({ length: (top - bottom) / step + 1 }, (_, index) => top - index * step);
  const axisUnit = Math.max(top, -bottom) >= 1_000_000 ? 1_000_000 : 1;
  const y = (value: number) => (top - value) / (top - bottom) * 100;

  return <section className={styles.panel} aria-labelledby="lost-compensation-title">
    <header className={styles.header}>
      <div>
        <h2 id="lost-compensation-title">Tiền đền bù theo tháng</h2>
        <p>Theo ngày chốt đền bù · So sánh cùng kỳ</p>
      </div>
    </header>
    <dl className={styles.metrics}>
      <div className={styles.currentMetric}>
        <dt>Tháng này <span>{current}</span></dt>
        <dd>{moneyLabel(currentTotal)}</dd>
        <dd className={styles.metricNote}>{currentTotal === null ? "Chưa có số tiền tháng này" : `Từ 01/${current} đến ${currentEnd.slice(-2)}/${current}`}</dd>
      </div>
      <div>
        <dt>Cùng kỳ tháng trước <span>{previous}</span></dt>
        <dd>{moneyLabel(previousTotal)}</dd>
        <dd className={styles.metricNote}>Ngày 01–{String(previousDays).padStart(2, "0")} · Cả tháng {moneyLabel(previousMonthTotal)}</dd>
      </div>
      <div className={styles.delta} data-trend={trend}>
        <dt>So với cùng kỳ</dt>
        <dd><Trend size={22} aria-hidden="true" /> {delta === null ? "—" : delta === 0 ? "Không đổi" : `${delta > 0 ? "Tăng" : "Giảm"} ${money.format(Math.abs(delta))}`}</dd>
        <dd className={styles.metricNote}>
          {delta === null ? "Chưa đủ số liệu để so sánh" : change === null ? "Chưa có mức gốc để tính tỷ lệ" : percent.format(change)}
          {previousDays < points.length && ` · Ngày 01–${previousDays}`}
        </dd>
      </div>
    </dl>

    {active && chartHasData ? <div className={styles.chart}>
      <div className={styles.chartHeader}>
        <h3>Tiền đền bù từng ngày</h3>
        <div className={styles.legend} aria-label="Chú giải">
          <span><i className={styles.currentBar} aria-hidden="true" /> Tháng {current}</span>
          <span><i className={styles.previousBar} aria-hidden="true" /> Tháng {previous}</span>
        </div>
      </div>
      <div className={styles.unit} aria-hidden="true">{axisUnit === 1 ? "₫" : "Triệu ₫"}</div>
      <div className={styles.chartBody}>
        <div className={styles.axis} aria-hidden="true">
          {ticks.map(tick => <span key={tick} style={{ top: `${y(tick)}%` }}>{axisNumber.format(tick / axisUnit)}</span>)}
        </div>
        <div className={styles.scroll} tabIndex={0} role="region" aria-label="Biểu đồ tiền đền bù theo ngày">
          <div className={styles.plot} style={{ gridTemplateColumns: `repeat(${points.length}, minmax(44px, 1fr))` }}>
            <div className={styles.gridlines} aria-hidden="true">
              {ticks.map(tick => <div key={tick} data-zero={tick === 0} style={{ top: `${y(tick)}%` }} />)}
            </div>
            {points.map(point => <div className={styles.day} key={point.day}>
              <button type="button" aria-pressed={active.day === point.day}
                aria-label={`Ngày ${point.day}: tháng ${current} ${pointLabel(point.current)}, tháng ${previous} ${point.day > previousDays ? "Ngoài cùng kỳ" : pointLabel(point.previous)}`}
                onFocus={() => setSelected(point.day)} onClick={() => setSelected(point.day)}>
                {[point.current, point.previous].map((amount, index) => <span className={styles.barTrack} key={index} aria-hidden="true">
                  {amount !== null && amount !== 0 && <span className={index === 0 ? styles.currentBar : styles.previousBar}
                    style={{ top: `${Math.min(y(amount), y(0))}%`, height: `${Math.abs(y(amount) - y(0))}%` }} />}
                </span>)}
              </button>
              <span className={styles.dayLabel} aria-hidden="true">{point.day}</span>
            </div>)}
          </div>
        </div>
      </div>
      <div className={styles.selected} aria-live="polite">
        <strong>Ngày {active.day}</strong>
        <span>Tháng {current} <b>{pointLabel(active.current)}</b></span>
        <span>Tháng {previous} <b>{active.day > previousDays ? "Ngoài cùng kỳ" : pointLabel(active.previous)}</b></span>
      </div>
    </div> : <p className={styles.empty}>Chưa có số tiền đền bù trong hai kỳ đang so sánh.</p>}
  </section>;
}
