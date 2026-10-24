"use client";

import { OPERATING_AREAS, isOperatingArea } from "@/lib/locations/operating-areas";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  MapPin,
  PackageOpen,
  RefreshCcw,
  Search,
  Truck,
  X,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
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
  riderCotLabel,
  visibleBoardTotal,
  visibleTotal,
  type Area,
  type CotFilter,
  type DistrictAgg,
  type HeatFilter,
  type PickupStatusKey,
  type PickupStatusRow,
} from "@/components/lmhub-inventory/pickup-inventory-model";
import { fetchPickupWardExact, type WardExact } from "@/components/lmhub-inventory/use-pickup-ward-riders";
import { cn } from "@/utils/cn";
import "./pickup-inventory.css";

export function PickupInventoryView({ canQueue = false }: { canQueue?: boolean }) {
  const [status, setStatus] = useState<PickupStatusKey>("assigned");
  const [rows, setRows] = useState<PickupStatusRow[]>([]);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cot, setCot] = useState<CotFilter>("all");
  const [heat, setHeat] = useState<HeatFilter>("all");
  const [modal, setModal] = useState<{ area: string; ward: string } | null>(null);
  const [areaFilter, setAreaFilter] = useState<"all" | Area>("all");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [showCharts, setShowCharts] = useState(false);

  type ExactEntry = { loading: boolean; data?: WardExact; error?: string };
  const [exactCache, setExactCache] = useState<Record<string, ExactEntry>>({});
  const [boardNotice, setBoardNotice] = useState<string | null>(null);
  const [queueing, setQueueing] = useState(false);
  const [waitingSnapshot, setWaitingSnapshot] = useState(false);
  const [queueNote, setQueueNote] = useState<string | null>(null);
  const [queueMeta, setQueueMeta] = useState<{ pending: number; running: number; lastStatus: string; lastMessage: string; lastKind?: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baselineRef = useRef<string | null>(null);

  const load = useCallback(async (nextStatus = status) => {
    const supabase = createClient();
    const label = PICKUP_STATUS_LABEL[nextStatus];
    const toRow = (area: string, ward: string, cot: string, orders: number): PickupStatusRow | null => {
      const a = area.trim().toUpperCase();
      if (!isOperatingArea(a)) return null;
      if (!Number.isFinite(orders) || orders <= 0) return null;
      return {
        area: a,
        district: "—",
        ward: ward.trim() || "Chưa có phường",
        zone: "",
        cot,
        orders,
        snapshot_id: null,
        snapshot_at: null,
        updated_at: null,
      };
    };

    // 0) API cung origin
    try {
      const params = new URLSearchParams({ view: "board", p_status: label });
      const res = await fetch(`/api/pickup-inventory?${params.toString()}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as {
        success?: boolean;
        rows?: Array<{ area?: string | null; ward?: string | null; cot?: string | null; orders?: number | string | null }>;
        error?: string;
      } | null;
      if (res.ok && payload?.success) {
        const collected: PickupStatusRow[] = [];
        for (const row of payload.rows ?? []) {
          const built = toRow(String(row.area ?? ""), String(row.ward ?? ""), String(row.cot ?? "COT1"), Number(row.orders ?? 0));
          if (built) collected.push(built);
        }
        collected.sort((a, b) => (b.orders ?? 0) - (a.orders ?? 0));
        setRows(collected);
        setSnapshotAt(new Date().toISOString());
        setBoardNotice(null);
        return;
      }
      throw new Error(payload?.error ?? `API ${res.status}`);
    } catch (err) {
      console.warn("[pickup-board] API loi, fallback Supabase truc tiep:", err);
    }

    // 1) RPC
    try {
      const rpc = await supabase.rpc("pickup_ward_board_kv1_kv5", { p_status: label });
      if (!rpc.error) {
        const collected: PickupStatusRow[] = [];
        for (const row of (rpc.data ?? []) as Array<{
          area?: string | null;
          ward?: string | null;
          cot?: string | null;
          orders?: number | string | null;
        }>) {
          const built = toRow(String(row.area ?? ""), String(row.ward ?? ""), String(row.cot ?? "COT1"), Number(row.orders ?? 0));
          if (built) collected.push(built);
        }
        collected.sort((a, b) => (b.orders ?? 0) - (a.orders ?? 0));
        setRows(collected);
        setSnapshotAt(new Date().toISOString());
        setBoardNotice(null);
        return;
      }
      console.warn("[pickup-board] RPC pickup_ward_board chua co, fallback quet raw:", rpc.error.message);
    } catch (err) {
      console.warn("[pickup-board] RPC loi, fallback quet raw:", err);
    }

    // 2) Fallback raw scan
    setBoardNotice("API/RPC không dùng được — đang đếm trực tiếp từ raw (chậm hơn).");
    const seen = new Set<string>();
    const agg = new Map<string, number>();
    const PAGE = 1000;
    const CONC = 8;
    type RawBoardRow = { shipment_id?: string | null; ward?: string | null; area?: string | null; cot_group?: string | null };
    const eatChunk = (chunk: RawBoardRow[]) => {
      for (const row of chunk) {
        const order = String(row.shipment_id ?? "").trim();
        if (!order || seen.has(order)) continue;
        seen.add(order);
        const key = `${String(row.area ?? "").trim().toUpperCase()}||${String(row.ward ?? "").trim() || "Chưa có phường"}||${String(row.cot_group ?? "COT1").trim() || "COT1"}`;
        agg.set(key, (agg.get(key) ?? 0) + 1);
      }
    };
    let from = 0;
    for (;;) {
      const batch = await Promise.all(
        Array.from({ length: CONC }, (_, i) => {
          const f = from + i * PAGE;
          return supabase
            .from("pickup_48h_no_api2")
            .select("shipment_id,ward,area,cot_group")
            .in("area", OPERATING_AREAS)
            .eq("status", label)
            .in("area", ["KV1", "KV2", "KV3", "KV4", "KV5"])
            .order("shipment_id", { ascending: true })
            .range(f, f + PAGE - 1);
        }),
      );
      let finished = false;
      for (const result of batch) {
        if (result.error) throw result.error;
        const chunk = (result.data ?? []) as RawBoardRow[];
        eatChunk(chunk);
        if (chunk.length < PAGE) {
          finished = true;
          break;
        }
      }
      if (finished) break;
      from += PAGE * CONC;
      if (from > 60000) break;
    }
    const collected: PickupStatusRow[] = [];
    for (const [key, orders] of agg) {
      const [area, ward, cot] = key.split("||");
      const built = toRow(area, ward, cot, orders);
      if (built) collected.push(built);
    }
    collected.sort((a, b) => (b.orders ?? 0) - (a.orders ?? 0));
    setRows(collected);
    setSnapshotAt(new Date().toISOString());
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
  const allDistricts = useMemo(() => filtered.flatMap((board) => board.districts), [filtered]);
  const analytics = useMemo(() => pickupAnalytics(allDistricts, [], cot), [allDistricts, cot]);
  const boards = useMemo(() => filtered.map((board) => ({ ...board, total: visibleBoardTotal(board.districts, cot) })), [filtered, cot]);
  const statusLabel = PICKUP_STATUS_LABEL[status];
  const areaWards = useMemo(() => filtered.map((board) => ({ area: board.area, wards: mergeWards(board.districts, cot) })), [filtered, cot]);
  const allWards = useMemo(() => areaWards.flatMap((board) => board.wards), [areaWards]);
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

  const changeStatus = (next: PickupStatusKey) => {
    setStatus(next);
    setModal(null);
    setExpanded([]);
    setExactCache({});
  };

  const toggleWard = useCallback((ward: FlatWard) => {
    const key = `${ward.area}||${ward.ward}`;
    setExpanded((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));
  }, []);

  const allOpen = allWards.length > 0 && allWards.every((w) => expanded.includes(`${w.area}||${w.ward}`));
  const toggleAllRiders = useCallback(() => {
    const all = allWards.map((w) => `${w.area}||${w.ward}`);
    setExpanded((current) => (all.length > 0 && all.every((k) => current.includes(k)) ? [] : all));
  }, [allWards]);

  const inflightRef = useRef<Set<string>>(new Set());
  const exactCacheRef = useRef(exactCache);
  exactCacheRef.current = exactCache;
  const [exactRetryTick, setExactRetryTick] = useState(0);

  useEffect(() => {
    if (!expanded.length) return;
    const inflight = inflightRef.current;
    const missing = expanded.filter((ek) => {
      const key = `${status}||${ek}`;
      return !exactCacheRef.current[key] && !inflightRef.current.has(key);
    });
    if (!missing.length) return;
    let cancelled = false;
    const controllers: AbortController[] = [];
    missing.forEach((ek, idx) => {
      const separator = ek.indexOf("||");
      const area = ek.slice(0, separator);
      const ward = ek.slice(separator + 2);
      const key = `${status}||${ek}`;
      inflightRef.current.add(key);
      const controller = new AbortController();
      controllers.push(controller);
      const timerId = setTimeout(() => controller.abort(), 10000 + idx * 500);
      setExactCache((prev) => (prev[key] ? prev : { ...prev, [key]: { loading: true } }));
      fetchPickupWardExact(area, ward, PICKUP_STATUS_LABEL[status], controller.signal)
        .then((data) => {
          if (cancelled) return;
          inflightRef.current.delete(key);
          setExactCache((prev) => ({ ...prev, [key]: { loading: false, data } }));
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          inflightRef.current.delete(key);
          const isAbort = err instanceof Error && (err.name === "AbortError" || /abort/i.test(err.message));
          setExactCache((prev) => ({
            ...prev,
            [key]: {
              loading: false,
              error: isAbort ? "Query rider quá 10s. Bấm Thử lại." : err instanceof Error ? err.message : "Không tải được rider.",
            },
          }));
        })
        .finally(() => clearTimeout(timerId));
    });
    return () => {
      cancelled = true;
      controllers.forEach((c) => c.abort());
      missing.forEach((ek) => inflight.delete(`${status}||${ek}`));
    };
  }, [expanded, status, exactRetryTick]);

  const retryExact = useCallback((key: string) => {
    setExactCache((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    inflightRef.current.delete(key);
    setExactRetryTick((t) => t + 1);
  }, []);

  const exportAreaSummaryImage = useCallback(async () => {
    const activeCot: "COT1" | "COT2" = cot === "cot1" ? "COT1" : cot === "cot2" ? "COT2" : new Date().getHours() < 12 ? "COT1" : "COT2";
    const isActive = (cotVal: string) => (activeCot === "COT2" ? String(cotVal ?? "").toUpperCase() === "COT2" : String(cotVal ?? "").toUpperCase() !== "COT2");
    const wardList: { area: string; ward: string }[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const area = String(r.area ?? "").toUpperCase();
      const ward = String(r.ward ?? "");
      if (!isOperatingArea(area) || !ward) continue;
      const k = `${area}||${ward}`;
      if (seen.has(k)) continue;
      seen.add(k);
      wardList.push({ area, ward });
    }
    alert(`Đang tải rider ${activeCot} cho ${wardList.length} phường, vui lòng chờ...`);
    const results = await Promise.allSettled(
      wardList.map(async ({ area, ward }) => {
        const data = await fetchPickupWardExact(area, ward, PICKUP_STATUS_LABEL[status]);
        return { area, ward, data };
      }),
    );
    type RiderRow = { rider: string; ward: string; area: string; count: number; shared: number };
    const byArea = new Map<string, RiderRow[]>();
    for (const res of results) {
      if (res.status !== "fulfilled") continue;
      const { area, ward, data } = res.value;
      const perRider = new Map<string, { count: number; shared: number }>();
      for (const o of data.orders) {
        if (!isActive(o.cot)) continue;
        const isShared = o.riders.length > 1;
        for (const name of o.riders) {
          const cur = perRider.get(name) ?? { count: 0, shared: 0 };
          cur.count += 1;
          if (isShared) cur.shared += 1;
          perRider.set(name, cur);
        }
      }
      const hasActive = new Set(perRider.keys());
      for (const o of data.orders) {
        if (isActive(o.cot) || o.riders.length !== 1) continue;
        const name = o.riders[0];
        if (hasActive.has(name) || perRider.has(name)) continue;
        perRider.set(name, { count: 1, shared: 0 });
      }
      for (const [rider, v] of perRider) {
        const arr = byArea.get(area) ?? [];
        arr.push({ rider, ward, area, count: v.count, shared: v.shared });
        byArea.set(area, arr);
      }
    }
    const CHUNK = 30;
    const timeStr = new Date().toLocaleString("vi-VN");
    let imgIndex = 0;
    for (const area of ["KV1", "KV2", "KV3", "KV4", "KV5"]) {
      const list = (byArea.get(area) ?? []).sort((a, b) => b.count - a.count || a.rider.localeCompare(b.rider, "vi"));
      if (!list.length) continue;
      for (let start = 0; start < list.length; start += CHUNK) {
        const chunk = list.slice(start, start + CHUNK);
        const page = Math.floor(start / CHUNK) + 1;
        const pages = Math.ceil(list.length / CHUNK);
        const title = `RIDER CHƯA CẬP NHẬT ${activeCot} - ${area}${pages > 1 ? ` (${page}/${pages})` : ""}`;
        const cols = ["STT", "RIDER", "PHƯỜNG", "ĐƠN"];
        const W = 900;
        const headerH = 64;
        const rowH = 34;
        const H = headerH + 40 + (chunk.length + 1) * rowH + 30;
        const canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 20px Arial";
        ctx.fillText(title, 24, 34);
        ctx.fillStyle = "#64748b";
        ctx.font = "13px Arial";
        ctx.fillText(`${statusLabel} - ${timeStr} - ${area}: ${list.length} rider / ${list.reduce((s, r) => s + r.count, 0)} đơn`, 24, 56);
        const colX = [24, 80, 380, 740];
        let y = headerH + 40;
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(24, y - 26, W - 48, 30);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 13px Arial";
        cols.forEach((c, i) => ctx.fillText(c, colX[i] + 8, y - 6));
        y += 8;
        ctx.font = "13px Arial";
        chunk.forEach((r, idx) => {
          ctx.fillStyle = (start + idx) % 2 ? "#f8fafc" : "#ffffff";
          ctx.fillRect(24, y - 22, W - 48, rowH);
          ctx.strokeStyle = "#e2e8f0";
          ctx.strokeRect(24, y - 22, W - 48, rowH);
          ctx.fillStyle = "#0f172a";
          ctx.fillText(String(start + idx + 1), colX[0] + 8, y);
          ctx.fillText(r.rider.slice(0, 34), colX[1] + 8, y);
          ctx.fillText(r.ward.slice(0, 36), colX[2] + 8, y);
          ctx.font = "bold 13px Arial";
          ctx.fillStyle = r.shared > 0 ? "#b45309" : "#0f172a";
          ctx.fillText(r.shared > 0 ? `${r.count} (${r.shared} chung)` : String(r.count), colX[3] + 8, y);
          ctx.font = "13px Arial";
          ctx.fillStyle = "#0f172a";
          y += rowH;
        });
        const url = canvas.toDataURL("image/png");
        imgIndex += 1;
        const a = document.createElement("a");
        a.href = url;
        a.download = `rider-chua-cap-nhat-${activeCot}-${area}${pages > 1 ? `-p${page}` : ""}.png`;
        a.click();
        try {
          const blob = await (await fetch(url)).blob();
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        } catch {
          // ignore
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    if (!imgIndex) alert("Không có rider nào để chụp.");
    else alert(`Đã chụp ${imgIndex} ảnh (KV1–KV5, mỗi ảnh tối đa ${CHUNK} rider) — ảnh đã tải về máy, ảnh cuối đã copy sẵn vào clipboard (Ctrl+V vào Seatalk).`);
  }, [rows, cot, status, statusLabel]);

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
            Tổng phường = đơn distinct còn status {statusLabel}. Bấm vào phường để kiểm tra rider và đơn chung.
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

          <Button
            type="button"
            variant="secondary"
            onClick={() => void exportAreaSummaryImage()}
            className="rounded-xl text-xs font-bold shadow-sm"
          >
            <Download size={15} />
            <span>Chụp ảnh tổng rider</span>
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

      {/* Prominent Status Selector Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "assigned", label: "Assigned (Đã gán)", desc: "Rider đang giữ đơn" },
              { id: "onhold", label: "Pickup Onhold (Tạm giữ)", desc: "Đơn tạm giữ xử lý lại" },
              { id: "created", label: "Created (Chưa gán)", desc: "Đơn mới tạo chưa có rider" },
            ] as const
          ).map((item) => {
            const active = status === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => changeStatus(item.id)}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all",
                  active
                    ? "bg-[var(--area-deep)] text-white shadow-md shadow-slate-900/10"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 pr-2">
          {boardNotice ? (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              {boardNotice}
            </span>
          ) : null}
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
      <section aria-label="Phạm vi địa bàn" className="pickup-scope overflow-hidden rounded-2xl border border-slate-200 bg-white">
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
            const total = isAll ? analytics.visible : (boards.find((b) => b.area === area)?.total ?? 0);
            const isSelected = areaFilter === area;
            const pctValue = analytics.visible ? Math.round((total / analytics.visible) * 100) : 0;
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
                  {isAll ? `${allWards.length} phường có đơn` : `${pctValue}% tổng ${statusLabel}`}
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
            {heat === "hot" ? "· Chỉ phường đỏ" : ""}{" "}
            {query ? `· Tìm kiếm: "${query}"` : ""}
          </p>
          <p className="font-mono font-bold">
            {allWards.length} phường/xã · {analytics.visible.toLocaleString("vi-VN")} đơn
          </p>
        </div>
      </section>

      {/* KPI Tiles Section */}
      <section aria-label="Số liệu trong phạm vi đang hiển thị" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          label={`Tổng ${statusLabel} hiển thị`}
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
          label="Phường áp lực cao"
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
            <span>Biểu đồ phân tích cơ cấu & rủi ro phường</span>
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

        <span className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm tên phường..."
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

        <Seg
          value={cot}
          onChange={setCot}
          options={[
            { id: "all", label: "Cả COT" },
            { id: "cot1", label: "COT 1" },
            { id: "cot2", label: "COT 2" },
          ]}
        />

        <Seg
          value={heat}
          onChange={setHeat}
          options={[
            { id: "all", label: "Tất cả phường" },
            { id: "hot", label: "Chỉ phường đỏ" },
          ]}
        />

        <Button
          type="button"
          variant="secondary"
          onClick={toggleAllRiders}
          className="h-9 rounded-xl text-xs font-bold"
        >
          <ChevronDown size={15} className={`transition-transform duration-200 ${allOpen ? "rotate-180" : ""}`} />
          <span>{allOpen ? `Đóng full rider (${expanded.length})` : "Mở full rider"}</span>
        </Button>

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
              <WardTable
                key={board.area}
                area={board.area}
                wards={board.wards}
                cot={cot}
                statusKey={status}
                statusLabel={statusLabel}
                updatedAt={snapshotAt}
                expandedKey={expanded}
                compact={allOpen}
                exactCache={exactCache}
                onToggle={toggleWard}
                onRetry={retryExact}
                onDetail={(ward) => setModal({ area: ward.area, ward: ward.ward })}
              />
            ))}
        </div>
      )}

      {/* Ward Detail Modal */}
      {modal ? (
        <WardModal
          area={modal.area}
          ward={modal.ward}
          statusLabel={statusLabel}
          cot={cot}
          onClose={() => setModal(null)}
        />
      ) : null}
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

function WardTable({
  area,
  wards,
  cot,
  statusKey,
  statusLabel,
  updatedAt,
  expandedKey,
  compact,
  exactCache,
  onToggle,
  onRetry,
  onDetail,
}: {
  area: Area;
  wards: FlatWard[];
  cot: CotFilter;
  statusKey: PickupStatusKey;
  statusLabel: string;
  updatedAt: string | null;
  expandedKey: string[];
  compact?: boolean;
  exactCache: Record<string, { loading: boolean; data?: WardExact; error?: string }>;
  onToggle: (ward: FlatWard) => void;
  onRetry: (key: string) => void;
  onDetail: (ward: FlatWard) => void;
}) {
  const total = wards.reduce((sum, ward) => sum + visibleTotal(ward, cot), 0);

  return (
    <article data-area={area} className="pickup-area-section overflow-hidden rounded-2xl border bg-white shadow-sm">
      <header className="pickup-area-header flex items-center justify-between border-b px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="pickup-area-dot" />
          <div>
            <h2 className="text-sm font-black tracking-tight text-slate-900">
              Khu vực {area}
            </h2>
            <p className="text-[11px] font-medium text-slate-500">
              {wards.length} phường · Cập nhật {formatDateTime(updatedAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-200/80 bg-white/90 px-3 py-1 font-mono text-xs font-bold text-slate-800 shadow-sm">
            {total.toLocaleString("vi-VN")} đơn
          </span>
        </div>
      </header>

      <div className="max-h-[65vh] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-5 py-2.5 font-bold">Phường {statusLabel}</th>
              <th className="w-24 px-3 py-2.5 text-right font-bold">COT 1</th>
              <th className="w-24 px-3 py-2.5 text-right font-bold">COT 2</th>
              <th className="w-28 px-4 py-2.5 text-right font-bold">Tổng đơn</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!wards.length ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-sm text-slate-400">
                  Không có phường khớp với bộ lọc.
                </td>
              </tr>
            ) : (
              wards.map((ward) => {
                const grand = visibleTotal(ward, cot);
                const key = `${ward.area}||${ward.ward}`;
                const isOpen = expandedKey.includes(key);

                if (compact) {
                  if (!isOpen) return null;
                  return (
                    <Fragment key={ward.ward}>
                      <tr className="border-t border-slate-200">
                        <td colSpan={4} className="bg-slate-50/70 px-5 py-3">
                          <div className="mb-2.5 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-blue-700">
                            <button
                              type="button"
                              onClick={() => onToggle(ward)}
                              className="flex items-center gap-1.5 hover:underline"
                            >
                              <ChevronDown size={14} className="rotate-180" />
                              <span>{ward.ward}</span>
                            </button>
                            <span className="font-mono text-sm">{grand.toLocaleString("vi-VN")} đơn</span>
                          </div>
                          <RiderPanel
                            entry={exactCache[`${statusKey}||${key}`]}
                            cot={cot}
                            ward={ward}
                            statusLabel={statusLabel}
                            onDetail={() => onDetail(ward)}
                            onRetry={() => onRetry(`${statusKey}||${key}`)}
                          />
                        </td>
                      </tr>
                    </Fragment>
                  );
                }

                return (
                  <Fragment key={ward.ward}>
                    <tr
                      data-open={isOpen}
                      onClick={() => onToggle(ward)}
                      className={cn(
                        "pickup-ward-row cursor-pointer transition-colors hover:bg-slate-50/80",
                        isOpen ? "bg-slate-50/80" : "",
                      )}
                    >
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-2 font-bold text-slate-800 transition-colors hover:text-blue-700">
                          <ChevronDown
                            size={15}
                            className={cn(
                              "shrink-0 text-slate-400 transition-transform duration-200",
                              isOpen ? "rotate-180 text-blue-600" : "",
                            )}
                          />
                          <span>{ward.ward}</span>
                        </span>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-3 text-right font-mono text-xs",
                          ward.cot1 <= 0 ? "text-slate-300" : "font-semibold text-slate-700",
                        )}
                      >
                        {ward.cot1.toLocaleString("vi-VN")}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-3 text-right font-mono text-xs",
                          ward.cot2 <= 0 ? "text-slate-300" : "font-semibold text-slate-700",
                        )}
                      >
                        {ward.cot2.toLocaleString("vi-VN")}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span
                          className={cn(
                            "inline-block min-w-12 rounded-lg px-2.5 py-1 font-mono text-xs font-bold tabular-nums",
                            heatClass(grand),
                          )}
                        >
                          {grand.toLocaleString("vi-VN")}
                        </span>
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr className="border-t border-slate-200">
                        <td colSpan={4} className="bg-slate-50/60 px-5 py-3.5">
                          <RiderPanel
                            entry={exactCache[`${statusKey}||${key}`]}
                            cot={cot}
                            ward={ward}
                            statusLabel={statusLabel}
                            onDetail={() => onDetail(ward)}
                            onRetry={() => onRetry(`${statusKey}||${key}`)}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function RiderPanel({
  entry,
  cot,
  ward,
  statusLabel,
  onDetail,
  onRetry,
}: {
  entry: { loading: boolean; data?: WardExact; error?: string } | undefined;
  cot: CotFilter;
  ward: FlatWard;
  statusLabel: string;
  onDetail: () => void;
  onRetry: () => void;
}) {
  const [showShared, setShowShared] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const data = entry?.data;
  const activeCot: "COT1" | "COT2" = cot === "cot1" ? "COT1" : cot === "cot2" ? "COT2" : new Date().getHours() < 12 ? "COT1" : "COT2";
  const filteredOrders = useMemo(
    () => (data ? data.orders.filter((o) => (activeCot === "COT2" ? o.cot === "COT2" : o.cot !== "COT2")) : []),
    [data, activeCot],
  );

  const sharedByOrder = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const o of filteredOrders) {
      if (o.riders.length > 1) map.set(o.order, o.riders);
    }
    return map;
  }, [filteredOrders]);

  const pivotRows = useMemo(() => {
    if (!data) return [] as { name: string; count: number; codes: string[]; fromOtherCot: boolean }[];
    const isActive = (cotVal: string) => (activeCot === "COT2" ? cotVal === "COT2" : cotVal !== "COT2");
    const activeMap = new Map<string, string[]>();
    for (const o of data.orders) {
      if (!isActive(o.cot)) continue;
      for (const name of o.riders) {
        const arr = activeMap.get(name);
        if (arr) arr.push(o.order);
        else activeMap.set(name, [o.order]);
      }
    }
    const activeRiders = new Set(activeMap.keys());
    const soloOtherMap = new Map<string, string[]>();
    for (const o of data.orders) {
      if (isActive(o.cot)) continue;
      if (o.riders.length !== 1) continue;
      const name = o.riders[0];
      if (activeRiders.has(name)) continue;
      const arr = soloOtherMap.get(name);
      if (arr) arr.push(o.order);
      else soloOtherMap.set(name, [o.order]);
    }
    const rows: { name: string; count: number; codes: string[]; fromOtherCot: boolean }[] = [
      ...[...activeMap.entries()].map(([name, codes]) => ({ name, count: codes.length, codes, fromOtherCot: false })),
      ...[...soloOtherMap.entries()].map(([name, codes]) => ({ name, count: codes.length, codes, fromOtherCot: true })),
    ];
    return rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi"));
  }, [data, activeCot]);

  const partnerOf = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const o of filteredOrders) {
      if (o.riders.length < 2) continue;
      for (const r of o.riders) {
        let s = map.get(r);
        if (!s) {
          s = new Set<string>();
          map.set(r, s);
        }
        for (const other of o.riders) if (other !== r) s.add(other);
      }
    }
    return map;
  }, [filteredOrders]);

  const copyRiderList = () => {
    if (!pivotRows.length) return;
    const lines = [
      `[${ward.area} · ${ward.ward}] Tồn ${statusLabel} ${activeCot}:`,
      ...pivotRows.map((r) => {
        const shared = r.codes.filter((c) => sharedByOrder.has(c));
        const sharedTxt = shared.length ? ` (${shared.length} chung)` : "";
        return `- ${r.name}: ${r.count} đơn${sharedTxt}`;
      }),
    ];
    void navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!entry || entry.loading) {
    return (
      <div className="py-4 text-center">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
          <RefreshCcw size={13} className="animate-spin text-blue-600" />
          Đang tải danh sách rider còn đơn {statusLabel}...
        </span>
      </div>
    );
  }

  if (entry.error || !entry.data || !data) {
    return (
      <div className="py-3 text-center">
        <p className="text-xs font-semibold text-rose-600">{entry.error ?? "Không tải được rider."}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-blue-700 shadow-sm hover:bg-slate-50"
        >
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-700">
          Rider phụ trách ({activeCot}): <span className="font-mono text-blue-700">{filteredOrders.length}</span> đơn
        </span>

        <div className="flex items-center gap-2">
          {pivotRows.length > 0 ? (
            <button
              type="button"
              onClick={copyRiderList}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
              <span>{copied ? "Đã chép!" : "Chép rider"}</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDetail}
            className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline"
          >
            <span>Chi tiết PUP & đơn</span>
            <ArrowUpRight size={13} />
          </button>
        </div>
      </div>

      {!filteredOrders.length ? (
        <p className="py-2 text-center text-xs text-slate-400">
          Phường này không còn đơn {statusLabel} {activeCot}.
        </p>
      ) : (
        <div className="max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white shadow-inner">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3.5 py-2">Tên Rider</th>
                <th className="w-28 px-3.5 py-2 text-right">Số lượng đơn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pivotRows.map((row) => {
                const isSel = selected === row.name;
                const isPartner = selected != null && (partnerOf.get(selected)?.has(row.name) ?? false);
                const shared = row.codes.filter((c) => sharedByOrder.has(c));
                const maxGroup = shared.length ? Math.max(...shared.map((c) => sharedByOrder.get(c)?.length ?? 0)) : 0;
                return (
                  <tr
                    key={row.name}
                    onClick={() => setSelected((v) => (v === row.name ? null : row.name))}
                    title={
                      shared.length
                        ? shared.map((c) => `${c} — chung (${sharedByOrder.get(c)?.length}): ${(sharedByOrder.get(c) ?? []).join(" + ")}`).join("\n")
                        : "Đơn riêng — bấm để xem ai chung đơn"
                    }
                    className={cn(
                      "cursor-pointer transition-colors",
                      isSel ? "bg-blue-100/90 text-blue-900" : isPartner ? "bg-amber-100/90 text-amber-900" : "hover:bg-slate-50",
                    )}
                  >
                    <td className="px-3.5 py-2 font-semibold">
                      <span className="flex items-center gap-1.5">
                        <span>{row.name}</span>
                        {row.fromOtherCot ? (
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                            riêng
                          </span>
                        ) : null}
                        {(partnerOf.get(row.name)?.size ?? 0) > 0 ? (
                          <span
                            className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800"
                            title={`Chung đơn với: ${[...(partnerOf.get(row.name) ?? [])].join(", ")}`}
                          >
                            chung ({(partnerOf.get(row.name)?.size ?? 0) + 1})
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-3.5 py-2 text-right">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs font-bold",
                          shared.length ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700",
                        )}
                      >
                        <span>{row.count.toLocaleString("vi-VN")}</span>
                        {shared.length ? <span className="text-[10px] text-amber-700">({maxGroup})</span> : null}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data.orders.length ? (
        data.sharedTotal > 0 ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 text-xs text-amber-800">
            Có <strong>{data.sharedTotal.toLocaleString("vi-VN")} đơn chung</strong> trên tổng {data.distinctTotal.toLocaleString("vi-VN")} đơn. Bấm vào một rider để sáng cùng màu vàng những rider có chung đơn.
          </p>
        ) : (
          <p className="text-xs font-semibold text-emerald-700">
            ✓ Tất cả {data.distinctTotal.toLocaleString("vi-VN")} đơn đều riêng 1 rider.
          </p>
        )
      ) : null}

      {data.noRiderTotal > 0 ? (
        <p className="text-xs text-slate-400">
          {data.noRiderTotal.toLocaleString("vi-VN")} đơn chưa có tên rider.
        </p>
      ) : null}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={() => setShowShared((v) => !v)}
          className="text-xs font-bold text-blue-700 hover:underline"
        >
          {showShared ? "Ẩn danh sách đơn chung ▲" : `Xem danh sách ${data.sharedTotal.toLocaleString("vi-VN")} đơn chung ▼`}
        </button>
      </div>

      {showShared ? (
        data.shared.length ? (
          <ul className="max-h-40 divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200 bg-white">
            {data.shared.map((item) => (
              <li key={item.order} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-1.5 text-xs">
                <span className="font-mono font-bold text-slate-800">{item.order}</span>
                <span className="text-slate-500">{item.riders.join(" + ")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-emerald-700">Không có đơn nào gán chung nhiều rider trong phường này.</p>
        )
      ) : null}
    </div>
  );
}

type WardOrder = { pup: string; pupName: string; order: string; cot: string; rider: string; riders: string[]; zone: string };

function parseRiderNames(value: string | null | undefined): string[] {
  return String(value ?? "")
    .split(/[,;\n]+/)
    .map((part) => part.replace(/^\[COT[12]\]\s*/i, "").trim())
    .filter((part) => part && part !== "—");
}

function WardModal({ area, ward, statusLabel, cot, onClose }: { area: string; ward: string; statusLabel: string; cot: CotFilter; onClose: () => void }) {
  const [orders, setOrders] = useState<WardOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyShared, setOnlyShared] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    const run = async () => {
      setLoadingOrders(true);
      try {
        const { fetchPickupWardDetailRows, getDriverNameMaps, getWardRoutes } = await import("@/components/lmhub-inventory/use-pickup-ward-riders");
        const [list, routesByDriver, nameMaps] = await Promise.all([
          fetchPickupWardDetailRows(area, ward, statusLabel, controller.signal),
          getWardRoutes(area, ward, controller.signal),
          getDriverNameMaps(controller.signal),
        ]);
        if (cancelled) return;
        const idByName = nameMaps.byName;
        const zoneOf = (riderName: string): string => {
          const id = idByName.get(riderName) ?? idByName.get(riderName.toLowerCase()) ?? "";
          const routes = id ? routesByDriver.get(id) : undefined;
          return routes && routes.size ? [...routes].join(", ") : "";
        };
        setOrders(
          list.map((row) => {
            const rider = String(row.assigned_riders_today || "");
            const riders = parseRiderNames(rider);
            const rawZone = String(row.zone_name || "").trim();
            const zones = riders.map(zoneOf).filter(Boolean);
            const zone = rawZone || [...new Set(zones)].join(", ");
            return {
              pup: String(row.pickup_point_id || "—"),
              pupName: String(row.pickup_point_name || ""),
              order: String(row.shipment_id || "—"),
              cot: riderCotLabel(String(row.cot_group || "")),
              rider,
              riders,
              zone,
            };
          }),
        );
      } finally {
        clearTimeout(timeoutId);
        if (!cancelled) setLoadingOrders(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [area, ward, statusLabel]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = search.trim().toLowerCase();
  const sharedCount = orders.filter((row) => row.riders.length > 1).length;
  const visible = orders
    .filter((row) => (cot === "all" ? true : row.cot.toLowerCase() === cot))
    .filter((row) => !onlyShared || row.riders.length > 1)
    .filter((row) => !q || `${row.pup} ${row.pupName} ${row.order} ${row.rider} ${row.zone}`.toLowerCase().includes(q));

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
                Khu vực {area}
              </span>
              <span className="text-xs font-semibold text-slate-500">· Tồn {statusLabel}</span>
            </div>
            <h2 className="mt-1 text-lg font-black text-slate-900">{ward}</h2>
          </div>
          <Button type="button" variant="secondary" onClick={onClose} className="rounded-xl">
            <X size={16} /> Đóng
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-200 bg-slate-50/60 px-5 py-3">
          <span className="relative block min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm mã PUP, tên bưu cục, mã đơn, tên rider, zone..."
              className="h-9 pl-9 text-xs"
            />
          </span>
          <button
            type="button"
            aria-pressed={onlyShared}
            onClick={() => setOnlyShared((v) => !v)}
            className={cn(
              "rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors",
              onlyShared ? "border-amber-400 bg-amber-100 text-amber-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            )}
          >
            ⇄ Chỉ đơn chung{sharedCount > 0 ? ` (${sharedCount})` : ""}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-bold">Mã PUP</th>
                <th className="px-4 py-3 font-bold">Mã đơn</th>
                <th className="px-3 py-3 font-bold">COT</th>
                <th className="px-4 py-3 font-bold">Zone</th>
                <th className="px-4 py-3 font-bold">Rider phụ trách</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loadingOrders ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    <RefreshCcw size={16} className="mx-auto mb-2 animate-spin text-blue-600" />
                    Đang tải chi tiết đơn...
                  </td>
                </tr>
              ) : !visible.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    {onlyShared ? "Không có đơn chung trong phường này." : "Không có đơn khớp với tìm kiếm."}
                  </td>
                </tr>
              ) : (
                visible.map((row, index) => {
                  const isShared = row.riders.length > 1;
                  return (
                    <tr
                      key={`${row.pup}-${row.order}-${index}`}
                      className={cn("transition-colors hover:bg-slate-50/80", isShared ? "bg-amber-50/40" : "")}
                    >
                      <td className="px-4 py-3 font-mono font-bold text-slate-800">
                        <div>{row.pup}</div>
                        {row.pupName ? <div className="text-[10px] font-normal text-slate-500">{row.pupName}</div> : null}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-800">{row.order}</td>
                      <td className="px-3 py-3 font-semibold text-slate-600">{row.cot}</td>
                      <td className="px-4 py-3 text-slate-600">{row.zone || "—"}</td>
                      <td className="px-4 py-3">
                        {row.riders.length ? (
                          <span className="flex flex-wrap items-center gap-1.5">
                            {isShared ? (
                              <span
                                title={`Đơn chung giữa: ${row.riders.join(", ")}`}
                                className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800"
                              >
                                ⇄ chung {row.riders.length}
                              </span>
                            ) : null}
                            {row.riders.map((name) => {
                              const others = row.riders.filter((n) => n !== name);
                              return (
                                <span
                                  key={name}
                                  title={others.length ? `Chung đơn này với: ${others.join(", ")}` : "Đơn riêng 1 rider"}
                                  className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800"
                                >
                                  {name}
                                </span>
                              );
                            })}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>,
    document.body,
  );
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
