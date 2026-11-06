"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Download, Filter, RefreshCw, Search, MapPin, Users } from "lucide-react";
import { useRememberedState } from "@/components/layout/filter-memory";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import { OH_AREAS, ohPivotIndex, ohRange, ohRankings, ohSummary, ohWeekRange, reasonNameVi, type OHData, type OHRank } from "@/lib/onhold/model";
import { OHOrderDialog } from "./oh-order-dialog";
import s from "./oh-workspace.module.css";

const number = (value: number) => value.toLocaleString("vi-VN");
const date = (value: string) => value.split("-").reverse().join("/");

export function OHWorkspace({ initialData, initialError = "", from, today }: {
  initialData?: OHData; initialError?: string; from: string; today: string;
}) {
  const [data, setData] = useState<OHData>(initialData ?? { reports: [], cells: [] });
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(!initialData);
  const [hasLoaded, setHasLoaded] = useState(!!initialData);
  const [busy, setBusy] = useState(false);
  const [start, setStart] = useRememberedState("oh-workspace:start", from);
  const [end, setEnd] = useRememberedState("oh-workspace:end", today);
  const [range, setRange] = useRememberedState("oh-workspace:range", { from, to: today });
  const [loadedRange, setLoadedRange] = useState({ from, to: today });
  const [refreshKey, setRefreshKey] = useState(0);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [dateMode, setDateMode] = useState("range");
  const [week, setWeek] = useState("");
  const [area, setArea] = useRememberedState("oh-workspace:area", "all");
  const [district, setDistrict] = useRememberedState("oh-workspace:district", "all");
  const [ward, setWard] = useRememberedState("oh-workspace:ward", "all");
  const [reason, setReason] = useState("all");
  const [day, setDay] = useRememberedState("oh-workspace:day", today);
  const [geoMode, setGeoMode] = useState<"ward" | "district">("ward");
  const [query, setQuery] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const filters = useRef<HTMLDetailsElement>(null);
  const timePicker = useRef<HTMLDetailsElement>(null);
  useReportInitialDataLoading("onhold", loading);

  useEffect(() => {
    if (initialData && refreshKey === 0 && range.from === from && range.to === today) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      setError("");
      try {
        ohRange(range.from, range.to, today);
        const response = await fetch(`/api/onhold?from=${range.from}&to=${range.to}`, {
          cache: "no-store", signal: controller.signal,
          headers: forceRefresh ? { "x-dashboard-refresh": "1" } : undefined,
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Không tải được dữ liệu OH.");
        if (controller.signal.aborted) return;
        setData(payload);
        setHasLoaded(true);
        setLoadedRange(range);
        setDay(previous => previous < range.from || previous > range.to ? range.to : previous);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Không tải được dữ liệu OH.");
      } finally {
        if (!controller.signal.aborted) { setLoading(false); setBusy(false); }
      }
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [initialData, refreshKey, forceRefresh, range, from, today, setDay]);

  const reports = useMemo(() => new Map(data.reports.map(report => [report.report_date, report])), [data.reports]);
  const periodCells = useMemo(() => data.cells.filter(cell =>
    cell.report_date >= loadedRange.from && cell.report_date <= loadedRange.to && reports.has(cell.report_date)
  ), [data.cells, loadedRange, reports]);
  const areaCells = useMemo(() => periodCells.filter(cell => area === "all" || cell.area === area), [periodCells, area]);
  const districts = useMemo(() => filtersOpen ? ohRankings(areaCells, "district") : [], [areaCells, filtersOpen]);
  const wards = useMemo(() => filtersOpen ? ohRankings(areaCells.filter(cell => district === "all" || (cell.district || "Chưa rõ quận") === district), "ward") : [], [areaCells, district, filtersOpen]);
  const reasonLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const cell of data.cells) labels[cell.reason] = cell.reason_label || reasonNameVi(cell.reason);
    return labels;
  }, [data.cells]);
  const reasons = useMemo(() => [...new Set(areaCells.map(cell => cell.reason))].sort(), [areaCells]);
  const cells = useMemo(() => areaCells.filter(cell =>
    (district === "all" || (cell.district || "Chưa rõ quận") === district) &&
    (ward === "all" || (cell.ward || "Chưa rõ phường") === ward) &&
    (reason === "all" || cell.reason === reason)
  ), [areaCells, district, ward, reason]);
  const total = useMemo(() => ohSummary(cells).total, [cells]);
  const geography = useMemo(() => ohRankings(cells, geoMode), [cells, geoMode]);
  const riders = useMemo(() => ohRankings(cells, "rider"), [cells]);
  const days = useMemo(() => Array.from({ length: Math.round((Date.parse(loadedRange.to) - Date.parse(loadedRange.from)) / 86400000) + 1 },
    (_, i) => new Date(Date.parse(loadedRange.from) + i * 86400000).toISOString().slice(0, 10)), [loadedRange]);
  const coverage = days.filter(day => reports.has(day)).length;
  const partial = days.some(day => {
    const report = reports.get(day);
    return report && !report.finalized_at && (report.collection_mode === "cumulative" || day === today);
  });
  const extraFilters = Number(district !== "all") + Number(ward !== "all") + Number(reason !== "all");
  const period = loadedRange.from === loadedRange.to ? date(loadedRange.from) : `${date(loadedRange.from)} – ${date(loadedRange.to)}`;
  const tableKey = JSON.stringify([loadedRange, area, district, ward, reason, query]);
  const daily = useMemo(() => {
    if (!detailsOpen) return null;
    const selected = cells.filter(cell => cell.report_date === day);
    const counts = new Map<string, number>();
    const hours = Array<number>(24).fill(0);
    for (const cell of selected) {
      counts.set(cell.reason, (counts.get(cell.reason) ?? 0) + cell.orders);
      if (cell.hour >= 0 && cell.hour < 24) hours[cell.hour] += cell.orders;
    }
    return { total: ohSummary(selected).total, reasons: [...counts].sort((a, b) => b[1] - a[1]), hours, pivot: ohPivotIndex(cells) };
  }, [cells, day, detailsOpen]);

  function refresh() {
    try {
      const next = dateMode === "week" ? ohWeekRange(week, today) : ohRange(start, end, today);
      setStart(next.from);
      setEnd(next.to);
      setRange(next);
      setForceRefresh(false);
      timePicker.current?.removeAttribute("open");
      setRefreshKey(key => key + 1);
      setError("");
    } catch (error) { setError(error instanceof Error ? error.message : "Khoảng ngày không hợp lệ."); }
  }

  function resetFilters() { setDistrict("all"); setWard("all"); setReason("all"); }

  function exportCsv() {
    const rows = [["Loại", "Tên", "Mã rider / Quận", "Khu vực", "Lượt OH", "Từ ngày", "Đến ngày"],
      ...geography.map(row => [geoMode === "ward" ? "Phường" : "Quận", row.name, row.detail, row.area ?? "", row.orders, loadedRange.from, loadedRange.to]),
      ...riders.map(row => ["Rider", row.name, row.detail, row.area ?? "", row.orders, loadedRange.from, loadedRange.to])];
    const csv = "\ufeff" + rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `OH-${loadedRange.from}-${loadedRange.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div className={s.page}>
    <header className={s.header}>
      <h1>Onhold Analytics</h1>
      <button className={s.button} type="button" onClick={exportCsv} disabled={!coverage || busy || loading}><Download size={16} aria-hidden="true"/>Xuất báo cáo</button>
    </header>

    <form id="onhold-details" className={s.toolbar} onInvalidCapture={() => timePicker.current?.setAttribute("open", "")} onSubmit={event => { event.preventDefault(); refresh(); }}>
      <details ref={timePicker} className={s.timePicker} onKeyDown={event => {
        if (event.key === "Escape") { timePicker.current?.removeAttribute("open"); timePicker.current?.querySelector("summary")?.focus(); }
      }}>
        <summary><CalendarDays size={17} aria-hidden="true"/><span><small>Thời gian</small>{period}</span><ChevronDown size={15} aria-hidden="true"/></summary>
        <div className={s.timeFields}>
        <label>Thời gian<select value={dateMode} onChange={event => setDateMode(event.target.value)}>
          <option value="range">Khoảng ngày</option><option value="week">Theo tuần</option>
        </select></label>
        {dateMode === "week" ? <label>Tuần<input type="week" value={week} required onChange={event => setWeek(event.target.value)}/></label> : <>
          <label>Từ ngày<input type="date" value={start} max={today} required onChange={event => setStart(event.target.value)}/></label>
          <label>Đến ngày<input type="date" value={end} max={today} required onChange={event => setEnd(event.target.value)}/></label>
        </>}
        <button className={s.primary} type="submit" disabled={busy || loading}><RefreshCw size={15} aria-hidden="true" className={busy ? s.spinning : undefined}/>{busy ? "Đang tải…" : "Áp dụng"}</button>
        </div>
      </details>
      <div className={s.scopeFields}>
        <label>Khu vực<select value={area} onChange={event => { setArea(event.target.value); resetFilters(); }}>
          <option value="all">Tất cả khu vực</option>{OH_AREAS.map(area => <option key={area}>{area}</option>)}
        </select></label>
        <details ref={filters} className={s.filters} onToggle={event => setFiltersOpen(event.currentTarget.open)} onKeyDown={event => {
          if (event.key === "Escape") { filters.current?.removeAttribute("open"); filters.current?.querySelector("summary")?.focus(); }
        }}>
          <summary><Filter size={15} aria-hidden="true"/>Bộ lọc{extraFilters > 0 && <span>{extraFilters}</span>}<ChevronDown size={14} aria-hidden="true"/></summary>
          <div className={s.filterPanel}>
            <label>Quận / huyện<select value={district} onChange={event => { setDistrict(event.target.value); setWard("all"); }}>
              <option value="all">Tất cả quận</option>{districts.map(row => <option key={row.key} value={row.name}>{row.name}</option>)}
            </select></label>
            <label>Phường / xã<select value={ward === "all" ? "all" : JSON.stringify([district, ward])} onChange={event => {
              if (event.target.value === "all") { setWard("all"); return; }
              const [district, ward] = JSON.parse(event.target.value) as [string, string]; setDistrict(district); setWard(ward);
            }}>
              <option value="all">Tất cả phường</option>{wards.map(row => <option key={row.key} value={JSON.stringify([row.detail, row.name])}>{row.name} · {row.detail}</option>)}
            </select></label>
            <label>Lý do OH<select value={reason} onChange={event => setReason(event.target.value)}>
              <option value="all">Tất cả lý do</option>{reasons.map(code => <option key={code} value={code}>{reasonLabels[code]}</option>)}
            </select></label>
            <button className={s.button} type="button" onClick={resetFilters} disabled={!extraFilters}>Xóa bộ lọc</button>
          </div>
        </details>
        <button className={s.button} type="button" aria-label="Làm mới báo cáo" title="Làm mới báo cáo" disabled={busy || loading} onClick={() => { setRange(loadedRange); setForceRefresh(true); setRefreshKey(key => key + 1); }}><RefreshCw size={16} aria-hidden="true" className={busy ? s.spinning : undefined}/></button>
      </div>
    </form>

    {error && <p className={s.error} role="alert">{error}{hasLoaded ? " Đang hiển thị dữ liệu lần tải thành công gần nhất." : ""}</p>}
    {loading ? <div className={s.loading} role="status">Đang tải báo cáo OH…</div> : !hasLoaded ? <div className={s.empty}>Chưa tải được dữ liệu. Nhấn nút làm mới để thử lại.</div> : <>
      <section className={s.overview} aria-label="Tổng OH trong kỳ" aria-busy={busy}>
        <div className={s.overviewMetric}><p>TỔNG ONHOLD</p>
          <div className={s.total} title="Tổng lượt OH theo ngày; một mã đơn có thể xuất hiện ở nhiều ngày."><strong>{coverage ? number(total) : "—"}</strong><span>lượt OH</span></div>
          {(extraFilters > 0 || partial || coverage < days.length) && <p className={s.note}>
            {[district !== "all" ? district : "", ward !== "all" ? ward : "", reason !== "all" ? reasonLabels[reason] : "", partial ? "Có ngày chưa chốt" : "", coverage < days.length ? `Thiếu ${days.length - coverage} ngày báo cáo` : ""].filter(Boolean).join(" · ")}
          </p>}
        </div>
        <label className={s.search}><Search size={17} aria-hidden="true"/><span className={s.srOnly}>Tìm phường hoặc rider</span><input type="search" value={query} placeholder="Tìm phường, rider, mã rider…" onChange={event => setQuery(event.target.value)}/></label>
      </section>

      {!coverage ? <div className={s.empty}>Chưa có báo cáo trong khoảng ngày này. Hãy chọn khoảng ngày khác.</div> : <div className={s.rankings}>
        <RankPanel key={`geo:${geoMode}:${tableKey}`} title={geoMode === "ward" ? "Phường / xã" : "Quận / huyện"} rows={geography} total={total} query={query}
          controls={<div className={s.tabs} role="group" aria-label="Thống kê theo địa bàn">
            <button type="button" aria-pressed={geoMode === "ward"} onClick={() => setGeoMode("ward")}>Phường</button>
            <button type="button" aria-pressed={geoMode === "district"} onClick={() => setGeoMode("district")}>Quận</button>
          </div>}/>
        <RankPanel key={`rider:${tableKey}`} title="Rider" rows={riders} total={total} query={query}/>
      </div>}

      <details className={s.details} onToggle={event => setDetailsOpen(event.currentTarget.open)}>
        <summary>Chi tiết theo ngày<ChevronDown size={17} aria-hidden="true"/></summary>
        {detailsOpen && daily && <div className={s.detailsBody}>
          <div className={s.detailToolbar}>
            <label>Ngày xem chi tiết<input type="date" value={day} min={loadedRange.from} max={loadedRange.to} required onChange={event => setDay(event.target.value)}/></label>
            <span>{reports.has(day) ? `${number(daily.total)} lượt OH` : "Chưa có báo cáo"}</span>
            <button type="button" className={s.button} disabled={!reports.has(day)} onClick={() => setOrdersOpen(true)}>Xem / xuất mã đơn</button>
          </div>
          {reports.has(day) && <div className={s.dailyGrid}>
            <section><h2>Lý do OH</h2>{daily.reasons.length ? daily.reasons.map(([code, count]) => <div className={s.reason} key={code}><span>{reasonLabels[code]}</span><strong>{number(count)}</strong></div>) : <p>Không có OH khớp bộ lọc.</p>}</section>
            <section><h2>OH theo giờ</h2><div className={s.hours}>{daily.hours.map((count, hour) => <div key={hour} data-active={count > 0 || undefined}><span>{hour}h</span><strong>{number(count)}</strong></div>)}</div></section>
          </div>}
          <h2>OH theo ngày và khu vực</h2>
          <div className={s.tableScroll} tabIndex={0} role="region" aria-label="Bảng OH theo ngày và khu vực">
            <table><thead><tr><th scope="col">Khu vực</th>{days.map(day => <th key={day} scope="col">{date(day)}</th>)}</tr></thead>
              <tbody>{OH_AREAS.filter(item => area === "all" || item === area).map(area => <tr key={area}><th scope="row">{area}</th>{days.map(day => <td key={day}>{reports.has(day) ? number(daily.pivot.get(day)?.get(area) ?? 0) : "—"}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <Link href="/data-sources">Quản lý nguồn dữ liệu</Link>
        </div>}
      </details>
    </>}
    {ordersOpen && <OHOrderDialog isOpen onClose={() => setOrdersOpen(false)} day={day} today={today} filters={{ status: "all", area, district, ward, reason }} reasonLabelMap={reasonLabels}/>}
  </div>;
}

function RankPanel({ title, rows, total, query, controls }: {
  title: string; rows: OHRank[]; total: number; query: string; controls?: React.ReactNode;
}) {
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const text = query.trim().toLocaleLowerCase("vi");
    return text ? rows.filter(row => [row.name, row.detail, row.area, row.district, row.ward, ...(row.wards ?? [])].some(value => value?.toLocaleLowerCase("vi").includes(text))) : rows;
  }, [rows, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * 10, current * 10 + 10);
  return <section className={s.panel} aria-label={`Thống kê ${title}`}>
    <header className={s.panelHeader}><div className={s.panelIdentity}><span className={s.panelIcon}>{title === "Rider" ? <Users size={18} aria-hidden="true"/> : <MapPin size={18} aria-hidden="true"/>}</span><h2>{title}<span>{number(rows.length)}</span></h2></div>{controls}</header>
    <div className={s.tableScroll} tabIndex={0} role="region" aria-label={`Bảng OH theo ${title}`}>
      <table><thead><tr><th scope="col">#</th><th scope="col">{title}</th><th scope="col">Lượt OH</th><th scope="col">Tỷ trọng</th></tr></thead>
        <tbody>{visible.map((row, index) => <tr key={row.key}>
          <td className={s.rank}>{current * 10 + index + 1}</td>
          <th scope="row"><span className={s.name}>{row.name}</span><small><span>{row.detail === "Chưa có mã rider" ? row.name === "Chưa rõ rider" ? "Nguồn thiếu ID và tên" : "Nhận diện theo tên" : row.detail}</span>{row.area && <span className={s.areaTag}>{row.area}</span>}</small></th>
          <td className={s.count}>{number(row.orders)}</td><td className={s.share}>{total ? `${(row.orders / total * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%` : "0%"}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {!visible.length && <p className={s.empty}>{query ? "Không tìm thấy kết quả." : "Không có OH khớp bộ lọc."}</p>}
    <footer className={s.pagination}><span>{filtered.length ? `${current * 10 + 1}–${current * 10 + visible.length}` : "0"} / {number(filtered.length)}</span>
      <div><button type="button" aria-label={`Trang trước ${title}`} disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft size={16} aria-hidden="true"/></button><span>{current + 1}/{pages}</span><button type="button" aria-label={`Trang sau ${title}`} disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}><ChevronRight size={16} aria-hidden="true"/></button></div>
    </footer>
  </section>;
}
