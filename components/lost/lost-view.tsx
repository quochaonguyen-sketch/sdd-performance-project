"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, ArrowUpDown, CalendarClock, ChevronLeft, ChevronRight, ClipboardList, ExternalLink, Grid2X2,
  PackageCheck, PackageOpen, PackageSearch, Search, Truck,
} from "lucide-react";
import { defaultLostFilters, lostPageSize, type LostFilters, type LostPageData, type LostSort } from "@/lib/lost/list";
import { matchesLostGroup, type LostLog } from "@/lib/lost/model";
import type { LostAnalysisData } from "@/lib/lost/analysis";
import { LostAnalysis } from "./lost-analysis";
import styles from "./lost.module.css";

const sheet = "https://docs.google.com/spreadsheets/d/1gsUhZMc5jLvFizy804gtAan3vtzxmmjKwOvycrj4xZU/edit?gid=1396828508#gid=1396828508";
const dateTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "medium", hourCycle: "h23" });
const number = new Intl.NumberFormat("vi-VN");
const displayTime = (seconds: number) => dateTime.format(seconds * 1000);
const displayDate = (date: string) => date.split("-").reverse().join("/");

const groups = [
  { id: "all", label: "Tất cả", icon: Grid2X2 },
  { id: "pickup", label: "Pickup Done / Handedover", icon: PackageCheck },
  { id: "not-received", label: "Buyer/Seller chưa nhận hàng", icon: Truck },
  { id: "shortage", label: "Ticket thiếu hàng", icon: PackageOpen, hint: "Thiếu hàng · Rỗng ruột" },
  { id: "other", label: "Trường hợp khác", icon: ClipboardList },
] as const;

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
    <summary><ChevronRight size={15} aria-hidden="true" /><span>{row.logRider}</span> <span className={styles.badge}>{row.logCount} log</span></summary>
    {error ? <div className={styles.log} role="alert">{error} <button className={styles.clear} type="button" onClick={() => void load()}>Thử lại</button></div>
      : !logs ? <small role="status">Đang tải log…</small> : logs.length === 0 ? <small>Đơn này không còn log trong bản đối soát hiện tại.</small>
        : logs.map(log => <div className={styles.log} key={`${log.rider}:${log.at}`}>
          <strong>{log.rider}</strong><small>{displayTime(log.at)}</small>{log.error && <p>{log.error}</p>}
        </div>)}
  </details>;
}

export function LostView({ initial, initialAnalysis }: { initial: LostPageData; initialAnalysis: LostAnalysisData }) {
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
  const { group, q, status, withLogs } = filters;
  const selected = groups.find(option => option.id === data.group) ?? groups[0];
  const { rows, syncedAt, error, total, page: current, last, checked, logRows } = data;
  const hasFilters = group !== "all" || !!q.trim() || status !== "all" || withLogs;

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

  function sortHeader(field: "date" | "rider", label: string, action: string) {
    const order = data.sort === `${field}-asc` ? "ascending" : data.sort === `${field}-desc` ? "descending" : undefined;
    const Icon = order === "ascending" ? ArrowUp : order === "descending" ? ArrowDown : ArrowUpDown;
    const [first, second] = field === "date" ? ["date-desc", "date-asc"] as const : ["rider-asc", "rider-desc"] as const;
    return <th scope="col" role="columnheader" aria-sort={order} className={styles.sortHeader}>
      <span className={styles.mobileSortHeading}>{label}</span>
      <button type="button" className={styles.sortButton} aria-label={`${label} · ${action}`}
        onClick={() => changeFilters({ ...filters, sort: filters.sort === first ? second : first, page: 0 })}>
        {label}<Icon size={14} aria-hidden="true" />
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
    <LostAnalysis initial={initialAnalysis} />
    <div className={styles.groups} role="group" aria-label="Nhóm đối soát">
      {groups.map(option => <button key={option.id} type="button" className={styles.group} data-group={option.id}
        aria-pressed={group === option.id}
        onClick={() => changeFilters({ ...filters, group: option.id, status: "all", page: 0 })}>
        <span className={styles.groupIcon}><option.icon size={18} aria-hidden="true" /></span>
        <span className={styles.groupText}><strong>{option.label}</strong>
          {"hint" in option && <small>{option.hint}</small>}</span>
        <span className={styles.groupCount}>{number.format(data.counts[option.id])}</span>
      </button>)}
    </div>

    <section className={styles.board} aria-label="Danh sách Lost & Compensated">
      <div className={styles.boardHeader}>
        <div><h2>{data.group === "all" ? "Danh sách đơn" : selected.label}</h2>
          <p aria-live="polite">{loading ? "Đang tải danh sách…" : <>{number.format(total)} dòng <span>·</span> {number.format(checked)} đã kiểm tra SPX <span>·</span> {number.format(logRows)} có log rider</>}</p>
        </div>
        {hasFilters && <button className={styles.clear} type="button" onClick={clearFilters}>Xóa bộ lọc</button>}
      </div>
      <div className={styles.filters}>
        <label className={styles.searchLabel}><span>Tìm đơn hoặc rider</span>
          <span className={styles.search}><Search size={17} aria-hidden="true" />
            <input type="search" maxLength={120} value={q} onChange={event => changeFilters({ ...filters, q: event.target.value, page: 0 }, true)}
              placeholder="Mã đơn, tên hoặc mã rider" /></span></label>
        <label><span>Trạng thái cuối</span>
          <select value={status} disabled={loading && data.group !== group} onChange={event => changeFilters({ ...filters, status: event.target.value, page: 0 })}>
            <option value="all">Tất cả trạng thái</option>
            {data.statuses.map(value => <option key={value} value={value}>{displayStatus(value)}</option>)}
          </select></label>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={withLogs} onChange={event => changeFilters({ ...filters, withLogs: event.target.checked, page: 0 })} /> Chỉ đơn có log rider
        </label>
        <label className={styles.mobileSort}><span>Sắp xếp danh sách</span>
          <select value={filters.sort} onChange={event => changeFilters({ ...filters, sort: event.target.value as LostSort, page: 0 })}>
            <option value="date-desc">Ngày báo cáo · Mới nhất</option>
            <option value="date-asc">Ngày báo cáo · Cũ nhất</option>
            <option value="rider-asc">Tên rider SPX · A → Z</option>
            <option value="rider-desc">Tên rider SPX · Z → A</option>
          </select>
        </label>
      </div>

      {requestError && <div className={styles.warning} role="alert">{requestError} <button className={styles.clear} type="button" onClick={() => changeFilters(filters)}>Thử lại</button></div>}
      {rows.length ? <div ref={scroller} className={styles.scroller} tabIndex={0} role="region" aria-label="Bảng đối soát" aria-busy={loading}>
        <table role="table">
          <thead role="rowgroup"><tr role="row">
            {sortHeader("date", "Mã đơn / Ngày báo cáo", "Sắp xếp theo ngày báo cáo")}<th scope="col" role="columnheader">Trạng thái cuối</th>
            <th scope="col" role="columnheader">Lý do / Kết quả</th>{sortHeader("rider", "Rider / Mốc đối soát SPX", "Sắp xếp theo tên rider SPX")}
            <th scope="col" role="columnheader">Log lỗi Driver APP</th><th scope="col" role="columnheader" className={styles.money}>Số tiền (₫)</th>
          </tr></thead>
          <tbody role="rowgroup">
            {rows.map(row => <tr role="row" key={`${row.row}:${row.shipment}:${syncedAt}`}>
              <td role="cell" className={styles.identity}><strong>{row.shipment}</strong><small>{displayDate(row.date)}</small></td>
              <td role="cell" className={styles.statusCell}>
                <span className={styles.statusBadge} data-pickup={matchesLostGroup(row, "pickup")} title={row.status}>{displayStatus(row.status)}</span>
              </td>
              <td role="cell" className={styles.reason}><span className={styles.mobileLabel}>Lý do / Kết quả</span>
                {row.reason || "—"}<small>{[row.reasonType, row.result].filter(Boolean).join(" · ")}</small>
              </td>
              <td role="cell" className={styles.eventCell}><span className={styles.mobileLabel}>Rider / Mốc đối soát SPX</span>
                {row.event ? <>
                  <strong>{row.event.rider || row.eventLabel}</strong>
                  <small>{[row.event.rider && row.eventLabel, row.event.code, displayTime(row.event.at)].filter(Boolean).join(" · ")}</small>
                </> : <span className={styles.muted}>{row.trackingChecked ? "Chưa xác định mốc" : "Chưa đọc được tracking"}</span>}
              </td>
              <td role="cell" className={styles.logCell}><span className={styles.mobileLabel}>Log lỗi Driver APP</span>
                {row.logRider ? <LostLogDetails row={row} /> : <span className={styles.muted}>{row.logsChecked ? "Không có log khớp" : "Chưa đọc được log"}</span>}
                {row.logRider && !row.event && <small>Chưa xác định mốc để đối chiếu thời gian</small>}
              </td>
              <td role="cell" className={styles.money}><span className={styles.mobileLabel}>Số tiền (₫)</span>{row.amount === null ? "—" : number.format(row.amount)}</td>
            </tr>)}
          </tbody>
        </table>
      </div> : <div className={styles.empty}><Search size={23} aria-hidden="true" />
        <p>{loading ? "Đang tải danh sách…" : data.counts.all ? "Không có đơn khớp bộ lọc." : "Chưa có dữ liệu đối soát."}</p></div>}

      {total > 0 && <footer className={styles.pagination}>
        <span aria-live="polite">{number.format(current * lostPageSize + 1)}–{number.format(Math.min((current + 1) * lostPageSize, total))} / {number.format(total)} dòng</span>
        <div>
          <button type="button" aria-label="Trang trước" disabled={loading || !!requestError || current === 0} onClick={() => changeFilters({ ...filters, page: current - 1 })}><ChevronLeft size={18} aria-hidden="true" /></button>
          <span>Trang {current + 1} / {last + 1}</span>
          <button type="button" aria-label="Trang sau" disabled={loading || !!requestError || current >= last} onClick={() => changeFilters({ ...filters, page: current + 1 })}><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
      </footer>}
    </section>
  </div>;
}
