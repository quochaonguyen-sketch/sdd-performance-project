"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChartNoAxesCombined, ChevronRight, List, MapPin, RefreshCw } from "lucide-react";
import { useRememberedState } from "@/components/layout/filter-memory";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import { Button } from "@/components/ui/button";
import { vietnamDay } from "@/lib/data-sources/catalog";
import { buildVolumeGeography, volumeDates, volumeTrail, type VolumeGeographyRow, type VolumeKind, type VolumeNode, type VolumePeriod } from "@/lib/dashboard/volume-geography";
import { shiftVolumeDay } from "@/lib/dashboard/volume-overview";
import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { readAllPages } from "@/lib/pickup/realtime";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import styles from "./volume-comparison.module.css";

const number = new Intl.NumberFormat("vi-VN");
const compact = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });
const fmt = (value: number | undefined) => value === undefined ? "—" : number.format(value);
const shortDay = (value: string) => value.slice(8, 10) + "/" + value.slice(5, 7);
const fullDay = (value: string) => shortDay(value) + "/" + value.slice(0, 4);
const levels = ["Khu vực", "Quận / huyện", "Phường / xã"];
const dashes = [undefined, "9 4", "3 4", "12 4 3 4", "2 5", "7 3 2 3"];
const seriesLimit = 6;

type LoadedVolume = {
  scope: string;
  version: number;
  root: VolumeNode | null;
  error: string | null;
};

export function VolumeComparison({ kind, onDetails }: { kind: VolumeKind; onDetails: () => void }) {
  const today = vietnamDay();
  const defaultStart = shiftVolumeDay(today, -13);
  const [saved, setPeriod] = useRememberedState<VolumePeriod>("volume-comparison:period", { start: defaultStart, end: today });
  const savedIsValid = volumeDates(saved, today).length > 0;
  const start = savedIsValid ? saved.start : defaultStart;
  const end = savedIsValid ? saved.end : today;
  const dates = useMemo(() => volumeDates({ start, end }, today), [start, end, today]);
  const [path, setPath] = useState<string[]>([]);
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<LoadedVolume | null>(null);
  const table = kind === "delivery" ? "delivery_order" : "pickup_volume";
  const scope = [kind, start, end].join(":");
  const current = result?.scope === scope ? result : null;
  const loading = current?.version !== version;
  const refresh = useCallback(() => setVersion(value => value + 1), []);
  useReportInitialDataLoading(`volume-${kind}`, loading && !current);
  useSupabaseRealtime({ table, onChange: refresh, debounceMs: 1_200 });

  useEffect(() => {
    const controller = new AbortController();
    const db = createClient();
    const ward = kind === "delivery" ? "old_ward" : "new_ward";
    const areas = kind === "delivery" ? OPERATING_AREAS : [...OPERATING_AREAS, "UNRESOLVED"];
    void readAllPages<VolumeGeographyRow>((from, to) => {
      controller.signal.throwIfAborted();
      return db.from(table).select(`report_date,area,district,${ward},total_orders`)
        .in("area", areas).gte("report_date", start).lte("report_date", end)
        .order("report_date").order("summary_id").range(from, to).abortSignal(controller.signal);
    }, 1000, 3).then(rows => {
      if (!controller.signal.aborted) {
        setResult({ scope, version, root: buildVolumeGeography(rows, kind, dates), error: null });
      }
    }).catch(error => {
      if (!controller.signal.aborted) {
        setResult(previous => ({
          scope, version, root: previous?.scope === scope ? previous.root : null,
          error: error instanceof Error ? error.message : "Không tải được dữ liệu Volume.",
        }));
      }
    });
    return () => controller.abort();
  }, [dates, end, kind, scope, start, table, version]);

  return <div className={styles.page}>
    <header className={styles.header}>
      <h1>{kind === "delivery" ? "Delivery Volume" : "Pickup Volume"}</h1>
      <div className={styles.actions}>
        <nav className={styles.switcher} aria-label="Loại Volume">
          <Link href="/volume/delivery" aria-current={kind === "delivery" ? "page" : undefined}>Delivery</Link>
          <Link href="/volume/pickup" aria-current={kind === "pickup" ? "page" : undefined}>Pickup</Link>
        </nav>
        <Button type="button" variant="outline" onClick={onDetails}><List size={16} aria-hidden="true"/>Báo cáo chi tiết</Button>
      </div>
    </header>
    <PeriodFilter key={scope} period={{ start, end }} today={today} loading={loading} onApply={setPeriod} onRefresh={refresh}/>
    {current?.error && !loading && <p className={styles.error} role="alert">
      Không tải được Volume. {current.root ? "Đang hiển thị dữ liệu lần tải trước. " : ""}{current.error}
    </p>}
    {current?.root && current.root.days.size > 0 ? (
      <div aria-busy={loading}>
        <GeographyComparison root={current.root} dates={dates} path={path} onPath={setPath}/>
      </div>
    ) : loading ? <p className={styles.empty} role="status">Đang tải sản lượng…</p>
      : !current?.error && <p className={styles.empty} role="status">Chưa có dữ liệu cho khoảng ngày đã chọn.</p>}
  </div>;
}

function PeriodFilter({ period, today, loading, onApply, onRefresh }: {
  period: VolumePeriod;
  today: string;
  loading: boolean;
  onApply: (period: VolumePeriod) => void;
  onRefresh: () => void;
}) {
  const [draft, setDraft] = useState(period);
  const [error, setError] = useState("");
  return <form className={styles.filters} onSubmit={event => {
    event.preventDefault();
    if (!volumeDates(draft, today).length) {
      setError("Chọn khoảng ngày hợp lệ, tối đa 31 ngày và đến hôm nay.");
      return;
    }
    setError("");
    onApply(draft);
  }}>
    <div className={styles.presets} role="group" aria-label="Khoảng ngày nhanh">
      {[7, 14].map(days => {
        const next = { start: shiftVolumeDay(today, 1 - days), end: today };
        const selected = period.start === next.start && period.end === next.end;
        return <button key={days} type="button" aria-pressed={selected}
          onClick={() => { setError(""); setDraft(next); onApply(next); }}>{days} ngày</button>;
      })}
    </div>
    <div className={styles.dateRange}>
      <label>Từ ngày<input type="date" required max={today} value={draft.start}
        onChange={event => setDraft({ ...draft, start: event.target.value })}/></label>
      <label>Đến ngày<input type="date" required max={today} value={draft.end}
        onChange={event => setDraft({ ...draft, end: event.target.value })}/></label>
    </div>
    <div className={styles.filterActions}>
      <Button type="submit">Áp dụng</Button>
      <Button type="button" variant="ghost" size="icon" onClick={onRefresh} disabled={loading}
        aria-label={loading ? "Đang tải" : "Làm mới"} title="Làm mới"><RefreshCw size={16} aria-hidden="true"/></Button>
    </div>
    {error && <p className={styles.filterError} role="alert">{error}</p>}
  </form>;
}

function GeographyComparison({ root, dates, path, onPath }: {
  root: VolumeNode;
  dates: string[];
  path: string[];
  onPath: (path: string[]) => void;
}) {
  const [day, setDay] = useState("");
  const activeDay = dates.includes(day) ? day : dates.findLast(value => root.days.has(value)) ?? dates.at(-1)!;
  const breadcrumb = useRef<HTMLElement>(null);
  const trail = volumeTrail(root, path);
  const scope = trail.at(-1)!;
  const labels = trail.slice(1).map(node => node.label);
  function navigate(next: string[]) {
    onPath(next);
    breadcrumb.current?.focus();
  }
  return <div className={styles.workspace}>
    <nav ref={breadcrumb} tabIndex={-1} className={styles.breadcrumb} aria-label="Địa bàn đang xem">
      <MapPin size={16} aria-hidden="true"/>
      {trail.map((node, index) => <span key={index}>
        {index > 0 && <ChevronRight size={14} aria-hidden="true"/>}
        {index === trail.length - 1
          ? <strong aria-current="location">{node.label}</strong>
          : <button type="button" onClick={() => navigate(labels.slice(0, index))}>{node.label}</button>}
      </span>)}
    </nav>
    <ComparisonPanel key={JSON.stringify(labels)} scope={scope} dates={dates} depth={labels.length}
      activeDay={activeDay} onDay={setDay} onDrill={label => navigate([...labels, label])}/>
  </div>;
}

function ComparisonPanel({ scope, dates, depth, activeDay, onDay, onDrill }: {
  scope: VolumeNode;
  dates: string[];
  depth: number;
  activeDay: string;
  onDay: (day: string) => void;
  onDrill: (label: string) => void;
}) {
  const groups = useMemo(() => [...scope.children.values()]
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "vi")), [scope]);
  const [picked, setPicked] = useState<string[] | null>(null);
  const shown = picked === null
    ? groups.slice(0, depth === 0 ? seriesLimit : 5)
    : picked.flatMap(label => { const group = scope.children.get(label); return group ? [group] : []; });
  const isWard = depth === 3;
  const traces = (isWard ? [scope] : shown).map((node, index) => {
    const areaIndex = OPERATING_AREAS.findIndex(area => area === node.label);
    const styleIndex = depth === 0 ? (areaIndex === -1 ? OPERATING_AREAS.length : areaIndex) : index;
    return { node, color: `var(--color-chart-${styleIndex + 1})`, dash: dashes[styleIndex] };
  });
  const title = isWard ? "Sản lượng phường/xã theo ngày" : `So sánh ${levels[depth].toLocaleLowerCase("vi")} theo ngày`;

  function toggleGroup(label: string, checked: boolean) {
    const selected = shown.map(group => group.label);
    setPicked(checked ? [...selected, label].slice(0, seriesLimit) : selected.filter(value => value !== label));
  }

  return <div className={styles.comparison}>
    <section className={styles.chartPanel} aria-labelledby="volume-chart-title">
      <h2 id="volume-chart-title">{title}</h2>
      <div className={styles.metric}>
        <strong>{fmt(scope.total)}</strong><span>đơn trong kỳ</span>
      </div>
      <p className={styles.coverage}>
        <span>{scope.days.size}/{dates.length} ngày có dữ liệu</span>
        {scope.days.size > 0 && <span>Bình quân {fmt(Math.round(scope.total / scope.days.size))} đơn/ngày</span>}
      </p>
      {traces.length ? <VolumeChart dates={dates} traces={traces} activeDay={activeDay} onDay={onDay}/>
        : <p className={styles.empty}>Chọn địa bàn trong bảng để hiện đường biểu đồ.</p>}
      {traces.some(({ node }) => node.days.size < dates.length) &&
        <p className={styles.note}>Đường ngắt tại ngày thiếu dữ liệu.</p>}
    </section>
    <section className={styles.breakdown} aria-labelledby="volume-table-title">
      <div className={styles.breakdownHeader}>
        <h2 id="volume-table-title">{isWard ? "Số liệu từng ngày" : levels[depth]}</h2>
        <select aria-label="Ngày xem số liệu" value={activeDay} onChange={event => onDay(event.target.value)}>
          {dates.map(value => <option key={value} value={value}>{fullDay(value)}</option>)}
        </select>
      </div>
      <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Bảng sản lượng Volume">
        {isWard ? <table>
          <thead><tr><th scope="col">Ngày</th><th scope="col">Sản lượng</th></tr></thead>
          <tbody>{dates.map(value => <tr key={value} data-current={value === activeDay || undefined}>
            <th scope="row"><button type="button" className={styles.drill} onClick={() => onDay(value)}>{fullDay(value)}</button></th>
            <td>{fmt(scope.days.get(value))}</td>
          </tr>)}</tbody>
        </table> : <table>
          <thead><tr>
            <th scope="col" className={styles.seriesCell} aria-label="Hiện trên biểu đồ"><ChartNoAxesCombined size={15} aria-hidden="true"/></th>
            <th scope="col" className={styles.nameCell}>Địa bàn</th><th scope="col" className={styles.activeColumn}>{shortDay(activeDay)}</th><th scope="col">Tổng kỳ</th>
          </tr></thead>
          <tbody>{groups.map(group => {
            const trace = traces.find(({ node }) => node === group);
            return <tr key={group.label}>
              <td className={styles.seriesCell}><label className={styles.check}>
                <input type="checkbox" checked={Boolean(trace)} aria-label={`Hiện ${group.label} trên biểu đồ`}
                  style={{ accentColor: trace?.color }} disabled={!trace && shown.length >= seriesLimit}
                  onChange={event => toggleGroup(group.label, event.target.checked)}/>
              </label></td>
              <th scope="row"><button type="button" className={styles.drill} onClick={() => onDrill(group.label)}>
                {group.label}<ChevronRight size={14} aria-hidden="true"/>
              </button></th>
              <td className={styles.activeColumn}>{fmt(group.days.get(activeDay))}</td><td>{fmt(group.total)}</td>
            </tr>;
          })}</tbody>
        </table>}
      </div>
      {!isWard && <div className={styles.breakdownFooter}>
        <span>{shown.length}/{groups.length} địa bàn trên biểu đồ</span>
        {picked !== null && <button type="button" onClick={() => setPicked(null)}>Đặt lại</button>}
      </div>}
    </section>
  </div>;
}

type VolumeTrace = { node: VolumeNode; color: string; dash: string | undefined };

function VolumeChart({ dates, traces, activeDay, onDay }: {
  dates: string[]; traces: VolumeTrace[]; activeDay: string; onDay: (day: string) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [{ width, height }, setSize] = useState({ width: 720, height: 282 });
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([{ contentRect }]) => {
      setSize({ width: Math.max(240, Math.floor(contentRect.width)), height: contentRect.height });
    });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  const left = 50, right = width - 16, top = 16, bottom = height - 34;
  const maximum = Math.max(4, ...traces.flatMap(({ node }) => [...node.days.values()]));
  const magnitude = 10 ** Math.floor(Math.log10(maximum / 4));
  const step = Math.ceil(maximum / (4 * magnitude)) * magnitude;
  const spacing = (right - left) / dates.length;
  const x = (index: number) => left + spacing * (index + 0.5);
  const y = (value: number) => bottom - (bottom - top) * value / (step * 4);
  const selectedIndex = dates.indexOf(activeDay);
  const tickStep = Math.ceil(44 / spacing);

  return <>
    <div ref={frame} className={styles.chartFrame}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Biểu đồ đường sản lượng từng ngày">
        <rect x={left + spacing * selectedIndex} y={top} width={spacing} height={bottom - top}
          rx={4} className={styles.focusDay}/>
        {Array.from({ length: 5 }, (_, index) => index * step).map(value => <g key={value}>
          <line x1={left} x2={right} y1={y(value)} y2={y(value)} className={styles.gridLine}/>
          <text x={left - 8} y={y(value) + 4} textAnchor="end" className={styles.axis}>{value >= 100_000 ? compact.format(value) : fmt(value)}</text>
        </g>)}
        {dates.map((day, index) => {
          if (index !== selectedIndex && (index % tickStep !== 0 || Math.abs(index - selectedIndex) * spacing < 44)) return null;
          return <text key={day} x={x(index)} y={height - 12} textAnchor="middle"
            className={index === selectedIndex ? styles.activeAxis : styles.axis}>{shortDay(day)}</text>;
        })}
        {dates.map((day, index) => <rect key={day} x={left + spacing * index} y={top} width={spacing} height={bottom - top}
          fill="transparent" className={styles.hitDay} onClick={() => onDay(day)}/>)}
        {traces.map(({ node, color, dash }) => {
          const values = dates.map(day => node.days.get(day));
          const path = values.map((value, i) => value === undefined ? ""
            : `${i === 0 || values[i - 1] === undefined ? "M" : "L"}${x(i)},${y(value)}`).join(" ");
          return <g key={node.label}>
            <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeDasharray={dash} strokeLinecap="round" pointerEvents="none"/>
            {values.map((value, i) => value !== undefined && <circle key={dates[i]} cx={x(i)} cy={y(value)}
              r={i === selectedIndex ? 5 : 2.8} fill={color} className={styles.point} onClick={() => onDay(dates[i])}>
              <title>{`${node.label} · ${fullDay(dates[i])} · ${fmt(value)} đơn`}</title>
            </circle>)}
          </g>;
        })}
      </svg>
    </div>
    <ul className={styles.legend} aria-label="Địa bàn trên biểu đồ">
      {traces.map(({ node, color, dash }) => <li key={node.label}>
        <svg viewBox="0 0 26 10" width={26} height={10} aria-hidden="true">
          <line x1={0} x2={26} y1={5} y2={5} strokeWidth={2.5} stroke={color} strokeDasharray={dash}/>
        </svg>
        <span>{node.label}</span>
      </li>)}
    </ul>
  </>;
}
