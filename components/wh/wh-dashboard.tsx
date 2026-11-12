"use client";
import Link from "next/link";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  Info,
  MapPin,
  PackageOpen,
  RefreshCw,
  Search,
  Smartphone,
  Truck,
} from "lucide-react";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import {
  AREAS,
  areaName,
  compareWhOrders,
  counts,
  formatVnDate,
  getMondayOfWeek,
  getMonthRange,
  getOrderEffectiveNow,
  getSundayOfWeek,
  isNearLate,
  isOverdue,
  isOnhold,
  isUnassigned,
  orderAgeMinutes,
  parseYmd,
  remaining,
  riderOrder,
  sla,
  toYmd,
  vnDay,
  type DateFilterMode,
  type Sla,
  type WhData,
  type WhOrder,
  type WhSortOption,
} from "@/lib/wh/model";
import styles from "./wh.module.css";
import { WhDateRangePicker } from "./wh-date-picker";
import { WhSeatalkReport } from "./wh-seatalk-report";

const fmt = (v: number) => v.toLocaleString("vi-VN");
const vnDateFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const stamp = (v: string | null) => {
  if (!v) return "—";
  try {
    return vnDateFormatter.format(new Date(v));
  } catch {
    return "—";
  }
};
const duration = (v: number | null) =>
  v === null ? "—" : `${Math.floor(v / 60)}h ${String(v % 60).padStart(2, "0")}p`;
const age = (r: WhOrder, now: number, snapshotAt?: string | null) =>
  orderAgeMinutes(r, now, snapshotAt);

function SlaCell({ value }: { value: Sla }) {
  return (
    <span className={styles.sla} data-state={value.state}>
      {value.state === "Pending" ? "—" : value.state}
      {value.minutes !== null && <small>{duration(value.minutes)}</small>}
    </span>
  );
}

const OrderItem = memo(function OrderItem({
  r,
  now,
  snapshotAt,
}: {
  r: WhOrder;
  now: number;
  snapshotAt?: string | null;
}) {
  const effNow = getOrderEffectiveNow(r, now, snapshotAt);
  const sddSla = sla(r, "sdd");
  const fourHour = sla(r, "4h");
  const left = remaining(r, effNow, "4h");
  const leftSdd = remaining(r, effNow, "sdd");
  const isOver = r.raw_status !== "Delivered" && leftSdd !== null && leftSdd <= 0;
  const isWarning = r.raw_status !== "Delivered" && leftSdd !== null && leftSdd > 0 && leftSdd <= 60;
  const statusLabel =
    r.raw_status === "LMhub_received"
      ? "Received"
      : r.raw_status === "SOC_pendingReceive"
      ? "WH Ready"
      : r.raw_status === "Onhold"
      ? "On-Hold"
      : r.raw_status;
  return (
    <li key={r.shipment_id}>
      <details className={styles.orderEntry}>
        <summary
          className={styles.orderRow}
          data-ontime={
            sddSla.state === "On time"
              ? "On time"
              : sddSla.state === "Late" || isOver
              ? "Late"
              : isWarning
              ? "Warning"
              : undefined
          }
        >
          <span className={styles.orderIdentity}>
            <span className={styles.orderCellLabel}>Mã đơn</span>
            <strong>{r.shipment_id}</strong>
            <small>
              Tạo <time dateTime={r.created_at ?? undefined}>{stamp(r.created_at)}</time>
              {r.delivered_at && (
                <>
                  {" "}
                  · Giao <time dateTime={r.delivered_at}>{stamp(r.delivered_at)}</time>
                </>
              )}
            </small>
          </span>
          <span className={styles.orderRider}>
            <span className={styles.orderCellLabel}>Rider / Địa bàn</span>
            <strong>
              {r.driver_name ? (
                <>
                  {r.driver_name}
                  {r.driver_id && <span style={{ opacity: 0.75, fontWeight: 400, marginLeft: 4 }}>({r.driver_id})</span>}
                </>
              ) : (
                "Chưa gán rider"
              )}
            </strong>
            <small>
              <span className={styles.orderArea}>
                {r.area === "UNRESOLVED" ? "Chưa rõ KV" : r.area}
              </span>
              {r.district || "Chưa rõ quận"}
            </small>
            <small>{r.ward || "Chưa rõ phường"}</small>
          </span>
          <span className={styles.orderStatus}>
            <span className={styles.orderCellLabel}>Trạng thái</span>
            <span className={styles.orderStatusBadge} data-status={r.raw_status} title={r.raw_status}>
              {statusLabel}
            </span>
            <small>
              Attempt <strong>{r.attempt ?? "—"}</strong>
            </small>
          </span>
          <span className={styles.orderSla} data-kind="sdd">
            <span className={styles.orderCellLabel}>SDD · 3H</span>
            {sddSla.state === "Pending" && leftSdd !== null ? (
              <span
                className={styles.orderCountdown}
                data-overdue={isOver}
                data-warning={isWarning}
                title={
                  isOver
                    ? `Đã quá hạn SDD 3H (${Math.abs(leftSdd)} phút từ lúc SOC pending)`
                    : isWarning
                    ? `Chuẩn bị trễ! Còn ${leftSdd} phút để giao đơn`
                    : `Còn ${duration(leftSdd)}`
                }
              >
                {isWarning ? <AlertTriangle size={13} aria-hidden="true" /> : <Clock3 size={13} aria-hidden="true" />}
                {isOver ? `Quá hạn ${duration(Math.abs(leftSdd))}` : isWarning ? `Sắp trễ: còn ${duration(leftSdd)}` : `Còn ${duration(leftSdd)}`}
              </span>
            ) : (
              <SlaCell value={sddSla} />
            )}
          </span>
          <span className={styles.orderSla}>
            <span className={styles.orderCellLabel}>WH · 1H</span>
            <SlaCell value={sla(r, "wh")} />
          </span>
          <span className={styles.orderSla} data-kind="4h">
            <span className={styles.orderCellLabel}>Tổng · 4H</span>
            {fourHour.state === "Pending" && left !== null ? (
              <span
                className={styles.orderCountdown}
                title={left <= 0 ? `Đã quá hạn 4H (${Math.abs(left)} phút)` : `Còn ${duration(left)}`}
              >
                <Clock3 size={13} aria-hidden="true" />
                {left <= 0 ? `Quá hạn ${duration(Math.abs(left))}` : `Còn ${duration(left)}`}
              </span>
            ) : (
              <SlaCell value={fourHour} />
            )}
          </span>
          <span className={styles.orderChevron}>
            <ChevronDown size={16} aria-hidden="true" />
            <span className={styles.caption}>Mở chi tiết đơn {r.shipment_id}</span>
          </span>
        </summary>
        <div className={styles.orderExpanded}>
          <h3>
            <Clock3 size={14} aria-hidden="true" />
            Mốc thời gian
          </h3>
          <dl className={styles.orderTimeline}>
            {(
              [
                ["Tạo đơn", r.created_at],
                ["SOC pending", r.soc_pending_at],
                ["Received", r.received_at],
                ["Xuất giao", r.delivering_at],
                ["Delivered", r.delivered_at],
                ["On-Hold", r.onhold_at],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <time dateTime={value ?? undefined}>{stamp(value)}</time>
                </dd>
              </div>
            ))}
          </dl>
          <dl className={styles.orderNotes}>
            <div>
              <dt>Tracking</dt>
              <dd>{r.tracking_number || r.shipment_id}</dd>
            </div>
            {r.driver_id && (
              <div>
                <dt>ID Rider</dt>
                <dd>{r.driver_id}</dd>
              </div>
            )}
            <div>
              <dt>Lý do On-Hold</dt>
              <dd>{r.onhold_reason || "Chưa có lý do từ SPX"}</dd>
            </div>
          </dl>
        </div>
      </details>
    </li>
  );
});

function OrderList({
  orders,
  now,
  snapshotAt,
}: {
  orders: WhOrder[];
  now: number;
  snapshotAt?: string | null;
}) {
  return (
    <div className={styles.orderScroll} role="region" aria-label="Danh sách đơn WH" tabIndex={0}>
      <div className={styles.orderHeading} aria-hidden="true">
        <span>Mã đơn</span>
        <span>Rider / Địa bàn</span>
        <span>Trạng thái</span>
        <span>SDD · 3H</span>
        <span>WH · 1H</span>
        <span>Tổng · 4H</span>
        <span />
      </div>
      <ul className={styles.orderList}>
        {orders.map((r) => (
          <OrderItem key={r.shipment_id} r={r} now={now} snapshotAt={snapshotAt} />
        ))}
      </ul>
      {!orders.length && <p className={styles.orderEmpty}>Không có đơn phù hợp bộ lọc.</p>}
    </div>
  );
}

export function WhDashboard() {
  const [data, setData] = useState<WhData | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [area, setArea] = useState("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<WhSortOption>("status");
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(0);

  // Time Filtering State (mặc định lấy 30 ngày trước: mode="range")
  const [filterMode, setFilterMode] = useState<DateFilterMode>("range");
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)
  );
  const [selectedWeekDate, setSelectedWeekDate] = useState<string>(() =>
    new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7)
  );
  const [customFrom, setCustomFrom] = useState<string>(() =>
    new Date(Date.now() + 7 * 3600000 - 29 * 86400000).toISOString().slice(0, 10)
  );
  const [customTo, setCustomTo] = useState<string>(() =>
    new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)
  );

  const inFlight = useRef(false);
  const request = useRef<AbortController | null>(null);
  useReportInitialDataLoading("wh-dashboard", loading && !data);

  const load = useCallback(
    async (override?: {
      mode?: DateFilterMode;
      date?: string;
      weekDate?: string;
      month?: string;
      from?: string;
      to?: string;
    }) => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setLoading(true);

      const activeMode = override?.mode ?? filterMode;
      let url = "/api/wh-dashboard";
      const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

      if (activeMode === "day") {
        const d = override?.date ?? selectedDate;
        if (d !== today) {
          url = `/api/wh-dashboard?date=${d}&mode=day`;
        }
      } else if (activeMode === "week") {
        const w = override?.weekDate ?? selectedWeekDate;
        const from = getMondayOfWeek(w);
        const to = getSundayOfWeek(w);
        url = `/api/wh-dashboard?from=${from}&to=${to}&mode=week`;
      } else if (activeMode === "month") {
        const m = override?.month ?? selectedMonth;
        const { from, to } = getMonthRange(m);
        url = `/api/wh-dashboard?from=${from}&to=${to}&mode=month`;
      } else if (activeMode === "range") {
        const f = override?.from ?? customFrom;
        const t = override?.to ?? customTo;
        url = `/api/wh-dashboard?from=${f}&to=${t}&mode=range`;
      }

      try {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Chưa tải được WH.");
        if (!controller.signal.aborted) {
          setData(body);
          setError("");
          setNow(Date.now());
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Chưa tải được WH.");
      } finally {
        inFlight.current = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [filterMode, selectedDate, selectedWeekDate, selectedMonth, customFrom, customTo]
  );

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => {
      if (!document.hidden && filterMode === "day") void load();
    }, 30000);
    const clock = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      clearInterval(clock);
      request.current?.abort();
    };
  }, [load, filterMode]);

  async function sync() {
    if (syncing) return;
    setSyncing(true);
    setMessage("");
    try {
      const response = await fetch("/api/wh-dashboard", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage(
        body.deduplicated
          ? "WH đang chờ hoặc đang chạy; dashboard tự cập nhật khi hoàn tất."
          : "Đã xếp hàng lấy dữ liệu WH. Worker sẽ cập nhật dashboard khi hoàn tất."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gửi được lệnh.");
    } finally {
      setSyncing(false);
    }
  }

  // Week navigation
  function shiftWeek(offsetWeeks: number) {
    const d = parseYmd(selectedWeekDate);
    d.setDate(d.getDate() + offsetWeeks * 7);
    const newYmd = toYmd(d);
    setSelectedWeekDate(newYmd);
    void load({ mode: "week", weekDate: newYmd });
  }

  // Month navigation
  function shiftMonth(offsetMonths: number) {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + offsetMonths, 1);
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setSelectedMonth(newMonth);
    void load({ mode: "month", month: newMonth });
  }

  const currentDay = new Date(now + 7 * 3600000).toISOString().slice(0, 10);
  const expired =
    filterMode === "day" && selectedDate === currentDay && !!data && now > 0 && data.day !== currentDay;
  const rows = expired ? [] : data?.orders ?? [];

  // Deferred search term: typing in input stays 100% lag-free
  const deferredQuery = useDeferredValue(query);
  const term = deferredQuery.trim().toLowerCase();

  const scope = useMemo(
    () => (area === "all" ? rows : rows.filter((r) => r.area === area)),
    [rows, area]
  );

  const c = useMemo(
    () => counts(scope, data?.day ?? "", now),
    [scope, data?.day, now]
  );

  // Single-pass computation of area breakdown to eliminate 6x counts calls
  const areaSummaries = useMemo(() => {
    const buckets: Record<string, WhOrder[]> = {};
    for (const a of AREAS) buckets[a] = [];
    for (let i = 0; i < scope.length; i++) {
      const r = scope[i];
      if (buckets[r.area]) buckets[r.area].push(r);
      else buckets["UNRESOLVED"].push(r);
    }
    const result: Record<string, ReturnType<typeof counts>> = {};
    for (const a of AREAS) {
      result[a] = counts(buckets[a], data?.day ?? "", now);
    }
    return result;
  }, [scope, data?.day, now]);

  // Single-pass computation of pill counters
  const pillCounts = useMemo(() => {
    let riderTotal = 0;
    let nearLate = 0;
    let late = 0;
    let delivering = 0;
    let onhold = 0;
    let delivered = 0;
    for (let i = 0; i < scope.length; i++) {
      const r = scope[i];
      if (riderOrder(r)) {
        riderTotal++;
        const effNow = getOrderEffectiveNow(r, now, data?.snapshotAt);
        if (isNearLate(r, effNow)) nearLate++;
        if (sla(r, "sdd").state === "Late" || isOverdue(r, effNow)) late++;
        if (r.raw_status === "Delivering") delivering++;
        if (isOnhold(r)) onhold++;
        if (r.raw_status === "Delivered") delivered++;
      }
    }
    return { riderTotal, nearLate, late, delivering, onhold, delivered };
  }, [scope, now, data?.snapshotAt]);

  // Fast string search without allocating arrays per order (supports tracking, rider name, rider ID, address, zone)
  const matchesOrder = useCallback((r: WhOrder, t: string) => {
    if (!t) return true;
    const haystack = `${r.shipment_id} ${r.tracking_number} ${r.driver_id || ""} ${r.driver_name} ${r.district} ${r.ward} ${r.zone}`.toLowerCase();
    return haystack.includes(t);
  }, []);

  const filtered = useMemo(() => {
    return scope
      .filter((r) => {
        if (!riderOrder(r)) return false;
        const effNow = getOrderEffectiveNow(r, now, data?.snapshotAt);
        if (status === "near_late") {
          if (!isNearLate(r, effNow)) return false;
        } else if (status === "onhold") {
          if (!isOnhold(r)) return false;
        } else if (status === "late") {
          if (sla(r, "sdd").state !== "Late" && !isOverdue(r, effNow)) return false;
        } else if (status !== "all" && r.raw_status !== status) {
          return false;
        }
        return matchesOrder(r, term);
      })
      .sort((a, b) => {
        const effNowA = getOrderEffectiveNow(a, now, data?.snapshotAt);
        return compareWhOrders(a, b, sort, effNowA);
      });
  }, [scope, status, term, sort, now, data?.snapshotAt, matchesOrder]);

  const pages = Math.max(1, Math.ceil(filtered.length / 50));
  const activePage = Math.min(page, pages);
  const visible = useMemo(
    () => filtered.slice((activePage - 1) * 50, activePage * 50),
    [filtered, activePage]
  );

  const waiting = useMemo(() => {
    const list = scope.filter(
      (r) =>
        ["LMhub_received", "Created", "SOC_pendingReceive"].includes(r.raw_status) &&
        matchesOrder(r, term)
    );

    // If viewing multi-day range and not searching for a specific order,
    // only show active orders for today (or the latest available active date) so dispatcher is not overwhelmed by 30-day historical unassigned items
    if (filterMode !== "day" && !term) {
      const latestDay = data?.availableDates?.[0] || currentDay;
      const recentList = list.filter((r) => vnDay(r.created_at) >= latestDay);
      return recentList.sort(
        (a, b) =>
          (a.attempt ?? -1) - (b.attempt ?? -1) ||
          ((b.created_at ?? "") > (a.created_at ?? "") ? 1 : -1)
      );
    }

    return list.sort(
      (a, b) =>
        (a.attempt ?? -1) - (b.attempt ?? -1) ||
        ((b.created_at ?? "") > (a.created_at ?? "") ? 1 : -1)
    );
  }, [scope, term, matchesOrder, filterMode, data?.availableDates, currentDay]);

  const pending = useMemo(() => {
    const list = scope.filter(
      (r) => r.raw_status === "SOC_pendingReceive" && matchesOrder(r, term)
    );
    if (filterMode !== "day" && !term) {
      const latestDay = data?.availableDates?.[0] || currentDay;
      const recentList = list.filter((r) => vnDay(r.created_at) >= latestDay);
      return recentList;
    }
    return list;
  }, [scope, term, matchesOrder, filterMode, data?.availableDates, currentDay]);

  function download() {
    const cell = (v: unknown) => {
      let text = String(v ?? "");
      if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    const lines = [
      [
        "Shipment",
        "Tracking",
        "KV",
        "District",
        "Ward",
        "Rider",
        "Rider ID",
        "Status",
        "Attempt",
        "Created",
        "Received",
        "Delivering",
        "Delivered",
        "Onhold",
        "SOC pending",
        "4H",
        "WH",
        "SDD",
      ],
      ...filtered.map((r) => [
        r.shipment_id,
        r.tracking_number,
        areaName(r.area),
        r.district,
        r.ward,
        r.driver_name,
        r.driver_id || "",
        r.raw_status,
        r.attempt,
        stamp(r.created_at),
        stamp(r.received_at),
        stamp(r.delivering_at),
        stamp(r.delivered_at),
        stamp(r.onhold_at),
        stamp(r.soc_pending_at),
        sla(r, "4h").state,
        sla(r, "wh").state,
        sla(r, "sdd").state,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + lines.map((line) => line.map(cell).join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8",
      })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `WH-${data?.day ?? "report"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // Active filter reference dates
  const yesterday = new Date(Date.now() + 7 * 3600000 - 86400000).toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() + 7 * 3600000 - 6 * 86400000).toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() + 7 * 3600000 - 29 * 86400000).toISOString().slice(0, 10);

  const isThirtyDays =
    filterMode === "range" && customFrom === thirtyDaysAgo && customTo === currentDay;
  const isSevenDays =
    filterMode === "range" && customFrom === sevenDaysAgo && customTo === currentDay;
  const isToday =
    (filterMode === "day" && selectedDate === currentDay) ||
    (filterMode === "range" && customFrom === currentDay && customTo === currentDay);
  const isYesterday =
    (filterMode === "day" && selectedDate === yesterday) ||
    (filterMode === "range" && customFrom === yesterday && customTo === yesterday);

  // Active filter label
  const rangeLabel =
    filterMode === "week"
      ? `Tuần ${formatVnDate(getMondayOfWeek(selectedWeekDate))} – ${formatVnDate(getSundayOfWeek(selectedWeekDate))}`
      : filterMode === "month"
      ? `Tháng ${selectedMonth.split("-").reverse().join("/")}`
      : filterMode === "day"
      ? selectedDate === currentDay
        ? `Hôm nay (${formatVnDate(currentDay)})`
        : `Ngày ${formatVnDate(selectedDate)}`
      : isThirtyDays
      ? `30 ngày qua (${formatVnDate(customFrom)} – ${formatVnDate(customTo)})`
      : isSevenDays
      ? `7 ngày qua (${formatVnDate(customFrom)} – ${formatVnDate(customTo)})`
      : customFrom === customTo
      ? customFrom === currentDay
        ? `Hôm nay (${formatVnDate(currentDay)})`
        : `Ngày ${formatVnDate(customFrom)}`
      : `Từ ${formatVnDate(customFrom)} đến ${formatVnDate(customTo)}`;

  return (
    <div className={styles.page}>
      <header className={`ops-page-header ${styles.header}`}>
        <div>
          <p className={styles.eyebrow}>
            <Smartphone size={16} aria-hidden="true" />
            WH / HIGH VALUE
          </p>
          <h1>iPhone Report Dashboard</h1>
          <p>
            Hub 4232 · {rangeLabel} · Cập nhật{" "}
            <time dateTime={data?.snapshotAt ?? undefined}>{stamp(data?.snapshotAt ?? null)}</time>
          </p>
        </div>
        <div className={styles.actions}>
          <Link href="/data-sources">Nguồn dữ liệu</Link>
          {data?.canRefresh && <WhSeatalkReport />}
          <button onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} aria-hidden="true" className={loading ? "animate-spin" : ""} />
            Làm mới
          </button>
          {data?.canRefresh && (
            <button className={styles.primary} onClick={() => void sync()} disabled={syncing}>
              <RefreshCw size={16} aria-hidden="true" className={syncing ? "animate-spin" : ""} />
              {syncing ? "Đang gửi…" : "Lấy dữ liệu WH"}
            </button>
          )}
        </div>
      </header>

      {/* UI/UX Pro Max Time Filter Toolbar (Ponytail Minimalist) */}
      <section className={styles.timeFilterBarPro} aria-label="Bộ lọc thời gian">
        {/* Segmented Control Pills - Apple Pro Style */}
        <div className={styles.segmentedControl} role="tablist" aria-label="Khoảng thời gian">
          <button
            type="button"
            role="tab"
            aria-selected={isThirtyDays}
            className={`${styles.segmentedBtn} ${isThirtyDays ? styles.segmentedActive : ""}`}
            onClick={() => {
              setFilterMode("range");
              setCustomFrom(thirtyDaysAgo);
              setCustomTo(currentDay);
              void load({ mode: "range", from: thirtyDaysAgo, to: currentDay });
            }}
          >
            30 ngày qua
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isSevenDays}
            className={`${styles.segmentedBtn} ${isSevenDays ? styles.segmentedActive : ""}`}
            onClick={() => {
              setFilterMode("range");
              setCustomFrom(sevenDaysAgo);
              setCustomTo(currentDay);
              void load({ mode: "range", from: sevenDaysAgo, to: currentDay });
            }}
          >
            7 ngày qua
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isYesterday}
            className={`${styles.segmentedBtn} ${isYesterday ? styles.segmentedActive : ""}`}
            onClick={() => {
              setFilterMode("day");
              setSelectedDate(yesterday);
              setCustomFrom(yesterday);
              setCustomTo(yesterday);
              void load({ mode: "day", date: yesterday });
            }}
          >
            Hôm qua
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isToday}
            className={`${styles.segmentedBtn} ${isToday ? styles.segmentedActive : ""}`}
            onClick={() => {
              setFilterMode("day");
              setSelectedDate(currentDay);
              setCustomFrom(currentDay);
              setCustomTo(currentDay);
              void load({ mode: "day", date: currentDay });
            }}
          >
            Hôm nay
          </button>
        </div>

        {/* Lịch chọn từ ngày đến ngày trong 1 cái (Interactive Date Range Calendar Picker) */}
        <WhDateRangePicker
          from={customFrom}
          to={customTo}
          maxDate={currentDay}
          onApply={(newFrom, newTo) => {
            setCustomFrom(newFrom);
            setCustomTo(newTo);
            if (newFrom === newTo) {
              setSelectedDate(newFrom);
              setFilterMode("day");
              void load({ mode: "day", date: newFrom });
            } else {
              setFilterMode("range");
              void load({ mode: "range", from: newFrom, to: newTo });
            }
          }}
        />

        {/* Pro Max Live Badge */}
        <div className={styles.proLiveBadge}>
          <span className={styles.proLivePulse} aria-hidden="true" />
          <span className={styles.proLiveText}>{rangeLabel}</span>
          <span className={styles.proLiveCount}>{fmt(rows.length)} đơn</span>
        </div>
      </section>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
          {data && " Dữ liệu bên dưới là lần đọc thành công gần nhất."}
        </p>
      )}
      {message && <p role="status" className={styles.notice}>{message}</p>}
      {loading && !data && <p role="status">Đang tải dashboard WH…</p>}
      {data && !data.snapshotAt && (
        <p className={styles.notice}>
          Chưa có dữ liệu cho thời gian này. Chạy nguồn WH / iPhone trong Nguồn dữ liệu.
        </p>
      )}
      {expired && <p role="status" className={styles.notice}>Đã sang ngày mới. Đang chờ dữ liệu WH hôm nay.</p>}
      {data?.snapshotAt && !expired && now - Date.parse(data.snapshotAt) > 10 * 60000 && (
        <p className={styles.notice}>Dữ liệu đã hơn 10 phút chưa cập nhật. Kiểm tra lịch và kết nối worker.</p>
      )}

      {/* Summary Cards with SLA 4H On-time / Late Rates (Created -> Delivered) */}
      <section className={styles.summary} aria-label="Tổng quan WH">
        <div className={styles.summaryGrid}>
          <article className={styles.summaryCard} aria-labelledby="wh-volume-title">
            <h2 id="wh-volume-title">
              <PackageOpen size={16} aria-hidden="true" />
              Tổng quan đơn
            </h2>
            <dl className={styles.summaryMetrics}>
              <div>
                <dt>Total</dt>
                <dd className={styles.summaryTotal}>{fmt(c.total)}</dd>
              </div>
              <div>
                <dt>Received D0</dt>
                <dd>{fmt(c.received)}</dd>
              </div>
            </dl>
            <dl className={styles.summaryMinor}>
              <div>
                <dt>Created</dt>
                <dd>{fmt(c.created)}</dd>
              </div>
              <div>
                <dt>WH Ready</dt>
                <dd>{fmt(c.ready)}</dd>
              </div>
              <div>
                <dt>Backlog</dt>
                <dd>{fmt(c.backlog)}</dd>
              </div>
            </dl>
          </article>

          <article className={styles.summaryCard} aria-labelledby="wh-delivery-title">
            <h2 id="wh-delivery-title">
              <Truck size={16} aria-hidden="true" />
              Tiến độ giao
            </h2>
            <dl className={styles.summaryMetrics}>
              <div>
                <dt>Delivered</dt>
                <dd className={styles.summarySuccess}>{fmt(c.delivered)}</dd>
              </div>
              <div>
                <dt>Delivering</dt>
                <dd className={styles.summaryActive}>{fmt(c.delivering)}</dd>
              </div>
            </dl>
            <div className={styles.summaryCompletion}>
              <div>
                <span>Success Rate</span>
                <strong>{c.rate.toFixed(1)}%</strong>
              </div>
              <progress max={100} value={c.rate} aria-label="Tỷ lệ giao thành công" />
            </div>
          </article>

          {/* Attention & SLA SDD 3H (SOC Pending -> Delivered) Card with exact Ontime / Late rates */}
          <article className={styles.summaryCard} aria-labelledby="wh-attention-title">
            <h2 id="wh-attention-title">
              <CircleAlert size={16} aria-hidden="true" />
              Cần theo dõi
            </h2>
            <dl className={styles.summaryMetrics}>
              <div>
                <dt>Unassigned</dt>
                <dd className={styles.summaryDanger}>{fmt(c.unassigned)}</dd>
              </div>
              <div>
                <dt>On-Hold</dt>
                <dd className={styles.summaryWarning}>{fmt(c.onhold)}</dd>
              </div>
            </dl>

            <div className={styles.summarySla}>
              <div className={styles.summarySlaHeader}>
                <span className={styles.slaTitle}>SLA SDD (SOC Pending → Delivered)</span>
                <span className={styles.slaRatioText}>
                  {c.slaTotal > 0 ? `${fmt(c.slaTotal)} đơn đã giao` : "Chưa có đơn giao"}
                </span>
              </div>
              <dl>
                <div
                  className={styles.summaryOntime}
                  title="Đơn giao đúng hạn trong 3 giờ từ lúc SOC nhận hàng (SOC Pending → Delivered)"
                >
                  <dt>On time (3H)</dt>
                  <dd>
                    {fmt(c.ontime)}{" "}
                    <span className={styles.slaPercent}>({c.ontimeRate.toFixed(1)}%)</span>
                  </dd>
                </div>
                <div
                  className={styles.summaryLate}
                  title="Đơn giao trễ hơn 3 giờ từ lúc SOC nhận hàng (SOC Pending → Delivered)"
                >
                  <dt>Late (3H)</dt>
                  <dd>
                    {fmt(c.late)}{" "}
                    <span className={styles.slaPercent}>({c.lateRate.toFixed(1)}%)</span>
                  </dd>
                </div>
              </dl>
              {c.slaTotal > 0 && (
                <div
                  className={styles.slaRatioBar}
                  aria-hidden="true"
                  title={`On time: ${c.ontimeRate.toFixed(1)}% | Late: ${c.lateRate.toFixed(1)}%`}
                >
                  <div className={styles.slaRatioOntime} style={{ width: `${c.ontimeRate}%` }} />
                  <div className={styles.slaRatioLate} style={{ width: `${c.lateRate}%` }} />
                </div>
              )}
            </div>
          </article>
        </div>
      </section>

      {/* Orders by Area Table */}
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div className={styles.panelTitleGroup}>
            <div className={styles.panelIconWrapper}>
              <MapPin size={17} aria-hidden="true" />
            </div>
            <div>
              <div className={styles.panelHeadingRow}>
                <h2 className={styles.panelTitle}>Orders by area</h2>
                <span className={styles.panelBadge}>
                  {area === "all" ? `${AREAS.length} khu vực` : areaName(area)}
                </span>
              </div>
              <p className={styles.panelSubtitle}>
                Thống kê tiến độ giao, tồn đọng và SLA SDD 3H (SOC Pending → Delivered) theo từng khu vực quản lý
              </p>
            </div>
          </div>
        </div>
        <div className={styles.scroll}>
          <table aria-label="Bảng đơn WH theo từng khu vực">
            <caption className={styles.caption}>Đơn WH theo địa bàn hiện tại</caption>
            <thead>
              <tr>
                <th scope="col">Khu vực</th>
                <th scope="col" className={styles.colRight}>Total</th>
                <th scope="col" className={styles.colRight}>Backlog</th>
                <th scope="col" className={styles.colRight}>Received D0</th>
                <th scope="col" className={styles.colRight}>Delivering</th>
                <th scope="col" className={styles.colRight}>Delivered</th>
                <th scope="col" className={styles.colCenter}>Success Rate</th>
                <th scope="col" className={styles.colRight}>Unassigned</th>
                <th scope="col" className={styles.colRight}>On-Hold</th>
                <th scope="col" className={styles.colRight}>Riders</th>
                <th scope="col" className={styles.colRight}>Late 3H (Tỉ lệ %)</th>
                <th scope="col" className={styles.colRight}>On time 3H (Tỉ lệ %)</th>
              </tr>
            </thead>
            <tbody>
              {AREAS.filter((a) => area === "all" || a === area).map((a) => {
                const n = areaSummaries[a];
                return (
                  <tr key={a}>
                    <th scope="row">
                      <span className={styles.areaPill} data-area={a}>
                        <span className={styles.areaDot} aria-hidden="true" />
                        {areaName(a)}
                      </span>
                    </th>
                    <td className={`${styles.colRight} ${styles.cellTotal}`}>{fmt(n.total)}</td>
                    <td className={styles.colRight}>
                      {n.areaBacklog > 0 ? (
                        <span className={styles.badgeWarning}>{fmt(n.areaBacklog)}</span>
                      ) : (
                        <span className={styles.cellMuted}>0</span>
                      )}
                    </td>
                    <td className={`${styles.colRight} ${styles.cellNum}`}>{fmt(n.received)}</td>
                    <td className={styles.colRight}>
                      {n.delivering > 0 ? (
                        <span className={styles.badgeInfo}>{fmt(n.delivering)}</span>
                      ) : (
                        <span className={styles.cellMuted}>0</span>
                      )}
                    </td>
                    <td className={styles.colRight}>
                      {n.delivered > 0 ? (
                        <span className={styles.badgeSuccess}>{fmt(n.delivered)}</span>
                      ) : (
                        <span className={styles.cellMuted}>0</span>
                      )}
                    </td>
                    <td className={styles.colCenter}>
                      <div className={styles.rateCell}>
                        <span
                          className={styles.rateValue}
                          data-high={n.rate >= 80}
                          data-low={n.rate === 0}
                        >
                          {n.rate.toFixed(1)}%
                        </span>
                        <div className={styles.rateBarTrack} aria-hidden="true">
                          <div
                            className={styles.rateBarFill}
                            style={{ width: `${Math.min(100, Math.max(0, n.rate))}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className={styles.colRight}>
                      {n.unassigned > 0 ? (
                        <span className={styles.badgeAttention}>{fmt(n.unassigned)}</span>
                      ) : (
                        <span className={styles.cellMuted}>0</span>
                      )}
                    </td>
                    <td className={styles.colRight}>
                      {n.onhold > 0 ? (
                        <span className={styles.badgeWarning}>{fmt(n.onhold)}</span>
                      ) : (
                        <span className={styles.cellMuted}>0</span>
                      )}
                    </td>
                    <td className={`${styles.colRight} ${styles.cellNum}`}>{fmt(n.riders)}</td>
                    <td className={styles.colRight}>
                      {n.late > 0 ? (
                        <span className={styles.badgeDanger} title={`Late: ${n.late} đơn, chiếm ${n.lateRate.toFixed(1)}% đơn giao`}>
                          <AlertTriangle size={11} aria-hidden="true" />
                          {fmt(n.late)} ({n.lateRate.toFixed(1)}%)
                        </span>
                      ) : (
                        <span className={styles.cellMuted}>0</span>
                      )}
                    </td>

                    <td className={styles.colRight}>
                      {n.ontime > 0 ? (
                        <span className={styles.badgeSuccessLight} title={`On time: ${n.ontime} đơn, chiếm ${n.ontimeRate.toFixed(1)}% đơn giao`}>
                          {fmt(n.ontime)} ({n.ontimeRate.toFixed(1)}%)
                        </span>
                      ) : (
                        <span className={styles.cellMuted}>0</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {area === "all" && (
              <tfoot>
                <tr className={styles.totalRow}>
                  <th scope="row">Tổng cộng</th>
                  <td className={`${styles.colRight} ${styles.cellTotal}`}>{fmt(c.total)}</td>
                  <td className={styles.colRight}>
                    {c.backlog > 0 ? (
                      <span className={styles.badgeWarning}>{fmt(c.backlog)}</span>
                    ) : (
                      <span className={styles.cellMuted}>0</span>
                    )}
                  </td>
                  <td className={`${styles.colRight} ${styles.cellNum}`}>{fmt(c.received)}</td>
                  <td className={styles.colRight}>
                    {c.delivering > 0 ? (
                      <span className={styles.badgeInfo}>{fmt(c.delivering)}</span>
                    ) : (
                      <span className={styles.cellMuted}>0</span>
                    )}
                  </td>
                  <td className={styles.colRight}>
                    {c.delivered > 0 ? (
                      <span className={styles.badgeSuccess}>{fmt(c.delivered)}</span>
                    ) : (
                      <span className={styles.cellMuted}>0</span>
                    )}
                  </td>
                  <td className={styles.colCenter}>
                    <div className={styles.rateCell}>
                      <span
                        className={styles.rateValue}
                        data-high={c.rate >= 80}
                        data-low={c.rate === 0}
                      >
                        {c.rate.toFixed(1)}%
                      </span>
                      <div className={styles.rateBarTrack} aria-hidden="true">
                        <div
                          className={styles.rateBarFill}
                          style={{ width: `${Math.min(100, Math.max(0, c.rate))}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className={styles.colRight}>
                    {c.unassigned > 0 ? (
                      <span className={styles.badgeAttention}>{fmt(c.unassigned)}</span>
                    ) : (
                      <span className={styles.cellMuted}>0</span>
                    )}
                  </td>
                  <td className={styles.colRight}>
                    {c.onhold > 0 ? (
                      <span className={styles.badgeWarning}>{fmt(c.onhold)}</span>
                    ) : (
                      <span className={styles.cellMuted}>0</span>
                    )}
                  </td>
                  <td className={`${styles.colRight} ${styles.cellNum}`}>{fmt(c.riders)}</td>
                  <td className={styles.colRight}>
                    {c.late > 0 ? (
                      <span className={styles.badgeDanger} title={`Tổng Late: ${c.late} đơn, chiếm ${c.lateRate.toFixed(1)}% đơn giao`}>
                        <AlertTriangle size={11} aria-hidden="true" />
                        {fmt(c.late)} ({c.lateRate.toFixed(1)}%)
                      </span>
                    ) : (
                      <span className={styles.cellMuted}>0</span>
                    )}
                  </td>

                  <td className={styles.colRight}>
                    {c.ontime > 0 ? (
                      <span className={styles.badgeSuccessLight} title={`Tổng On time: ${c.ontime} đơn, chiếm ${c.ontimeRate.toFixed(1)}% đơn giao`}>
                        {fmt(c.ontime)} ({c.ontimeRate.toFixed(1)}%)
                      </span>
                    ) : (
                      <span className={styles.cellMuted}>0</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className={styles.panelFootnote}>
          <Info size={14} aria-hidden="true" className={styles.footnoteIcon} />
          <div className={styles.footnoteText}>
            <span>
              <strong>Quy tắc tính SLA SDD 3H:</strong> Đánh giá từ lúc SOC nhận hàng (SOC_pendingReceive) đến lúc giao thành công (Delivered) với quy chuẩn 3 giờ (180 phút). Tỉ lệ On-time và Late tính trên tổng số đơn đã Delivered.
            </span>
            <span className={styles.footnoteMuted}>
              Bộ lọc thời gian phía trên tự động tổng hợp số liệu cho toàn bộ bảng và file CSV xuất ra.
            </span>
          </div>
        </div>
      </section>

      {/* Daily Breakdown Table when viewing multiple days (Week / Month / Range) */}
      {data?.dailyBreakdown && data.dailyBreakdown.length > 1 && (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div className={styles.panelTitleGroup}>
              <div className={styles.panelIconWrapper} data-tone="info">
                <Calendar size={17} aria-hidden="true" />
              </div>
              <div>
                <div className={styles.panelHeadingRow}>
                  <h2 className={styles.panelTitle}>Tổng hợp số liệu theo từng ngày</h2>
                  <span className={styles.panelBadge}>
                    {data.dailyBreakdown.length} ngày trong kỳ
                  </span>
                </div>
                <p className={styles.panelSubtitle}>
                  Diễn biến đơn hàng, tiến độ giao và tỉ lệ SLA SDD 3H (SOC Pending → Delivered) theo từng ngày
                </p>
              </div>
            </div>
          </div>
          <div className={styles.scroll}>
            <table aria-label="Bảng tổng hợp WH theo ngày">
              <thead>
                <tr>
                  <th scope="col">Ngày báo cáo</th>
                  <th scope="col" className={styles.colRight}>Tổng đơn</th>
                  <th scope="col" className={styles.colRight}>Đã giao</th>
                  <th scope="col" className={styles.colRight}>Đang giao</th>
                  <th scope="col" className={styles.colRight}>On-Hold</th>
                  <th scope="col" className={styles.colRight}>Chưa gán</th>
                  <th scope="col" className={styles.colRight}>On time 3H</th>
                  <th scope="col" className={styles.colRight}>Late 3H</th>
                  <th scope="col" className={styles.colRight}>Tỉ lệ On time</th>
                  <th scope="col" className={styles.colRight}>Tỉ lệ Late</th>
                  <th scope="col" className={styles.colCenter}>Tỷ lệ giao</th>
                </tr>
              </thead>
              <tbody>
                {data.dailyBreakdown.map((row) => (
                  <tr key={row.date}>
                    <th scope="row">
                      <strong>{formatVnDate(row.date)}</strong>
                    </th>
                    <td className={`${styles.colRight} ${styles.cellTotal}`}>{fmt(row.total)}</td>
                    <td className={styles.colRight}>
                      {row.delivered > 0 ? (
                        <span className={styles.badgeSuccess}>{fmt(row.delivered)}</span>
                      ) : (
                        <span className={styles.cellMuted}>0</span>
                      )}
                    </td>
                    <td className={styles.colRight}>
                      {row.delivering > 0 ? (
                        <span className={styles.badgeInfo}>{fmt(row.delivering)}</span>
                      ) : (
                        <span className={styles.cellMuted}>0</span>
                      )}
                    </td>
                    <td className={styles.colRight}>
                      {row.onhold > 0 ? (
                        <span className={styles.badgeWarning}>{fmt(row.onhold)}</span>
                      ) : (
                        <span className={styles.cellMuted}>0</span>
                      )}
                    </td>
                    <td className={styles.colRight}>
                      {row.unassigned > 0 ? (
                        <span className={styles.badgeAttention}>{fmt(row.unassigned)}</span>
                      ) : (
                        <span className={styles.cellMuted}>0</span>
                      )}
                    </td>
                    <td className={styles.colRight}>
                      {row.ontime > 0 ? (
                        <span className={styles.badgeSuccessLight}>{fmt(row.ontime)}</span>
                      ) : (
                        <span className={styles.cellMuted}>0</span>
                      )}
                    </td>
                    <td className={styles.colRight}>
                      {row.late > 0 ? (
                        <span className={styles.badgeDanger}>
                          <AlertTriangle size={11} aria-hidden="true" />
                          {fmt(row.late)}
                        </span>
                      ) : (
                        <span className={styles.cellMuted}>0</span>
                      )}
                    </td>
                    <td className={styles.colRight}>
                      <span className={row.ontimeRate >= 80 ? styles.badgeSuccessLight : styles.cellNum}>
                        {row.ontimeRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className={styles.colRight}>
                      <span className={row.lateRate >= 50 ? styles.badgeDanger : styles.cellNum}>
                        {row.lateRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className={styles.colCenter}>
                      <div className={styles.rateCell}>
                        <span className={styles.rateValue}>{row.rate.toFixed(1)}%</span>
                        <div className={styles.rateBarTrack} aria-hidden="true">
                          <div
                            className={styles.rateBarFill}
                            style={{ width: `${Math.min(100, Math.max(0, row.rate))}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Waiting & Pending Queues */}
      <div className={styles.split}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div className={styles.panelTitleGroup}>
              <div className={styles.panelIconWrapper} data-tone="warning">
                <Clock3 size={17} aria-hidden="true" />
              </div>
              <div>
                <div className={styles.panelHeadingRow}>
                  <h2 className={styles.panelTitle}>Chờ xuất giao</h2>
                  <span className={styles.counterBadge} data-alert={waiting.length > 0}>
                    {waiting.length}
                  </span>
                </div>
                <p className={styles.panelSubtitle}>Đơn lưu Hub chưa gán hoặc chưa xuất giao tới rider</p>
              </div>
            </div>
          </div>
          <div className={styles.queueInfoBanner}>
            <Info size={13} aria-hidden="true" />
            <span>
              LMhub_received, Created và SOC pending như danh sách Unassigned trên Sheet; KPI Unassigned chỉ đếm đơn chưa gán thực sự.
            </span>
          </div>
          <div
            className={`${styles.scroll} ${styles.tableScroll}`}
            tabIndex={0}
            role="region"
            aria-label="Bảng đơn chờ xuất giao"
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Mã đơn</th>
                  <th scope="col">KV / Quận</th>
                  <th scope="col" className={styles.colRight}>Aging</th>
                  <th scope="col">Nhận hàng</th>
                  <th scope="col" className={styles.colCenter}>Attempt</th>
                  <th scope="col" className={styles.colRight}>Còn lại 4H</th>
                </tr>
              </thead>
              <tbody>
                {waiting.slice(0, 50).map((r) => {
                  const effNow = getOrderEffectiveNow(r, now, data?.snapshotAt);
                  const orderAge = age(r, now, data?.snapshotAt);
                  const rem = remaining(r, effNow);
                  const orderDay = vnDay(r.created_at);
                  const isPast = orderDay && orderDay < currentDay;
                  return (
                    <tr key={r.shipment_id}>
                      <th scope="row">
                        <span className={styles.shipmentCode}>{r.shipment_id}</span>
                        {isPast && (
                          <span
                            className={styles.areaMiniPill}
                            style={{ marginLeft: 6, fontSize: "0.68rem", userSelect: "none" }}
                            title={`Đơn từ snapshot ngày ${orderDay}`}
                          >
                            {orderDay.split("-").reverse().slice(0, 2).join("/")}
                          </span>
                        )}
                      </th>
                      <td>
                        <div className={styles.areaDistrictCol}>
                          <span className={styles.areaMiniPill} data-area={r.area}>
                            {r.area === "UNRESOLVED" ? "Chưa rõ KV" : r.area}
                          </span>
                          <span className={styles.districtName}>{r.district || "Chưa rõ quận"}</span>
                        </div>
                      </td>
                      <td className={styles.colRight}>
                        <span
                          className={
                            orderAge !== null && orderAge >= 720
                              ? styles.agingCritical
                              : orderAge !== null && orderAge >= 240
                              ? styles.agingWarning
                              : styles.agingNormal
                          }
                          title={isPast ? `Aging chốt tại snapshot ngày ${orderDay}` : undefined}
                        >
                          {duration(orderAge)}
                        </span>
                      </td>
                      <td>
                        {r.received_at ? (
                          <span className={styles.statusPillReceived}>Received</span>
                        ) : (
                          <span className={styles.statusPillUnreceived}>Chưa nhận</span>
                        )}
                      </td>
                      <td className={styles.colCenter}>
                        {(r.attempt ?? 0) > 0 ? (
                          <span className={styles.attemptBadgeWarning}>Attempt {r.attempt}</span>
                        ) : (
                          <span className={styles.attemptBadge}>{r.attempt ?? "—"}</span>
                        )}
                      </td>
                      <td className={styles.colRight}>
                        {rem === null ? (
                          <span className={styles.cellMuted}>—</span>
                        ) : rem <= 0 ? (
                          <span className={styles.slaOverdue}>
                            <AlertTriangle size={11} aria-hidden="true" />
                            {duration(rem)}
                          </span>
                        ) : rem <= 60 ? (
                          <span className={styles.slaUrgent}>
                            <Clock3 size={11} aria-hidden="true" />
                            {duration(rem)}
                          </span>
                        ) : (
                          <span className={styles.slaNormal}>
                            <Clock3 size={11} aria-hidden="true" />
                            {duration(rem)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!waiting.length && (
                  <tr>
                    <td colSpan={6}>
                      <div className={styles.tableEmpty}>
                        <CheckCircle2 size={24} className={styles.emptySuccessIcon} aria-hidden="true" />
                        <p>Không có đơn chờ xuất giao</p>
                        <small>Tất cả đơn đã được xử lý hoặc gán rider thành công</small>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {waiting.length > 50 && (
            <div className={styles.tableFooterNote}>
              Hiển thị 50 đơn ưu tiên nhất; xem danh sách đầy đủ bên dưới hoặc xuất CSV.
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div className={styles.panelTitleGroup}>
              <div className={styles.panelIconWrapper} data-tone="info">
                <Truck size={17} aria-hidden="true" />
              </div>
              <div>
                <div className={styles.panelHeadingRow}>
                  <h2 className={styles.panelTitle}>SOC pending receive</h2>
                  <span className={styles.counterBadge} data-alert={pending.length > 0}>
                    {pending.length}
                  </span>
                </div>
                <p className={styles.panelSubtitle}>Đơn đang chuyển từ SOC tới Hub, đang chờ quét nhận</p>
              </div>
            </div>
          </div>
          <div
            className={`${styles.scroll} ${styles.tableScroll}`}
            tabIndex={0}
            role="region"
            aria-label="Bảng đơn SOC pending receive"
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Mã đơn</th>
                  <th scope="col">Khu vực</th>
                  <th scope="col">Tạo đơn</th>
                  <th scope="col" className={styles.colRight}>Aging</th>
                </tr>
              </thead>
              <tbody>
                {pending.slice(0, 50).map((r) => {
                  const orderAge = age(r, now, data?.snapshotAt) ?? 0;
                  const isOverdue = orderAge >= 60;
                  const orderDay = vnDay(r.created_at);
                  const isPast = orderDay && orderDay < currentDay;
                  return (
                    <tr key={r.shipment_id}>
                      <th scope="row">
                        <span className={styles.shipmentCode}>{r.shipment_id}</span>
                        {isPast && (
                          <span
                            className={styles.areaMiniPill}
                            style={{ marginLeft: 6, fontSize: "0.68rem", userSelect: "none" }}
                            title={`Đơn từ snapshot ngày ${orderDay}`}
                          >
                            {orderDay.split("-").reverse().slice(0, 2).join("/")}
                          </span>
                        )}
                      </th>
                      <td>
                        <span className={styles.areaMiniPill} data-area={r.area}>
                          {areaName(r.area)}
                        </span>
                      </td>
                      <td>
                        <time dateTime={r.created_at ?? undefined} className={styles.timeText}>
                          {stamp(r.created_at)}
                        </time>
                      </td>
                      <td className={styles.colRight}>
                        {isOverdue ? (
                          <span className={styles.agingCritical} data-overdue="true">
                            <AlertTriangle size={11} aria-hidden="true" />
                            {duration(orderAge)}
                          </span>
                        ) : (
                          <span className={styles.agingNormal}>{duration(orderAge)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!pending.length && (
                  <tr>
                    <td colSpan={4}>
                      <div className={styles.tableEmpty}>
                        <CheckCircle2 size={24} className={styles.emptySuccessIcon} aria-hidden="true" />
                        <p>Không có đơn SOC pending receive</p>
                        <small>Không có kiện hàng nào đang tắc ở luồng chuyển tiếp SOC</small>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {pending.length > 50 && (
            <div className={styles.tableFooterNote}>
              Hiển thị 50 đơn đầu; lọc SOC_pendingReceive bên dưới để xem đủ.
            </div>
          )}
        </section>
      </div>

      {/* Orders & Rider Details */}
      <section className={`${styles.panel} ${styles.ordersPanel}`}>
        <div className={styles.orderToolbar}>
          <div className={styles.orderToolbarHead}>
            <div>
              <h2>
                Chi tiết đơn &amp; rider <span>{fmt(filtered.length)}</span>
              </h2>
              <p>Mở một đơn để xem mốc thời gian và lý do On-Hold.</p>
            </div>
            <button onClick={download} disabled={!filtered.length} className={styles.exportBtn}>
              <Download size={15} aria-hidden="true" />
              Xuất CSV
            </button>
          </div>
          <div className={styles.statusPillGroup}>
            <button
              type="button"
              className={`${styles.statusFilterBtn} ${status === "all" ? styles.statusFilterBtnActive : ""}`}
              onClick={() => { setStatus("all"); setPage(1); }}
            >
              Tất cả ({fmt(pillCounts.riderTotal)})
            </button>
            <button
              type="button"
              className={`${styles.statusFilterBtn} ${styles.statusFilterBtnNearLate} ${status === "near_late" ? styles.statusFilterBtnActive : ""}`}
              onClick={() => { setStatus("near_late"); setPage(1); }}
            >
              ⏳ Chuẩn bị trễ ({fmt(pillCounts.nearLate)})
            </button>
            <button
              type="button"
              className={`${styles.statusFilterBtn} ${status === "late" ? styles.statusFilterBtnActive : ""}`}
              onClick={() => { setStatus("late"); setPage(1); }}
            >
              🚨 Late SDD 3H ({fmt(pillCounts.late)})
            </button>
            <button
              type="button"
              className={`${styles.statusFilterBtn} ${status === "Delivering" ? styles.statusFilterBtnActive : ""}`}
              onClick={() => { setStatus("Delivering"); setPage(1); }}
            >
              🚴 Delivering ({fmt(pillCounts.delivering)})
            </button>
            <button
              type="button"
              className={`${styles.statusFilterBtn} ${status === "onhold" ? styles.statusFilterBtnActive : ""}`}
              onClick={() => { setStatus("onhold"); setPage(1); }}
            >
              ⏸️ On-Hold ({fmt(pillCounts.onhold)})
            </button>
            <button
              type="button"
              className={`${styles.statusFilterBtn} ${status === "Delivered" ? styles.statusFilterBtnActive : ""}`}
              onClick={() => { setStatus("Delivered"); setPage(1); }}
            >
              ✅ Delivered ({fmt(pillCounts.delivered)})
            </button>
          </div>
          <div className={styles.orderFilterRow}>
            <label className={styles.search}>
              <span>Tìm đơn / rider / địa bàn</span>
              <div>
                <Search size={15} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Mã đơn, tên/ID rider, quận, phường…"
                />
              </div>
            </label>
            <div className={styles.orderFilterSelects}>
              <label>
                <span>Khu vực</span>
                <select
                  value={area}
                  onChange={(e) => {
                    setArea(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">Tất cả khu vực</option>
                  {AREAS.map((a) => (
                    <option key={a} value={a}>
                      {areaName(a)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Trạng thái</span>
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  {[
                    ["all", "Tất cả trạng thái"],
                    ["near_late", "⏳ Chuẩn bị trễ (còn ≤ 60p)"],
                    ["late", "🚨 Late SDD 3H (Đã trễ)"],
                    ["Delivering", "Delivering (Đang giao)"],
                    ["onhold", "On-Hold (Tạm hoãn)"],
                    ["Delivered", "Delivered (Đã giao)"],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Sắp xếp</span>
                <select
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value as WhSortOption);
                    setPage(1);
                  }}
                >
                  <option value="status">Trạng thái (Delivering / On-Hold trước)</option>
                  <option value="remaining_asc">Hạn SLA: Gấp nhất trước</option>
                  <option value="created_desc">Tạo đơn: Mới nhất trước</option>
                  <option value="created_asc">Tạo đơn: Cũ nhất trước</option>
                  <option value="attempt_desc">Attempt: Nhiều nhất trước</option>
                </select>
              </label>
            </div>
          </div>
        </div>
        <OrderList orders={visible} now={now} snapshotAt={data?.snapshotAt} />
        <div className={styles.pagination}>
          <span>
            Trang {activePage} / {pages} · {filtered.length} đơn thuộc bảng SLA rider
          </span>
          <button disabled={activePage === 1} onClick={() => setPage(activePage - 1)}>
            Trước
          </button>
          <button disabled={activePage === pages} onClick={() => setPage(activePage + 1)}>
            Sau
          </button>
        </div>
      </section>

      <details className={styles.rules}>
        <summary>Quy tắc tính từ Google Sheet</summary>
        <p>
          WH Ready = SOC_pendingReceive. On-Hold gồm Onhold và LMhub_received đã có delivering_time. SLA SDD đánh giá từ lúc SOC nhận hàng (SOC_pendingReceive) đến lúc giao thành công (Delivered) với quy chuẩn 3 giờ (180 phút). WH SLA đánh giá Created → SOC_pendingReceive trong 60 phút (1 giờ). Tổng SLA đánh giá Created → Delivered trong 240 phút (4 giờ). Attempt 0 lấy delivered_time, Attempt 1 lấy onhold_time, lớn hơn 1 cần kiểm tra lại; thiếu Attempt hiển thị N/A. Tỉ lệ On-time (%) và Late (%) được tính trên tổng các đơn hàng đã Delivered. Còn lại tính theo hạn chót giao hàng. Múi giờ Việt Nam.
        </p>
      </details>
    </div>
  );
}
