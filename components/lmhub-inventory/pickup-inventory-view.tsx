"use client";
import { useRememberedState } from "@/components/layout/filter-memory";

import { OPERATING_AREAS, isOperatingArea } from "@/lib/locations/operating-areas";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Download,
  MapPin,
  RefreshCcw,
  Search,
  Truck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarChart, ChartHead, Donut, RiskStrip, ShareRow } from "@/components/lmhub-inventory/lmhub-inventory-charts";
import { HeatLegend, Seg } from "@/components/lmhub-inventory/lmhub-inventory-boards";
import { formatDateTime, formatRelative, RELOAD_DEBOUNCE_MS } from "@/components/lmhub-inventory/lmhub-inventory-model";
import { DeliveryInventoryBoard } from "./delivery-inventory-board";
import {
  PICKUP_STATUS_LABEL,
  buildPickupBoard,
  filterPickupBoard,
  pickupAnalytics,
  visibleBoardTotal,
  visibleTotal,
  type Area,
  type CotFilter,
  type DistrictAgg,
  type HeatFilter,
  type PickupStatusKey,
  type PickupStatusRow,
} from "@/components/lmhub-inventory/pickup-inventory-model";
import type { RiderInventoryRow } from "@/lib/pickup/inventory-riders";
import { PickupRiderInventory } from "./pickup-rider-inventory";
import { PickupOrderDialog } from "./pickup-order-dialog";
import type { PickupOrderScope } from "@/lib/pickup/inventory-orders";
import "./delivery-inventory.css";
import "./pickup-inventory.css";

export function PickupInventoryView({ canQueue = false }: { canQueue?: boolean }) {
  const [orderScope, setOrderScope] = useState<PickupOrderScope | null>(null);
  const [section, setSection] = useState<"zones" | "riders">("zones");
  const status: PickupStatusKey = "assigned";
  const [data, setData] = useState<{ rows: PickupStatusRow[]; riders: RiderInventoryRow[]; snapshotAt: string | null }>({ rows: [], riders: [], snapshotAt: null });
  const { rows, riders, snapshotAt } = data;
  const loadId = useRef(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cot, setCot] = useRememberedState<CotFilter>("pickup-inventory-view:cot", "all");
  const [heat, setHeat] = useState<HeatFilter>("all");

  const [areaFilter, setAreaFilter] = useRememberedState<"all" | Area>("pickup-inventory-view:areaFilter", "all");

  const [showCharts, setShowCharts] = useState(false);

  const [queueing, setQueueing] = useState(false);
  const [waitingSnapshot, setWaitingSnapshot] = useState(false);
  const [queueNote, setQueueNote] = useState<string | null>(null);
  const [queueMeta, setQueueMeta] = useState<{ pending: number; running: number; lastStatus: string; lastMessage: string; lastKind?: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baselineRef = useRef<string | null>(null);

  const load = useCallback(async (nextStatus = status) => {
    const requestId = ++loadId.current;
    const params = new URLSearchParams({ view: "geography-dashboard", p_status: PICKUP_STATUS_LABEL[nextStatus] });
    const res = await fetch(`/api/pickup-inventory?${params}`, { cache: "no-store" });
    const payload = await res.json();
    if (!res.ok || !payload.success) throw new Error(payload.error ?? `API ${res.status}`);
    const collected: PickupStatusRow[] = [];
    for (const row of payload.rows ?? []) {
      const area = String(row.area ?? "").trim().toUpperCase();
      const orders = Number(row.orders);
      if (!isOperatingArea(area) || !Number.isFinite(orders) || orders <= 0) continue;
      const district=String(row.district??"").trim()||"Chưa có quận",ward=String(row.ward??"").trim()||"Chưa có phường";
      collected.push({ area, district, ward, zone:null, cot: row.cot,
        orders, snapshot_id: null, snapshot_at: payload.snapshotAt ?? null, updated_at: null });
    }
    if (requestId === loadId.current) setData({ rows: collected, riders: payload.riders ?? [], snapshotAt: payload.snapshotAt ?? null });
  }, [status]);

  const runLoad = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await load();
    } catch (err) {
      console.error("[pickup-board]", err);
      setError(err instanceof Error ? `Không tải được tồn pickup: ${err.message}` : "Không tải được tồn pickup.");
    } finally {
      setLoading(false);
    }
  }, [load]);

  const refreshStatus = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không refresh được bảng trạng thái pickup.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [load]);

  const scheduleLoad = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void runLoad(), RELOAD_DEBOUNCE_MS);
  }, [runLoad]);

  useEffect(() => {
    const initialLoad = setTimeout(() => void runLoad(), 0);
    return () => {
      clearTimeout(initialLoad);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [runLoad]);

  useReportInitialDataLoading("pickup-inventory", loading);

  const refreshQueueStatus = useCallback(async () => {
    const response = await fetch("/api/lmhub-inventory/refresh", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as {
      success?: boolean;
      pending?: number;
      running?: number;
      lastStatus?: string;
      lastMessage?: string;
      lastKind?: string;
    } | null;
    if (!payload?.success) return payload;
    setQueueMeta({
      pending: payload.pending ?? 0,
      running: payload.running ?? 0,
      lastStatus: payload.lastStatus ?? "",
      lastMessage: payload.lastMessage ?? "",
      lastKind: payload.lastKind,
    });
    return payload;
  }, []);

  useEffect(() => {
    const initialLoad = setTimeout(() => void refreshQueueStatus().catch(() => null), 0);
    return () => clearTimeout(initialLoad);
  }, [refreshQueueStatus]);
  useSupabaseRealtime({ table: "lmhub_fetch_jobs", onChange: (payload) => {
    void refreshQueueStatus().catch(() => null);
    if ("status" in payload.new && payload.new.status === "DONE") scheduleLoad();
  }, debounceMs: 400 });

  const queuePickup = useCallback(async () => {
    if (queueing) return;
    setQueueing(true);
    setQueueNote(null);
    baselineRef.current = snapshotAt;
    try {
      const response = await fetch("/api/lmhub-inventory/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "pickup" }),
      });
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        queued?: boolean;
        message?: string;
        error?: string;
        pending?: number;
        running?: number;
        lastStatus?: string;
        lastMessage?: string;
        lastKind?: string;
      } | null;
      if (!response.ok || !payload?.success) {
        setQueueNote(payload?.error ?? "Không đẩy được tồn pickup vào hàng đợi.");
        return;
      }
      setQueueNote(payload.message ?? "Đã gửi yêu cầu.");
      if (typeof payload.pending === "number") {
        setQueueMeta({
          pending: payload.pending ?? 0,
          running: payload.running ?? 0,
          lastStatus: payload.lastStatus ?? "",
          lastMessage: payload.lastMessage ?? "",
          lastKind: payload.lastKind,
        });
      }
      if (payload.queued) setWaitingSnapshot(true);
    } catch {
      setQueueNote("Không kết nối được API hàng đợi tồn.");
    } finally {
      setQueueing(false);
    }
  }, [queueing, snapshotAt]);

  useEffect(() => {
    let stopped = false;
    let polling = false;
    const started = Date.now();
    const tick = async () => {
      if (stopped || polling || document.visibilityState === "hidden") return;
      polling = true;
      try {
        await Promise.all([load(), refreshQueueStatus().catch(() => null)]);
        if (!stopped) setError(null);
      } catch (err) {
        if (!stopped) setError(err instanceof Error ? err.message : "Không tải được tồn pickup.");
      } finally {
        polling = false;
      }
      if (!stopped && waitingSnapshot && Date.now() - started > 20 * 60_000) {
        setWaitingSnapshot(false);
        setQueueNote("Worker chưa ghi snapshot pickup mới sau 20 phút. Kiểm tra trang Nguồn dữ liệu.");
      }
    };
    const timerId = setInterval(() => void tick(), waitingSnapshot ? 8000 : 15000);
    const onVisible = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timerId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [waitingSnapshot, load, refreshQueueStatus]);

  useEffect(() => {
    if (!waitingSnapshot || !snapshotAt) return;
    if (snapshotAt !== baselineRef.current) {
      setWaitingSnapshot(false);
      setQueueNote(`Đã có snapshot pickup mới lúc ${formatDateTime(snapshotAt)}.`);
    }
  }, [waitingSnapshot, snapshotAt]);

  const filtered = useMemo(
    () => OPERATING_AREAS.map((area) => ({ area, districts: filterPickupBoard(buildPickupBoard(rows, area), query, cot, heat) })),
    [rows, query, cot, heat],
  );
  const allDistricts = useMemo(() => filtered.filter(board => areaFilter === "all" || board.area === areaFilter).flatMap((board) => board.districts), [filtered, areaFilter]);
  const globalAnalytics = useMemo(() => pickupAnalytics(filtered.flatMap(board => board.districts), [], cot), [filtered, cot]);
  const analytics = useMemo(() => pickupAnalytics(allDistricts, [], cot), [allDistricts, cot]);
  const boards = useMemo(() => filtered.map((board) => ({ ...board, total: visibleBoardTotal(board.districts, cot) })), [filtered, cot]);
  const statusLabel = PICKUP_STATUS_LABEL[status];
  const areaWards = useMemo(() => filtered.map((board) => ({ area: board.area, wards: mergeWards(board.districts, cot) })), [filtered, cot]);
  const allWards = useMemo(() => areaWards.filter(board => areaFilter === "all" || board.area === areaFilter).flatMap((board) => board.wards), [areaWards, areaFilter]);
  const topWards = useMemo(() => {
    const map = new Map<string, { label: string; area: Area; value: number }>();
    for (const district of allDistricts) {
      for (const ward of district.wards) {
        const current = map.get(`${ward.area}:${ward.district}:${ward.ward}`) ?? { label: `${ward.area} · ${ward.ward}`, area: ward.area, value: 0 };
        current.value += visibleTotal(ward, cot);
        map.set(`${ward.area}:${ward.district}:${ward.ward}`, current);
      }
    }
    return [...map.values()].filter((item) => item.value > 0).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [allDistricts, cot]);

  useSupabaseRealtime({ table: "pickup_48h_no_api2", onChange: scheduleLoad, debounceMs: 1500 });

  const clearFilters = () => {
    setAreaFilter("all");
    setQuery("");
    setCot("all");
    setHeat("all");
  };

  return (
    <div className="pickup-inventory-page delivery-inventory-page pickup-workspace" data-area={areaFilter}>
      {/* Top Header Command Bar */}
      <header className="pickup-workspace-header">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-[var(--area-deep)]">
            <MapPin size={14} aria-hidden="true" />
            <span>VẬN HÀNH LẤY HÀNG</span>
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
            Pickup Backlog
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Theo dõi tồn theo khu vực → quận/huyện → phường và theo rider.
          </p>
        </div>

        <div className="pickup-header-actions">
          <div className="pickup-snapshot">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dữ liệu cập nhật</p>
            <p className="font-mono text-sm font-bold text-slate-800">{formatDateTime(snapshotAt)}</p>
            <p className="text-[11px] text-slate-400">{formatRelative(snapshotAt)}</p>
          </div>

          <Link
            href="/inventory-delivery"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-blue-700"
          >
            <Truck size={15} />
            <span>Tồn delivery</span>
          </Link>

          <Button
            type="button"
            variant="secondary"
            onClick={() => void refreshStatus()}
            disabled={loading || refreshing}
            className="rounded-xl text-xs font-bold shadow-sm"
          >
            <RefreshCcw size={15} className={loading || refreshing ? "animate-spin" : undefined} />
            <span>{refreshing ? "Đang tải..." : "Làm mới bảng"}</span>
          </Button>

          {canQueue ? (
            <Button
              type="button"
              onClick={() => void queuePickup()}
              disabled={queueing || waitingSnapshot}
              className="rounded-xl text-xs font-bold shadow-sm"
            >
              <Download size={15} className={queueing || waitingSnapshot ? "animate-pulse" : undefined} />
              <span>{queueing ? "Đang đẩy..." : waitingSnapshot ? "Đang chờ worker" : "Đồng bộ SPX"}</span>
            </Button>
          ) : null}
        </div>
      </header>

      {section === "zones" && <>
      {/* KPI Tiles Section */}
      <section aria-label="Số liệu trong phạm vi đang hiển thị" className="pickup-overview">
        <StatTile
          label="Tổng đơn chờ lấy"
          value={analytics.visible}
          hint={`${allWards.length} phường còn ${statusLabel}`}
          accent="ink"
        />
        <StatTile
          label="Đơn COT 1"
          value={analytics.cot1}
          hint={cot === "cot2" ? "Đang ẩn bởi bộ lọc COT" : "Đơn tạo trước 12:00"}
          accent="blue"
        />
        <StatTile
          label="Đơn COT 2"
          value={analytics.cot2}
          hint={cot === "cot1" ? "Đang ẩn bởi bộ lọc COT" : "Đơn tạo sau 12:00"}
          accent="teal"
        />
        <StatTile
          label="Phường cần ưu tiên"
          value={analytics.hotRiders}
          hint="Từ 36 đơn tồn (cần đôn đốc)"
          accent={analytics.hotRiders ? "red" : "green"}
        />
      </section>

      </>}
      <section className="pickup-command-panel" aria-label="Điều khiển bảng tồn">
      <nav aria-label="Chọn phần tồn pickup" className="pickup-view-tabs">
        <button aria-pressed={section === "zones"} onClick={() => { setSection("zones"); setQuery(""); setHeat("all"); }} type="button">Tồn theo địa bàn</button>
        <button aria-pressed={section === "riders"} onClick={() => { setSection("riders"); setQuery(""); setHeat("all"); }} type="button">Tồn theo rider</button>
      </nav>
      <div className="pickup-data-context"><span>Assigned · Chưa Onhold / chưa Picked</span><span role="status">{(queueMeta?.pending ?? 0) + (queueMeta?.running ?? 0) > 0 || waitingSnapshot ? "Đang đồng bộ dữ liệu" : "Hàng đợi sẵn sàng"}</span></div>

      {queueNote ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
          {waitingSnapshot ? <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-600" /> : null}
          {queueNote}
        </div>
      ) : null}

      <section aria-label="Phạm vi địa bàn" className="delivery-scope overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <nav aria-label="Chọn khu vực tồn Pickup" className="pickup-area-switcher">
          {["all", ...OPERATING_AREAS].map((area) => {
            const isAll = area === "all";
            const total = isAll ? globalAnalytics.visible : (boards.find((b) => b.area === area)?.total ?? 0);
            const isSelected = areaFilter === area;
            return (
              <button
                key={area}
                type="button"
                data-area={area}
                aria-pressed={isSelected}
                onClick={() => setAreaFilter(area as "all" | Area)}
                className="delivery-area-card pickup-area-choice"
              >
                <span className="delivery-area-label flex items-center justify-between gap-2 text-xs font-semibold">
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="pickup-area-dot" />
                    {isAll ? "Tất cả" : area}
                  </span>
                  <span aria-hidden="true" className="delivery-area-indicator font-bold">
                    {isSelected ? "✓" : "↗"}
                  </span>
                </span>
                {section === "zones" && <span className="delivery-area-value mt-2.5 block text-2xl font-black tabular-nums tracking-tight">
                  {total.toLocaleString("vi-VN")}{" "}
                  <span className="text-[10px] font-normal text-slate-500">đơn</span>
                </span>}
              </button>
            );
          })}
        </nav>

      </section>

      {/* Filter and Control Toolbar */}
      <div className="pickup-filter-toolbar">
        {section === "zones" && <>        <span className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Tìm quận hoặc phường"
            placeholder="Tìm quận, phường…"
            className="h-9 pl-9 pr-8 text-xs"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Xóa tìm kiếm"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          ) : null}
        </span>
</>}

        <Seg
          value={cot}
          onChange={setCot}
          options={[
            { id: "all", label: "Cả COT" },
            { id: "cot1", label: "COT 1" },
            { id: "cot2", label: "COT 2" },
          ]}
        />

        {section === "zones" && <>
        <Seg
          value={heat}
          onChange={setHeat}
          options={[
            { id: "all", label: "Tất cả phường" },
            { id: "hot", label: "Chỉ phường đỏ" },
          ]}
        />

        </>}

        <button type="button" onClick={clearFilters} className="pickup-reset">Đặt lại</button>
        <details className="relative text-xs text-slate-500">
          <summary className="cursor-pointer select-none rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-600 hover:bg-slate-50">
            Chú thích màu
          </summary>
          <div className="absolute right-0 z-30 mt-1 min-w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
            <HeatLegend />
          </div>
        </details>
      </div>

      </section>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      {section === "riders" ? <PickupRiderInventory area={areaFilter} cot={cot} status={statusLabel} rows={riders} loading={loading || refreshing} error={error} /> : <>
      {/* Main Area Wards Table Section */}
      {loading && !rows.length ? (
        <div className="grid grid-cols-1 gap-4">
          <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      ) : (
        <DeliveryInventoryBoard kind="Pickup" districts={allDistricts} cot={cot} selected={orderScope?.district&&isOperatingArea(orderScope.area)?{area:orderScope.area as Area,district:orderScope.district,ward:orderScope.ward??null}:null}
          forceExpanded={!!query||heat==='hot'} onSelect={focus=>setOrderScope({area:focus.area,district:focus.district,ward:focus.ward??undefined,
            wards:allDistricts.find(d=>d.area===focus.area&&d.district===focus.district)?.wards.map(w=>w.ward),
            cot,status:statusLabel,title:[focus.area,focus.district,focus.ward].filter(Boolean).join(' / ')})}/>
      )}

      </>}
      {section === "zones" && <div className="pickup-analysis">      {/* Collapsible Analytics Charts */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setShowCharts((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-left text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
        >
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-blue-600" />
            <span>Biểu đồ phân tích cơ cấu & rủi ro địa bàn</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <span>{showCharts ? "Thu gọn biểu đồ" : "Xem chi tiết biểu đồ"}</span>
            {showCharts ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </div>
        </button>

        {showCharts ? (
          <div className="grid grid-cols-1 gap-4 border-t border-slate-100 p-5 xl:grid-cols-12">
            <article className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50 xl:col-span-4">
              <ChartHead title="Cơ cấu khu vực" caption={`${statusLabel} theo KV và COT đơn`} />
              <div className="flex items-center gap-5 px-5 pb-5">
                <Donut values={boards.map((board) => board.total)} />
                <div className="min-w-0 flex-1 space-y-3">
                  {boards.map((board) => (
                    <ShareRow
                      key={board.area}
                      label={board.area}
                      value={board.total}
                      total={analytics.visible}
                      tone="var(--area-color)"
                    />
                  ))}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <MiniMetric label="COT 1" value={analytics.cot1} />
                    <MiniMetric label="COT 2" value={analytics.cot2} />
                  </div>
                </div>
              </div>
            </article>

            <article className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50 xl:col-span-8">
              <ChartHead title="Áp lực theo phường" caption={`Top phường còn ${statusLabel}`} />
              <div className="px-5 pb-5">
                <BarChart rows={topWards} />
              </div>
            </article>

            <article className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50 xl:col-span-12">
              <ChartHead title="Phổ rủi ro phường" caption="Hết tồn / ít / vừa / cao / đỏ" />
              <div className="px-5 pb-5">
                <RiskStrip bins={analytics.heatBins} />
              </div>
            </article>
          </div>
        ) : null}
      </section>

</div>}
      {orderScope && <PickupOrderDialog scope={orderScope} onClose={() => setOrderScope(null)}/>}
    </div>
  );
}

type FlatWard = { district:string; ward: string; area: Area; cot1: number; cot2: number; total: number };

function mergeWards(districts: DistrictAgg[], cot: CotFilter): FlatWard[] {
  const map = new Map<string, FlatWard>();
  for (const district of districts) {
    for (const ward of district.wards) {
      const current = map.get(`${ward.area}:${ward.district}:${ward.ward}`) ?? {
        ward: ward.ward,
        district:ward.district,
        area: ward.area,
        cot1: 0,
        cot2: 0,
        total: 0,
      };
      current.cot1 += ward.cot1;
      current.cot2 += ward.cot2;
      current.total += ward.total;
      map.set(`${ward.area}:${ward.district}:${ward.ward}`, current);
    }
  }
  return [...map.values()].sort((a, b) => visibleTotal(b, cot) - visibleTotal(a, cot) || a.ward.localeCompare(b.ward, "vi"));
}

function StatTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number;
  hint: string;
  accent: "ink" | "blue" | "teal" | "red" | "green";
}) {
  const tone = {
    ink: "text-slate-900",
    blue: "text-blue-700",
    teal: "text-emerald-700",
    red: "text-rose-700",
    green: "text-emerald-700",
  }[accent];

  return (
    <article className="delivery-stat rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-accent={accent}>
      <div><p className="text-xs font-medium text-slate-500">{label}</p></div>
      <p className={"mt-1 font-mono text-3xl font-black tracking-tight " + tone}>{value.toLocaleString("vi-VN")}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </article>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200/60 bg-white p-2.5 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-black text-slate-800">{value.toLocaleString("vi-VN")}</p>
    </div>
  );
}
