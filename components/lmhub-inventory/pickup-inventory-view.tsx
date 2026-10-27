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
import { Select } from "@/components/ui/select";
import { BarChart, ChartHead, Donut, RiskStrip, ShareRow } from "@/components/lmhub-inventory/lmhub-inventory-charts";
import { HeatLegend, Seg } from "@/components/lmhub-inventory/lmhub-inventory-boards";
import { formatDateTime, formatRelative, heatClass, RELOAD_DEBOUNCE_MS } from "@/components/lmhub-inventory/lmhub-inventory-model";
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
import { PickupRiderInventory } from "./pickup-rider-inventory";
import { PickupOrderDialog } from "./pickup-order-dialog";
import type { PickupOrderScope } from "@/lib/pickup/inventory-orders";
import { cn } from "@/utils/cn";
import "./pickup-inventory.css";

export function PickupInventoryView({ canQueue = false }: { canQueue?: boolean }) {
  const [orderScope, setOrderScope] = useState<PickupOrderScope | null>(null);
  const [section, setSection] = useState<"zones" | "riders">("zones");
  const status: PickupStatusKey = "assigned";
  const [rows, setRows] = useState<PickupStatusRow[]>([]);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
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
    const params = new URLSearchParams({ view: "zone-board", p_status: PICKUP_STATUS_LABEL[nextStatus] });
    const res = await fetch(`/api/pickup-inventory?${params}`, { cache: "no-store" });
    const payload = await res.json();
    if (!res.ok || !payload.success) throw new Error(payload.error ?? `API ${res.status}`);
    const collected: PickupStatusRow[] = [];
    for (const row of payload.rows ?? []) {
      const area = String(row.area ?? "").trim().toUpperCase();
      const orders = Number(row.orders);
      if (!isOperatingArea(area) || !Number.isFinite(orders) || orders <= 0) continue;
      const zone = String(row.zone ?? "").trim() || "Chưa có mã zone";
      // The shared board model uses its leaf label for filtering and heat levels.
      collected.push({ area, district: "—", ward: zone, zone, cot: row.cot,
        orders, snapshot_id: null, snapshot_at: payload.snapshotAt ?? null, updated_at: null });
    }
    setRows(collected);
    setSnapshotAt(payload.snapshotAt ?? null);
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
    const initialLoad = setTimeout(() => void refreshQueueStatus(), 0);
    return () => clearTimeout(initialLoad);
  }, [refreshQueueStatus]);
  useSupabaseRealtime({ table: "lmhub_fetch_jobs", onChange: () => { void refreshQueueStatus(); }, debounceMs: 400 });

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
    if (!waitingSnapshot) return;
    let stopped = false;
    const started = Date.now();
    const tick = async () => {
      if (stopped) return;
      await load();
      await refreshQueueStatus();
      if (Date.now() - started > 20 * 60_000) {
        setWaitingSnapshot(false);
        setQueueNote("Worker chưa ghi snapshot pickup mới sau 20 phút. Kiểm tra cửa sổ Tồn KV1–KV5.");
      }
    };
    void tick();
    const timerId = setInterval(() => void tick(), 8000);
    return () => {
      stopped = true;
      clearInterval(timerId);
    };
  }, [waitingSnapshot, load, refreshQueueStatus]);

  useEffect(() => {
    if (!waitingSnapshot || !snapshotAt) return;
    if (baselineRef.current && snapshotAt !== baselineRef.current) {
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
        const current = map.get(`${ward.area}:${ward.ward}`) ?? { label: `${ward.area} · ${ward.ward}`, area: ward.area, value: 0 };
        current.value += visibleTotal(ward, cot);
        map.set(`${ward.area}:${ward.ward}`, current);
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
    <div className="pickup-inventory-page mx-auto max-w-[1680px] space-y-5" data-area={areaFilter}>
      {/* Top Header Command Bar */}
      <header className="pickup-page-header flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-[var(--area-deep)]">
            <span className="pickup-area-dot animate-pulse" />
            <span>Điều hành tồn · Pickup {statusLabel}</span>
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
            Tồn pickup
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Theo dõi tồn theo khu vực / zone và theo tên rider ở hai phần riêng.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Snapshot</p>
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
              <span>{queueing ? "Đang đẩy..." : waitingSnapshot ? "Đang chờ worker" : "Fetch tồn pickup"}</span>
            </Button>
          ) : null}
        </div>
      </header>

      <nav aria-label="Chọn phần tồn pickup" className="flex gap-2 rounded-xl border border-slate-200 bg-white p-2">
        <button aria-pressed={section === "zones"} onClick={() => { setSection("zones"); setQuery(""); setHeat("all"); }} className={cn("rounded-lg px-5 py-2.5 text-sm font-bold", section === "zones" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50")}>Tồn khu vực / zone</button>
        <button aria-pressed={section === "riders"} onClick={() => { setSection("riders"); setQuery(""); setHeat("all"); }} className={cn("rounded-lg px-5 py-2.5 text-sm font-bold", section === "riders" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50")}>Tồn theo rider</button>
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div><span className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">Assigned · Chưa Onhold / chưa Picked</span><p className="mt-3 text-[11px] text-slate-500">Chỉ đơn đang gán và còn chờ lấy; không suy trạng thái từ task của điểm lấy hàng.</p></div>
        <div className="flex items-center gap-2 pr-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            {(queueMeta?.pending ?? 0) + (queueMeta?.running ?? 0) > 0 || waitingSnapshot ? (
              <span className="flex items-center gap-1.5 text-amber-700">
                <span className="h-2 w-2 animate-ping rounded-full bg-amber-500" />
                Hàng đợi chung đang chạy
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Hàng đợi sẵn sàng
              </span>
            )}
          </span>
        </div>
      </div>

      {queueNote ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
          {waitingSnapshot ? <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-600" /> : null}
          {queueNote}
        </div>
      ) : null}

      {/* Scope Navigation: Hero Area Cards (KV1 - KV5) */}
      {section === "zones" && <section aria-label="Phạm vi địa bàn" className="pickup-scope overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
          <div>
            <div className="flex items-center gap-2">
              <MapPin size={17} className="text-[var(--area-color)]" />
              <h2 className="text-sm font-bold text-slate-900">Phạm vi địa bàn</h2>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Tổng quan 5 khu vực KV1–KV5 ({statusLabel}). Bấm vào từng thẻ khu vực để lọc nhanh.
            </p>
          </div>
          <button
            type="button"
            onClick={clearFilters}
            className="min-h-8 rounded-lg px-3 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-50"
          >
            Đặt lại bộ lọc
          </button>
        </div>

        <nav aria-label="Chọn khu vực tồn Pickup" className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-6">
          {["all", ...OPERATING_AREAS].map((area) => {
            const isAll = area === "all";
            const total = isAll ? globalAnalytics.visible : (boards.find((b) => b.area === area)?.total ?? 0);
            const isSelected = areaFilter === area;
            const pctValue = globalAnalytics.visible ? Math.round((total / globalAnalytics.visible) * 100) : 0;
            return (
              <button
                key={area}
                type="button"
                data-area={area}
                aria-pressed={isSelected}
                onClick={() => setAreaFilter(area as "all" | Area)}
                className="pickup-area-card rounded-xl border p-3.5 text-left focus-visible:outline-2 focus-visible:outline-offset-4"
              >
                <span className="pickup-area-label flex items-center justify-between gap-2 text-xs font-semibold">
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="pickup-area-dot" />
                    {isAll ? "Tất cả khu vực" : area}
                  </span>
                  <span aria-hidden="true" className="pickup-area-indicator font-bold">
                    {isSelected ? "✓" : "↗"}
                  </span>
                </span>
                <span className="pickup-area-value mt-2.5 block text-2xl font-black tabular-nums tracking-tight">
                  {total.toLocaleString("vi-VN")}{" "}
                  <span className="text-[10px] font-normal text-slate-500">đơn</span>
                </span>
                <span className="mt-1 block text-[10px] text-slate-500">
                  {isAll ? `${areaWards.reduce((n,b) => n+b.wards.length,0)} zone có đơn` : `${pctValue}% tổng ${statusLabel}`}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="pickup-scope-summary flex flex-wrap items-center justify-between gap-2 border-t px-5 py-2.5 text-xs">
          <p>
            <span className="font-semibold">Đang xem:</span>{" "}
            {areaFilter === "all" ? "Tất cả KV1–KV5" : `Khu vực ${areaFilter}`}{" "}
            {cot !== "all" ? `· ${cot.toUpperCase()}` : ""}{" "}
            {heat === "hot" ? "· Chỉ zone đỏ" : ""}{" "}
            {query ? `· Tìm kiếm: "${query}"` : ""}
          </p>
          <p className="font-mono font-bold">
            {allWards.length} zone · {analytics.visible.toLocaleString("vi-VN")} đơn
          </p>
        </div>
      </section>}

      {section === "zones" && <>
      {/* KPI Tiles Section */}
      <section aria-label="Số liệu trong phạm vi đang hiển thị" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          label={`Tổng ${statusLabel} hiển thị`}
          value={analytics.visible}
          hint={`${allWards.length} zone còn ${statusLabel}`}
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
          label="Zone áp lực cao"
          value={analytics.hotRiders}
          hint="Từ 36 đơn tồn (cần đôn đốc)"
          accent={analytics.hotRiders ? "red" : "green"}
        />
      </section>

      {/* Collapsible Analytics Charts */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setShowCharts((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-left text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
        >
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-blue-600" />
            <span>Biểu đồ phân tích cơ cấu & rủi ro zone</span>
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
              <ChartHead title="Áp lực theo zone" caption={`Top zone còn ${statusLabel}`} />
              <div className="px-5 pb-5">
                <BarChart rows={topWards} />
              </div>
            </article>

            <article className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50 xl:col-span-12">
              <ChartHead title="Phổ rủi ro zone" caption="Hết tồn / ít / vừa / cao / đỏ" />
              <div className="px-5 pb-5">
                <RiskStrip bins={analytics.heatBins} />
              </div>
            </article>
          </div>
        ) : null}
      </section>

      </>}
      {/* Filter and Control Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <span className="min-w-[170px]">
          <Select
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value as "all" | Area)}
            aria-label="Lọc khu vực"
            className="h-9 text-xs font-semibold"
          >
            <option value="all">Cả KV1–KV5</option>
            {OPERATING_AREAS.map((area) => (
              <option key={area} value={area}>
                Khu vực {area}
              </option>
            ))}
          </Select>
        </span>

        {section === "zones" && <>        <span className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm mã zone..."
            className="h-9 pl-9 pr-8 text-xs"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
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
            { id: "all", label: "Tất cả zone" },
            { id: "hot", label: "Chỉ zone đỏ" },
          ]}
        />

        </>}

        <details className="relative text-xs text-slate-500">
          <summary className="cursor-pointer select-none rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-600 hover:bg-slate-50">
            Chú thích màu
          </summary>
          <div className="absolute right-0 z-30 mt-1 min-w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
            <HeatLegend />
          </div>
        </details>
      </div>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      {section === "riders" ? <PickupRiderInventory area={areaFilter} cot={cot} status={statusLabel} snapshotAt={snapshotAt} /> : <>
      {/* Main Area Wards Table Section */}
      {loading && !rows.length ? (
        <div className="grid grid-cols-1 gap-4">
          <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4">
          {areaWards
            .filter((board) => areaFilter === "all" || areaFilter === board.area)
            .map((board) => (
              <ZoneTable
                key={board.area}
                area={board.area}
                onOrders={setOrderScope}
                zones={board.wards}
                cot={cot}
                statusLabel={statusLabel}
                updatedAt={snapshotAt}
              />
            ))}
        </div>
      )}

      </>}
      {orderScope && <PickupOrderDialog scope={orderScope} onClose={() => setOrderScope(null)}/>}
    </div>
  );
}

type FlatWard = { ward: string; area: Area; cot1: number; cot2: number; total: number };

function mergeWards(districts: DistrictAgg[], cot: CotFilter): FlatWard[] {
  const map = new Map<string, FlatWard>();
  for (const district of districts) {
    for (const ward of district.wards) {
      const current = map.get(`${ward.area}:${ward.ward}`) ?? {
        ward: ward.ward,
        area: ward.area,
        cot1: 0,
        cot2: 0,
        total: 0,
      };
      current.cot1 += ward.cot1;
      current.cot2 += ward.cot2;
      current.total += ward.total;
      map.set(`${ward.area}:${ward.ward}`, current);
    }
  }
  return [...map.values()].sort((a, b) => visibleTotal(b, cot) - visibleTotal(a, cot) || a.ward.localeCompare(b.ward, "vi"));
}

function ZoneTable({ area, zones, cot, statusLabel, updatedAt, onOrders }: { area:Area; zones:FlatWard[]; cot:CotFilter; statusLabel:string; updatedAt:string|null; onOrders:(scope:PickupOrderScope)=>void }) {
  const openOrders = (zone:string, selectedCot:CotFilter=cot) => onOrders({area, zone, cot:selectedCot, status:statusLabel, title:zone});
  const total=zones.reduce((n,z)=>n+visibleTotal(z,cot),0);
  return <article data-area={area} className="pickup-scope overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-[var(--area-tint)] px-5 py-4"><div><h2 className="flex items-center gap-2 text-sm font-bold"><span className="pickup-area-dot"/>Khu vực {area}</h2><p className="mt-1 text-xs text-slate-500">{zones.length} zone · Bấm zone hoặc số tồn để xem mã đơn · {formatDateTime(updatedAt)}</p></div><strong className="font-mono text-sm">{total.toLocaleString("vi-VN")} đơn</strong></header>
    <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-500"><tr><th className="px-5 py-3">Mã zone · {statusLabel}</th><th className="px-4 py-3 text-right">COT 1</th><th className="px-4 py-3 text-right">COT 2</th><th className="px-5 py-3 text-right">Tồn đang xem</th></tr></thead><tbody>{zones.map(z=><tr key={z.ward} className="border-t border-slate-100 hover:bg-slate-50"><td className="px-5 py-3 font-semibold"><button onClick={()=>openOrders(z.ward)} className="text-left hover:text-blue-700 hover:underline" title="Xem mã đơn trong zone">{z.ward}</button></td><td className="px-4 py-3 text-right font-mono text-blue-700"><button disabled={!z.cot1} onClick={()=>openOrders(z.ward,"cot1")} className="underline decoration-dotted underline-offset-4 disabled:no-underline" aria-label={`Xem ${z.cot1} mã đơn COT 1 của ${z.ward}`}>{z.cot1.toLocaleString("vi-VN")}</button></td><td className="px-4 py-3 text-right font-mono text-emerald-700"><button disabled={!z.cot2} onClick={()=>openOrders(z.ward,"cot2")} className="underline decoration-dotted underline-offset-4 disabled:no-underline" aria-label={`Xem ${z.cot2} mã đơn COT 2 của ${z.ward}`}>{z.cot2.toLocaleString("vi-VN")}</button></td><td className="px-5 py-3 text-right"><button onClick={()=>openOrders(z.ward)} title="Xem mã đơn" className={cn("rounded-md px-2.5 py-1 font-mono font-bold underline decoration-dotted underline-offset-4 hover:ring-2 hover:ring-blue-300",heatClass(visibleTotal(z,cot)))}>{visibleTotal(z,cot).toLocaleString("vi-VN")}</button></td></tr>)}{!zones.length&&<tr><td colSpan={4} className="p-8 text-center text-slate-400">Không có zone phù hợp.</td></tr>}</tbody></table></div>
  </article>;
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
    <article className="pickup-stat rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-accent={accent}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
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
