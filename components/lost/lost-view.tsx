"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, ArrowUpDown, CalendarClock, ChevronLeft, ChevronRight, ExternalLink, ListFilter, PackageSearch, Search,
} from "lucide-react";
import { defaultLostFilters, lostPageSize, noLostClassification, type LostFilters, type LostPageData, type LostSort } from "@/lib/lost/list";
import { lostLogRole, matchesLostGroup, type LostLog } from "@/lib/lost/model";
import type { LostAnalysisData, LostCompensationData } from "@/lib/lost/analysis";
import { LostAnalysis } from "./lost-analysis";
import { LostCompensation } from "./lost-compensation";
import { WhDateRangePicker } from "@/components/wh/wh-date-picker";
import styles from "./lost.module.css";

const sheet = "https://docs.google.com/spreadsheets/d/1gsUhZMc5jLvFizy804gtAan3vtzxmmjKwOvycrj4xZU/edit?gid=1396828508#gid=1396828508";
const dateTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "medium", hourCycle: "h23" });
const number = new Intl.NumberFormat("vi-VN");
const percent = new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 2 });
const displayTime = (seconds: number) => dateTime.format(seconds * 1000);

function displayStatus(value: string) {
  if (value.toLowerCase() === "fmhub_pickup_handedover_to_station") return "Pickup Handedover";
  if (value.toLowerCase() === "fmhub_pickup_done") return "Pickup Done";
  return value.replaceAll("_", " ") || "Chưa có trạng thái";
}

function LostLogDetails({ row }: { row: LostPageData["rows"][number] }) {
  const [logs, setLogs] = useState<LostLog[] | null>(null);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function load() {
    if (logs || pending.current) return;
    const request = new AbortController();
    pending.current = request;
    setError("");
    try {
      const params = new URLSearchParams({ row: String(row.row), shipment: row.shipment });
      const response = await fetch(`/api/lost?${params}`, { signal: request.signal });
      if (!response.ok) throw Error("Chưa tải được chi tiết log.");
      const data = await response.json();
      if (!request.signal.aborted) setLogs(data.logs);
    } catch {
      if (!request.signal.aborted) setError("Chưa tải được chi tiết log.");
    } finally {
      pending.current = null;
    }
  }

  return <details onToggle={event => { if (event.currentTarget.open) void load(); }}>
    <summary>
      <ChevronRight size={14} aria-hidden="true" />
      <span>{row.logRider}<small>
        {row.logRole}{row.logRole === "Chưa rõ vai trò" && row.logSource && ` · ${row.logSource}`}
        {row.logSourcesChecked === false && " · Chưa đối chiếu Ops"}
      </small></span>
    </summary>
    {!row.event && <small>Chưa xác định mốc để đối chiếu thời gian</small>}
    {error ? <div className={styles.log} role="alert">{error} <button className={styles.clear} type="button" onClick={() => void load()}>Thử lại</button></div>
      : !logs ? <small role="status">Đang tải log…</small> : logs.length === 0 ? <small>Đơn này không còn log trong bản đối soát hiện tại.</small>
        : logs.map(log => <div className={styles.log} key={`${log.rider}:${log.at}:${log.app ?? ""}:${log.error}`}>
          <strong>{log.rider || "Chưa rõ người ghi"}</strong>
          <small>{[lostLogRole(log), log.app, displayTime(log.at)].filter(Boolean).join(" · ")}</small>
          {log.error && <p>{log.error}</p>}
        </div>)}
  </details>;
}

export function LostView({ initial, initialAnalysis, compensation }: {
  initial: LostPageData; initialAnalysis: LostAnalysisData; compensation: LostCompensationData;
}) {
  const [data, setData] = useState(initial);
  const [filters, setFilters] = useState(defaultLostFilters);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => () => {
    pending.current?.abort();
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);
  const { incident, q, status, withLogs, from, to } = filters;
  const selectedIncident = data.incidents.find(option => option.key === data.incident);
  const { rows, syncedAt, error, total, page: current, last, checked, logRows } = data;
  const hasFilters = incident !== null || !!q.trim() || status !== "all" || withLogs || !!from || !!to;

  function changeFilters(next: LostFilters, debounce = false) {
    setFilters(next);
    pending.current?.abort();
    if (timer.current !== null) clearTimeout(timer.current);
    setLoading(true);
    setRequestError("");
    const request = new AbortController();
    pending.current = request;
    async function load() {
      const params = new URLSearchParams({ group: next.group, status: next.status, q: next.q, page: String(next.page), withLogs: next.withLogs ? "1" : "0", sort: next.sort });
      if (next.incident !== null) params.set("incident", next.incident);
      if (next.from) params.set("from", next.from);
      if (next.to) params.set("to", next.to);
      try {
        const response = await fetch(`/api/lost?${params}`, { signal: request.signal });
        if (!response.ok) throw Error("Chưa tải được danh sách đơn.");
        const result = await response.json();
        if (!request.signal.aborted) {
          setData(result);
          scroller.current?.scrollTo({ top: 0 });
        }
      } catch {
        if (!request.signal.aborted) setRequestError("Chưa tải được danh sách đơn.");
      } finally {
        if (!request.signal.aborted) setLoading(false);
      }
    }
    if (debounce) timer.current = setTimeout(() => void load(), 180);
    else void load();
  }

  function clearFilters() {
    changeFilters({ ...defaultLostFilters, sort: filters.sort });
  }

  function dateHeader() {
    const order = data.sort === "date-asc" ? "ascending" : data.sort === "date-desc" ? "descending" : undefined;
    const Icon = order === "ascending" ? ArrowUp : order === "descending" ? ArrowDown : ArrowUpDown;
    return <th scope="col" role="columnheader" aria-sort={order} className={styles.sortHeader}>
      <span className={styles.mobileSortHeading}>Ngày chốt đền bù</span>
      <button type="button" className={styles.sortButton} aria-label="Sắp xếp theo ngày chốt đền bù"
        onClick={() => changeFilters({ ...filters, sort: filters.sort === "date-desc" ? "date-asc" : "date-desc", page: 0 })}>
        Ngày chốt<Icon size={13} aria-hidden="true" />
      </button>
    </th>;
  }

  return <div className={styles.page}>
    <header className={styles.hero}>
      <div className={styles.heroTitle}>
        <span className={styles.heroIcon}><PackageSearch size={26} aria-hidden="true" /></span>
        <div><h1>Lost &amp; Compensated</h1><p>Đối soát đơn hàng · 52-HCM SDD-01 Hub</p></div>
      </div>
      <div className={styles.heroActions}>
        <div className={styles.schedule}>
          <span><CalendarClock size={15} aria-hidden="true" /> Đồng bộ 06:00 hằng ngày (UTC+7)</span>
          {syncedAt && <span>Cập nhật gần nhất <time dateTime={syncedAt}>{dateTime.format(new Date(syncedAt))}</time></span>}
        </div>
        <a className={styles.sourceLink} href={sheet} target="_blank" rel="noreferrer">
          Google Sheet <ExternalLink size={15} aria-hidden="true" />
        </a>
      </div>
    </header>
    {error && <p role="alert" className={styles.warning}>{error}</p>}
    <LostCompensation data={compensation} />
    <section className={styles.incidentFilters} aria-labelledby="lost-incident-label">
      <h2 id="lost-incident-label"><ListFilter size={16} aria-hidden="true" /> Phân loại LOST</h2>
      <div className={styles.incidentChips} role="group" aria-labelledby="lost-incident-label">
        {[{ key: null, label: "Tất cả", count: data.counts.all }, ...data.incidents].map(option =>
          <button key={option.key === null ? "all" : `incident:${option.key}`} type="button" className={styles.incidentChip}
            aria-pressed={incident === option.key}
            onClick={() => { if (incident !== option.key) changeFilters({ ...filters, incident: option.key, page: 0 }); }}>
            <span>{option.label}</span><span className={styles.incidentCount}>{number.format(option.count)}</span>
          </button>)}
      </div>
    </section>

    <section className={styles.board} aria-label="Danh sách Lost & Compensated">
      <div className={styles.boardHeader}>
        <div><h2>{selectedIncident?.label ?? "Danh sách đơn"}</h2>
          <p aria-live="polite">{loading ? "Đang tải danh sách…" : <>{number.format(total)} dòng <span>·</span> {number.format(checked)} đã kiểm tra SPX <span>·</span> {number.format(logRows)} có log SPX</>}</p>
        </div>
        <div className={styles.boardActions}>
          {hasFilters && <button className={styles.clear} type="button" onClick={clearFilters}>Xóa bộ lọc</button>}
          <div className={styles.dateFilter} role="group" aria-labelledby="lost-date-filter">
            <span id="lost-date-filter">Ngày chốt đền bù</span>
            <WhDateRangePicker from={from} to={to} maxDate={initialAnalysis.today}
              onApply={(start, end) => changeFilters({ ...filters, from: start, to: end, page: 0 })} />
          </div>
        </div>
      </div>
      <div className={styles.filters}>
        <label className={styles.searchLabel}><span>Tìm đơn, rider hoặc phân loại</span>
          <span className={styles.search}><Search size={17} aria-hidden="true" />
            <input type="search" maxLength={120} value={q} onChange={event => changeFilters({ ...filters, q: event.target.value, page: 0 }, true)}
              placeholder="Mã đơn, rider hoặc phân loại LOST" /></span></label>
        <label><span>Trạng thái hiện tại</span>
          <select value={status} onChange={event => changeFilters({ ...filters, status: event.target.value, page: 0 })}>
            <option value="all">Tất cả trạng thái</option>
            {data.statuses.map(value => <option key={value} value={value}>{displayStatus(value)}</option>)}
          </select></label>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={withLogs} onChange={event => changeFilters({ ...filters, withLogs: event.target.checked, page: 0 })} /> Chỉ đơn có log SPX
        </label>
        <label><span>Sắp xếp danh sách</span>
          <select value={filters.sort} onChange={event => changeFilters({ ...filters, sort: event.target.value as LostSort, page: 0 })}>
            <option value="date-desc">Ngày chốt đền bù · Mới nhất</option>
            <option value="date-asc">Ngày chốt đền bù · Cũ nhất</option>
            <option value="rider-asc">Tên rider SPX · A → Z</option>
            <option value="rider-desc">Tên rider SPX · Z → A</option>
          </select>
        </label>
      </div>

      {requestError && <div className={styles.warning} role="alert">{requestError} <button className={styles.clear} type="button" onClick={() => changeFilters(filters)}>Thử lại</button></div>}
      {rows.length ? <div ref={scroller} className={styles.scroller} tabIndex={0} role="region" aria-label="Bảng đối soát" aria-busy={loading}>
        <table role="table">
          <thead role="rowgroup"><tr role="row">
            {dateHeader()}
            <th scope="col" role="columnheader" className={styles.identity}>Mã SPX</th>
            <th scope="col" role="columnheader" className={styles.statusCol}>Trạng thái trước LOST</th>
            <th scope="col" role="columnheader">Phân loại LOST</th>
            <th scope="col" role="columnheader" className={styles.money}>Tiền đền bù</th>
            <th scope="col" role="columnheader" className={styles.riderCol}>Rider</th>
            <th scope="col" role="columnheader" className={styles.logCell}>Log lỗi gần nhất</th>
          </tr></thead>
          <tbody role="rowgroup">
            {rows.map(row => <tr role="row" key={`${row.row}:${row.shipment}:${syncedAt}`}>
              <td role="cell" className={styles.date}><span className={styles.mobileLabel}>Ngày chốt đền bù</span><time dateTime={row.date}>{row.date}</time></td>
              <td role="cell" className={styles.identity}>
                <span className={styles.mobileLabel}>Mã SPX</span>
                <strong>{row.shipment}</strong>
              </td>
              <td role="cell"><span className={styles.mobileLabel}>Trạng thái trước LOST</span>
                {row.statusBeforeLost ? <span className={styles.statusBadge} data-pickup={matchesLostGroup(row, "pickup")}>
                  {row.operationalStatusBeforeLost || row.statusBeforeLost}
                </span>
                  : <span className={styles.muted}>—</span>}
              </td>
              <td role="cell"><span className={styles.mobileLabel}>Phân loại LOST</span>{row.incidentType || <span className={styles.muted}>{noLostClassification}</span>}</td>
              <td role="cell" className={styles.money}>
                <span className={styles.mobileLabel}>Tiền đền bù</span>
                <strong>{row.amount === null ? "—" : `${number.format(row.amount)} ₫`}</strong>
                {(row.codCogs != null || row.compensationRate != null) && <small>
                  {[row.codCogs != null && `COD/COGS ${number.format(row.codCogs)}`, row.compensationRate != null && percent.format(row.compensationRate)]
                    .filter(Boolean).join(" · ")}
                </small>}
              </td>
              <td role="cell"><span className={styles.mobileLabel}>Tên rider</span>
                {row.event ? <details>
                  <summary><ChevronRight size={14} aria-hidden="true" /><span>{row.event.rider || row.eventLabel || "Xem mốc SPX"}</span></summary>
                  <small>{[row.eventLabel, row.event.code, displayTime(row.event.at)].filter(Boolean).join(" · ")}</small>
                </details> : <span className={styles.muted}>{row.trackingChecked ? "—" : "Chưa đọc được tracking"}</span>}
              </td>
              <td role="cell" className={styles.logCell}><span className={styles.mobileLabel}>Log lỗi gần nhất</span>
                {row.logRider ? <LostLogDetails row={row} /> : <span className={styles.muted}>{row.logSourcesChecked ? "Không có log" : "Chưa đối chiếu log"}</span>}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div> : <div className={styles.empty}><Search size={23} aria-hidden="true" />
        <p>{loading ? "Đang tải danh sách…" : hasFilters || data.counts.all ? "Không có đơn khớp bộ lọc." : "Chưa có dữ liệu đối soát."}</p></div>}

      {total > 0 && <footer className={styles.pagination}>
        <span aria-live="polite">{number.format(current * lostPageSize + 1)}–{number.format(Math.min((current + 1) * lostPageSize, total))} / {number.format(total)} dòng</span>
        <div>
          <button type="button" aria-label="Trang trước" disabled={loading || !!requestError || current === 0} onClick={() => changeFilters({ ...filters, page: current - 1 })}><ChevronLeft size={18} aria-hidden="true" /></button>
          <span>Trang {current + 1} / {last + 1}</span>
          <button type="button" aria-label="Trang sau" disabled={loading || !!requestError || current >= last} onClick={() => changeFilters({ ...filters, page: current + 1 })}><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
      </footer>}
    </section>
    <details className={styles.riderAnalysis}>
      <summary><ChevronRight size={16} aria-hidden="true" /> Phân tích đơn và rider</summary>
      <LostAnalysis initial={initialAnalysis} />
    </details>
  </div>;
}
