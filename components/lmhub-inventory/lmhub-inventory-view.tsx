/* LMHub Inventory · ops dashboard with stock charts */
"use client";
import { useRememberedState } from "@/components/layout/filter-memory";

import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { Select } from "@/components/ui/select";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, MapPin, PackageCheck, RefreshCcw, Search, Truck, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarChart, ChartHead, RiskStrip } from "@/components/lmhub-inventory/lmhub-inventory-charts";
import { HeatLegend, Seg } from "@/components/lmhub-inventory/lmhub-inventory-boards";
import { DeliveryInventoryBoard } from "@/components/lmhub-inventory/delivery-inventory-board";
import { DeliveryBacklogReport } from "@/components/lmhub-inventory/delivery-backlog-report";
import "./delivery-inventory.css";
import {
  COLUMNS,
  PAGE_ROWS,
  PAGE_SIZE,
  RELOAD_DEBOUNCE_MS,
  UNKNOWN_DISTRICT,
  UNKNOWN_WARD,
  buildAnalytics,
  buildDeliveryDistrictBoards,
  cotBucket,
  deliveryInventoryRows,
  deliveryDistrictLabel,
  districtKey,
  focusKey,
  scopeDeliveryBoards,
  filterBoard,
  formatDateTime,
  formatRelative,
  normalizeRow,
  toTime,
  visibleTotal,
  type CotFilter,
  type HeatFilter,
  type InventoryFocus,
  type InventoryRow,
} from "@/components/lmhub-inventory/lmhub-inventory-model";

export function LmhubInventoryView({ canQueue = false }: { canQueue?: boolean }) {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cot, setCot] = useRememberedState<CotFilter>("lmhub-inventory-view:cot", "all");
  const [heat, setHeat] = useState<HeatFilter>("all");
  const [areaFilter, setAreaFilter] = useRememberedState("lmhub-inventory-view:areaFilter", "all");
  const [districtFilter, setDistrictFilter] = useRememberedState("lmhub-inventory-view:districtFilter", "all");
  const [wardFilter, setWardFilter] = useRememberedState("lmhub-inventory-view:wardFilter", "all");
  const [selected, setSelected] = useState<InventoryFocus | null>(null);
  const [page, setPage] = useState(1);
  const [queueing, setQueueing] = useState(false);
  const [waitingSnapshot, setWaitingSnapshot] = useState(false);
  const [queueNote, setQueueNote] = useState<string | null>(null);
  const [queueMeta, setQueueMeta] = useState<{ pending: number; running: number; lastStatus: string; lastMessage: string } | null>(null);
  useReportInitialDataLoading("lmhub-inventory", loading);

  const requestRef = useRef(0);
  const load = useCallback(async (background = false) => {
    const requestId = ++requestRef.current;
    const supabase = createClient();
    if (!background) setLoading(true);
    const latestHead = () => supabase.from("lmhub_inventory_rows").select("snapshot_id,snapshot_at")
      .in("area", OPERATING_AREAS).order("snapshot_at", { ascending: false }).limit(1).maybeSingle();
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const latest = await latestHead();
        if (requestId !== requestRef.current) return;
        if (latest.error) throw new Error(latest.error.message);
        const snapshotId = latest.data?.snapshot_id;
        const collected: InventoryRow[] = [];
        let nextSnapshotAt = latest.data?.snapshot_at ?? null;
        if (snapshotId) {
          for (let from = 0; ; from += PAGE_ROWS) {
            if (from > 100000) throw new Error("Tồn Delivery vượt giới hạn tải; chưa thay thế bảng hiện tại.");
            const result = await supabase.from("lmhub_inventory_rows").select(COLUMNS).in("area", OPERATING_AREAS)
              .eq("snapshot_id", snapshotId).order("shipment_id", { ascending: true }).range(from, from + PAGE_ROWS - 1);
            if (requestId !== requestRef.current) return;
            if (result.error) throw new Error(result.error.message);
            collected.push(...((result.data ?? []) as InventoryRow[]).map(normalizeRow));
            if ((result.data ?? []).length < PAGE_ROWS) break;
          }
        } else {
          const completed = await supabase.from("lmhub_fetch_jobs").select("finished_at").eq("status", "DONE")
            .in("params->>kind", ["delivery", "ton_delivery", "all", "both"])
            .order("finished_at", { ascending: false }).limit(1).maybeSingle();
          if (completed.error) throw new Error(completed.error.message);
          nextSnapshotAt = completed.data?.finished_at ?? null;
        }
        const current = await latestHead();
        if (requestId !== requestRef.current) return;
        if (current.error) throw new Error(current.error.message);
        // A publish can replace rows between pages; never display a partial old snapshot.
        if (current.data?.snapshot_id !== snapshotId || current.data?.snapshot_at !== latest.data?.snapshot_at) continue;
        setRows(deliveryInventoryRows(collected));
        setSnapshotAt(nextSnapshotAt);
        setError(null);
        return;
      }
      throw new Error("Dữ liệu Delivery vừa thay đổi khi tải. Hệ thống sẽ tự thử lại.");
    } catch (err) {
      if (requestId === requestRef.current) setError(err instanceof Error ? err.message : "Không tải được tồn Delivery.");
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, []);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleLoad = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void load(true), RELOAD_DEBOUNCE_MS);
  }, [load]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  // Initial async data load also sets the loading indicator before the request.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  useSupabaseRealtime({ table: "lmhub_inventory_rows", onChange: scheduleLoad, debounceMs: 800 });

  const refreshQueueStatus = useCallback(async () => {
    const response = await fetch("/api/lmhub-inventory/refresh", { cache: "no-store" });
    const payload = await response.json().catch(() => null) as { success?: boolean; pending?: number; running?: number; lastStatus?: string; lastMessage?: string } | null;
    if (!payload?.success) return payload;
    setQueueMeta({ pending: payload.pending ?? 0, running: payload.running ?? 0, lastStatus: payload.lastStatus ?? "", lastMessage: payload.lastMessage ?? "" });
    return payload;
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refreshQueueStatus().catch(() => null); }, [refreshQueueStatus]);
  useSupabaseRealtime({ table: "lmhub_fetch_jobs", onChange: (payload) => {
    void refreshQueueStatus().catch(() => null);
    if ("status" in payload.new && payload.new.status === "DONE") scheduleLoad();
  }, debounceMs: 400 });

  const baselineRef = useRef<string | null>(null);
  const orderPanelRef = useRef<HTMLElement | null>(null);
  const queueLmhub = useCallback(async () => {
    if (queueing) return;
    setQueueing(true);
    setQueueNote(null);
    baselineRef.current = snapshotAt;
    try {
      const response = await fetch("/api/lmhub-inventory/refresh", { method: "POST" });
      const payload = await response.json().catch(() => null) as { success?: boolean; queued?: boolean; message?: string; error?: string; pending?: number; running?: number; lastStatus?: string; lastMessage?: string } | null;
      if (!response.ok || !payload?.success) {
        setQueueNote(payload?.error ?? "Không đẩy được việc fetch LMHub.");
        return;
      }
      setQueueNote(payload.message ?? "Đã gửi yêu cầu.");
      if (typeof payload.pending === "number") {
        setQueueMeta({ pending: payload.pending ?? 0, running: payload.running ?? 0, lastStatus: payload.lastStatus ?? "", lastMessage: payload.lastMessage ?? "" });
      }
      if (payload.queued) setWaitingSnapshot(true);
    } catch {
      setQueueNote("Không kết nối được API fetch LMHub.");
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
        await Promise.all([load(true), refreshQueueStatus().catch(() => null)]);
      } finally {
        polling = false;
      }
      if (!stopped && waitingSnapshot && Date.now() - started > 20 * 60_000) {
        setWaitingSnapshot(false);
        setQueueNote("Worker chưa ghi snapshot Delivery mới sau 20 phút. Kiểm tra trang Nguồn dữ liệu.");
      }
    };
    const timer = setInterval(() => void tick(), waitingSnapshot ? 8000 : 15000);
    const onVisible = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [waitingSnapshot, load, refreshQueueStatus]);

  useEffect(() => {
    if (!waitingSnapshot || !snapshotAt) return;
    if (snapshotAt !== baselineRef.current) {
      setWaitingSnapshot(false);
      setQueueNote(`Đã có snapshot mới lúc ${formatDateTime(snapshotAt)}.`);
    }
  }, [waitingSnapshot, snapshotAt]);

  const allBoards = useMemo(() => buildDeliveryDistrictBoards(rows), [rows]);
  const districtBoards = useMemo(() => scopeDeliveryBoards(allBoards, areaFilter, "all", "all"), [allBoards, areaFilter]);
  const wardBoards = useMemo(() => scopeDeliveryBoards(allBoards, areaFilter, districtFilter, "all"), [allBoards, areaFilter, districtFilter]);
  const filtered = useMemo(() => filterBoard(scopeDeliveryBoards(allBoards, areaFilter, districtFilter, wardFilter), query, cot, heat), [allBoards, areaFilter, districtFilter, wardFilter, query, cot, heat]);
  const analytics = useMemo(() => buildAnalytics(filtered, [], cot), [filtered, cot]);
  const visibleWards = useMemo(() => new Set(filtered.flatMap((district) => district.wards.map(focusKey))), [filtered]);
  const scopedDistrict = districtBoards.find((item) => districtKey(item.area, item.district) === districtFilter);
  const scopedWard = wardBoards.flatMap((item) => item.wards).find((item) => focusKey(item) === wardFilter);
  const scopeLabel = [scopedWard?.area ?? scopedDistrict?.area ?? (areaFilter === "all" ? "Tất cả khu vực" : areaFilter), scopedDistrict ? deliveryDistrictLabel(scopedDistrict.district) : scopedWard ? deliveryDistrictLabel(scopedWard.district) : null, scopedWard?.ward].filter(Boolean).join(" / ");
  const changeArea = (value: string) => {
    setAreaFilter(value); setDistrictFilter("all"); setWardFilter("all"); setSelected(null); setPage(1);
  };
  const clearFilters = () => {
    changeArea("all"); setQuery(""); setCot("all"); setHeat("all");
  };
  const selectedOrders = useMemo(() => {
    if (!selected) return [];
    return rows
      .filter((row) => {
        if (row.area !== selected.area) return false;
        if ((row.district || UNKNOWN_DISTRICT) !== selected.district) return false;
        if (selected.ward && (row.ward || UNKNOWN_WARD) !== selected.ward) return false;
        if (!visibleWards.has(focusKey({ area: selected.area, district: row.district || UNKNOWN_DISTRICT, ward: row.ward || UNKNOWN_WARD }))) return false;
        if (cot !== "all" && cotBucket(row.cot_group) !== cot) return false;
        return true;
      })
      .sort((a, b) => toTime(b.received_time) - toTime(a.received_time));
  }, [rows, selected, cot, visibleWards]);

  const pageCount = Math.max(1, Math.ceil(selectedOrders.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageOrders = selectedOrders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const busy = (queueMeta?.pending ?? 0) + (queueMeta?.running ?? 0) > 0 || waitingSnapshot;

  const selectFocus = (focus: InventoryFocus) => {
    setSelected(focus);
    setPage(1);
    requestAnimationFrame(() => {
      if (window.matchMedia("(min-width: 1280px)").matches) return;
      orderPanelRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start",
      });
    });
  };

  return (
    <div className="dashboard-control delivery-inventory-page mx-auto max-w-[1680px] space-y-4" data-area={areaFilter}>
      <header className="delivery-page-header flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-blue-600">Trung tâm điều hành · Giao hàng</p>
          <h1 className="text-xl font-bold text-slate-900">Tồn Delivery</h1>
          <p className="mt-1 text-xs text-slate-500">Theo dõi tồn theo địa bàn, xác định phường cần ưu tiên xử lý.</p>
        </div>
        <div className="dashboard-command-actions">
          <div className="min-w-[150px] px-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Cập nhật gần nhất</p>
            <p className="font-mono text-xs font-semibold text-[var(--color-ink)]">{formatDateTime(snapshotAt)}</p>
          </div>
          <Button type="button" variant="secondary" className="h-7 px-2 text-[11px]" onClick={() => void load()} disabled={loading}>
            <RefreshCcw size={16} className={loading ? "animate-spin" : undefined} /><span>Làm mới</span>
          </Button>
          {canQueue ? (
            <Button type="button" className="h-7 px-2 text-[11px]" onClick={() => void queueLmhub()} disabled={queueing || waitingSnapshot}>
              <Download size={16} className={queueing || waitingSnapshot ? "animate-pulse" : undefined} />
              <span>{queueing ? "Đang gửi yêu cầu..." : waitingSnapshot ? "Đang cập nhật dữ liệu" : "Lấy dữ liệu mới"}</span>
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <StatusChip live={!busy} label={busy ? "Đang cập nhật" : "Sẵn sàng"} />
        <span className="rounded-full border border-[var(--color-rule)] bg-[var(--color-paper)] px-2.5 py-1 font-medium text-[var(--color-ink-2)]">
          {queueMeta ? `${queueMeta.pending} yêu cầu chờ · ${queueMeta.running} đang xử lý` : "Đang kiểm tra cập nhật"}
        </span>
        <span className="text-[var(--color-muted)]">{formatRelative(snapshotAt)}</span>
      </div>

      {queueNote ? (
        <div className="rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper)] px-4 py-3 text-sm text-[var(--color-ink-2)]">
          {waitingSnapshot ? <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)]" /> : null}
          {queueNote}
        </div>
      ) : null}

      <section aria-label="Phạm vi địa bàn" className="delivery-scope overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div><div className="flex items-center gap-2"><MapPin size={17} className="text-blue-600" /><h2 className="text-sm font-bold text-slate-900">Phạm vi địa bàn</h2></div><p className="mt-1 text-[11px] text-slate-500">Tổng quan các KV theo COT đang chọn. Chọn KV để thu hẹp địa bàn.</p></div>
          <button type="button" onClick={clearFilters} className="min-h-8 rounded-md px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">Đặt lại bộ lọc</button>
        </div>
        <nav aria-label="Chọn khu vực tồn Delivery" className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 xl:grid-cols-6">
          {["all", ...OPERATING_AREAS].map((area) => {
            const boards = area === "all" ? allBoards : allBoards.filter((item) => item.area === area);
            const total = boards.reduce((sum, item) => sum + visibleTotal(item.totals, cot), 0);
            return <button key={area} type="button" data-area={area} aria-pressed={areaFilter === area} onClick={() => changeArea(area)} className="delivery-area-card rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-4">
              <span className="delivery-area-label flex items-center justify-between gap-2 text-xs font-semibold"><span className="flex items-center gap-1.5"><span aria-hidden="true" className="delivery-area-dot" />{area === "all" ? "Tất cả khu vực" : area}</span><span aria-hidden="true" className="delivery-area-indicator">{areaFilter === area ? "✓" : "↗"}</span></span>
              <span className="delivery-area-value mt-2 block text-2xl font-bold tabular-nums">{total.toLocaleString("vi-VN")} <span className="text-[10px] font-normal text-slate-500">đơn</span></span>
              <span className="mt-1 block text-[10px] text-slate-500">{boards.length} địa bàn quận/huyện</span>
            </button>;
          })}
        </nav>
        <div className="grid gap-3 px-4 pb-4 md:grid-cols-3">
          <label className="space-y-1 text-xs font-semibold text-slate-600">Khu vực
            <Select aria-label="Lọc KV tồn Delivery" value={areaFilter} onChange={(event) => changeArea(event.target.value)}><option value="all">Tất cả KV1–KV5</option>{OPERATING_AREAS.map((area) => <option key={area} value={area}>{area}</option>)}</Select>
          </label>
          <label className="space-y-1 text-xs font-semibold text-slate-600">Quận / huyện
            <Select aria-label="Lọc quận huyện tồn Delivery" value={districtFilter} onChange={(event) => { setDistrictFilter(event.target.value); setWardFilter("all"); setSelected(null); setPage(1); }}>
              <option value="all">Tất cả quận / huyện</option>
              {districtBoards.map((item) => <option key={districtKey(item.area, item.district)} value={districtKey(item.area, item.district)}>{item.area} · {deliveryDistrictLabel(item.district)}</option>)}
            </Select>
          </label>
          <label className="space-y-1 text-xs font-semibold text-slate-600">Phường / xã
            <Select aria-label="Lọc phường xã tồn Delivery" value={wardFilter} onChange={(event) => { setWardFilter(event.target.value); setSelected(null); setPage(1); }}>
              <option value="all">Tất cả phường / xã</option>
              {wardBoards.flatMap((item) => item.wards).sort((a, b) => a.ward.localeCompare(b.ward, "vi")).map((item) => <option key={focusKey(item)} value={focusKey(item)}>{item.ward} · {deliveryDistrictLabel(item.district)} · {item.area}</option>)}
            </Select>
          </label>
        </div>
        <div className="delivery-scope-summary flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs">
          <p><span className="font-semibold">Đang xem:</span> {scopeLabel}</p>
          <p>{analytics.districts} địa bàn quận/huyện · {analytics.wards} phường/xã</p>
        </div>
      </section>

      <section aria-label="Số liệu trong phạm vi đang hiển thị" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Tổng tồn đang hiển thị" value={analytics.visible} hint="Theo địa bàn và bộ lọc bên dưới" accent="ink" />
        <StatTile label="COT 1" value={analytics.cot1} hint={cot === "cot2" ? "Đang ẩn bởi bộ lọc COT" : "Đơn COT 1 trong kết quả"} accent="blue" />
        <StatTile label="COT 2" value={analytics.cot2} hint={cot === "cot1" ? "Đang ẩn bởi bộ lọc COT" : "Đơn COT 2 trong kết quả"} accent="teal" />
        <StatTile label="Phường cần ưu tiên" value={analytics.hotWards} hint="Từ 36 đơn theo COT đang chọn" accent={analytics.hotWards ? "red" : "green"} />
      </section>
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" size={16} />
          <Input value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); setPage(1); }} placeholder="Tìm quận hoặc phường..." aria-label="Tìm quận hoặc phường tồn Delivery" className="h-8 pl-9 text-xs" />
        </span>
        <Seg compact value={cot} onChange={(value) => { setCot(value); setSelected(null); setPage(1); }} options={[{ id: "all", label: "Cả COT" }, { id: "cot1", label: "COT 1" }, { id: "cot2", label: "COT 2" }]} />
        <Seg compact value={heat} onChange={(value) => { setHeat(value); setSelected(null); setPage(1); }} options={[{ id: "all", label: "Tất cả phường" }, { id: "hot", label: "Chỉ phường đỏ" }]} />
        <details className="relative text-[11px] text-slate-500"><summary className="cursor-pointer py-1">Chú thích màu</summary><div className="absolute right-0 z-20 mt-1 min-w-60 rounded-lg border border-slate-200 bg-white p-2 shadow-sm"><HeatLegend /></div></details>
      </div>

      <DeliveryBacklogReport districts={filtered} cot={cot} snapshotAt={snapshotAt} disabled={loading || !!error}
        scope={[scopeLabel, cot === "all" ? "COT 1 + COT 2" : cot === "cot1" ? "COT 1" : "COT 2", query.trim() ? `Tìm: ${query.trim()}` : "", heat === "hot" ? "Chỉ phường đỏ" : ""].filter(Boolean).join(" · ")} />
      {error ? <div role="alert" className="dashboard-error">{error}</div> : null}
      {loading && !rows.length ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="h-[36rem] animate-pulse rounded-2xl bg-[var(--color-paper-3)] xl:col-span-6" />
          <div className="h-[36rem] animate-pulse rounded-2xl bg-[var(--color-paper-3)] xl:col-span-6" />
        </div>
      ) : (
        <div className="delivery-command-grid">
          <div className="min-w-0">
            <DeliveryInventoryBoard districts={filtered} cot={cot} selected={selected} onSelect={selectFocus} forceExpanded={!!query || heat === "hot"} />
          </div>
          <aside ref={orderPanelRef} aria-label="Chi tiết đơn theo địa bàn" className="delivery-command-detail min-w-0 scroll-mt-4">
            <OrderPanel
              selected={selected}
              orders={pageOrders}
              total={selectedOrders.length}
              cot1={selectedOrders.filter((row) => cotBucket(row.cot_group) === "cot1").length}
              page={safePage}
              pageCount={pageCount}
              onPrev={() => setPage((value) => Math.max(1, value - 1))}
              onNext={() => setPage((value) => Math.min(pageCount, value + 1))}
              onClose={() => setSelected(null)}
            />
          </aside>
        </div>
      )}
      <details className="rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-slate-700">Biểu đồ phân tích tồn</summary>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <article><ChartHead title="Tồn theo quận" caption="Theo phạm vi và bộ lọc đang chọn" /><div className="px-5 pb-5"><BarChart rows={analytics.topDistricts.map((district) => ({ ...district, label: `${district.area} · ${deliveryDistrictLabel(district.label)}` }))} /></div></article>
          <article><ChartHead title="Mức tồn theo phường" caption="Phân bố mức độ ưu tiên xử lý" /><div className="px-5 pb-5"><RiskStrip bins={analytics.heatBins} /></div></article>
        </div>
      </details>
    </div>
  );
}

function OrderPanel({
  selected,
  orders,
  total,
  cot1,
  page,
  pageCount,
  onPrev,
  onNext,
  onClose,
}: {
  selected: InventoryFocus | null;
  orders: InventoryRow[];
  total: number;
  cot1: number;
  page: number;
  pageCount: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  if (!selected) {
    return (
      <section className="flex min-h-72 items-center justify-center rounded-2xl border border-dashed border-[var(--color-rule)] bg-[var(--color-paper)] px-6 py-10 text-center">
        <div>
          <MapPin size={28} className="mx-auto mb-4 text-[var(--color-muted)]" aria-hidden="true" />
          <h2 className="text-sm font-bold text-[var(--color-ink)]">Chi tiết đơn theo địa bàn</h2>
          <p className="mt-2 text-xs leading-5 text-[var(--color-muted)]">Chọn tên phường hoặc số tổng trong bảng quận để xem tồn COT và danh sách vận đơn tại đây.</p>
        </div>
      </section>
    );
  }

  return (
    <section data-area={selected.area} className="delivery-order-panel overflow-hidden rounded-2xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-rule)] px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">{selected.area} · {deliveryDistrictLabel(selected.district)}</p>
          <h2 className="text-base font-bold text-[var(--color-ink)]">{selected.ward ?? "Tất cả phường trong quận"}</h2>
          <p className="text-sm text-[var(--color-muted)]">{total.toLocaleString("vi-VN")} đơn khớp lọc</p>
        </div>
        <Button type="button" variant="secondary" className="h-8 px-2 text-xs" onClick={onClose}><X size={16} /> Đóng</Button>
      </div>
      <div className="border-b border-[var(--color-rule)] px-4 py-4">
        <p className="text-[11px] text-[var(--color-muted)]">Tồn trong địa bàn đang chọn</p>
        <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-[var(--color-ink)]">{total.toLocaleString("vi-VN")} <span className="text-xs font-normal text-[var(--color-muted)]">đơn</span></p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-blue-50 px-3 py-2 text-blue-800">COT 1 <strong className="float-right tabular-nums">{cot1.toLocaleString("vi-VN")}</strong></div>
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">COT 2 <strong className="float-right tabular-nums">{(total - cot1).toLocaleString("vi-VN")}</strong></div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-3 text-[11px] text-[var(--color-muted)]">
        <h3 className="font-semibold text-[var(--color-ink)]">Danh sách vận đơn</h3>
        <span>Mới về hub trước</span>
      </div>
      <div className="delivery-order-list max-h-[min(55vh,36rem)] overflow-y-auto px-4">
        {!orders.length ? <p className="py-8 text-center text-xs text-[var(--color-muted)]">Không có đơn khớp bộ lọc trong dữ liệu cập nhật gần nhất.</p> : (
          <ul className="divide-y divide-[var(--color-rule)]">
            {orders.map((row) => (
              <li key={row.shipment_id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 break-all font-mono text-xs font-semibold text-[var(--color-ink)]">{row.shipment_id}</p>
                  <span className={"shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold " + (cotBucket(row.cot_group) === "cot1" ? "bg-blue-50 text-blue-800" : "bg-emerald-50 text-emerald-800")}>{row.cot_group || "—"}</span>
                </div>
                <p className="mt-1 break-words text-xs text-[var(--color-ink-2)]">{row.ward || "Chưa xác định phường"}</p>
                <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11px]">
                  <dt className="text-[var(--color-muted)]">Zone · Loại</dt><dd className="break-words text-right text-[var(--color-ink-2)]">{row.zone_id || "—"} · {row.order_type || "—"}</dd>
                  <dt className="text-[var(--color-muted)]">Trạng thái</dt><dd className="break-words text-right text-[var(--color-ink-2)]">{row.status || "—"}</dd>
                  <dt className="text-[var(--color-muted)]">Về hub</dt><dd className="text-right tabular-nums text-[var(--color-ink-2)]">{formatDateTime(row.received_time)}</dd>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-rule)] px-4 py-3 text-xs">
        <span className="text-[var(--color-muted)]">Trang {page}/{pageCount}</span>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="h-8 px-2 text-xs" disabled={page <= 1} onClick={onPrev}><ChevronLeft size={16} /> Trước</Button>
          <Button type="button" variant="secondary" className="h-8 px-2 text-xs" disabled={page >= pageCount} onClick={onNext}>Sau <ChevronRight size={16} /></Button>
        </div>
      </div>
    </section>
  );
}

function StatTile({ label, value, hint, accent }: { label: string; value: number; hint: string; accent: "ink" | "blue" | "teal" | "red" | "green" }) {
  const tone = { ink: "text-[var(--color-ink)]", blue: "text-[var(--color-accent)]", teal: "text-[var(--color-success)]", red: "text-[var(--color-error)]", green: "text-[var(--color-success)]" }[accent];
  return (
    <article data-accent={accent} className="delivery-stat rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper)] px-4 py-3">
      <div className="flex items-center justify-between gap-1">
        <p className="text-[10px] font-semibold text-[var(--color-muted)]">{label}</p>
        {accent === "blue" ? <Truck size={15} className="text-[var(--color-accent)]" /> : accent === "red" ? <MapPin size={15} className="text-[var(--color-error)]" /> : <PackageCheck size={15} className="text-[var(--color-muted)]" />}
      </div>
      <p className={"font-mono text-xl font-bold leading-6 tracking-tight " + tone}>{value.toLocaleString("vi-VN")}</p>
      <p className="text-[10px] leading-3 text-[var(--color-muted)]">{hint}</p>
    </article>
  );
}

function StatusChip({ live, label }: { live: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-rule)] bg-[var(--color-paper)] px-2.5 py-1 font-semibold text-[var(--color-ink)]">
      <span className={"h-1.5 w-1.5 rounded-full " + (live ? "bg-[var(--color-success)]" : "animate-pulse bg-[var(--color-warning)]")} />
      {label}
    </span>
  );
}
