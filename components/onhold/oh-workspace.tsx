"use client";
import { useRememberedState } from "@/components/layout/filter-memory";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import {
  BarChart3,
  Download,
  RefreshCw,
  Database,
  ArrowUpRight,
  Clock3,
  Filter,
  Eye,
  Copy,
  RotateCcw,
  CheckCircle2,
  FileSpreadsheet,
  MapPin,
  Users,
  Search,
  Maximize2,
} from "lucide-react";
import {
  OH_AREAS,
  OH_COLORS,
  ohSummary,
  ohRankings,
  ohRange,
  reasonName,
  reasonNameVi,
  type OHData,
  type OHOrdersResult,
} from "@/lib/onhold/model";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import { OHOrderDialog } from "./oh-order-dialog";
import { OHFullRankingsDialog } from "./oh-full-rankings-dialog";
import { OHAnalysis } from "./oh-analysis";
import s from "./oh-workspace.module.css";

const nf = new Intl.NumberFormat("vi-VN");
const number = (n: number) => nf.format(n);
const shortDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

export function OHWorkspace({
  initialData,
  initialError = "",
  from,
  today,
}: {
  initialData?: OHData;
  initialError?: string;
  from: string;
  today: string;
}) {
  const [data, setData] = useState<OHData>(initialData ?? { reports: [], cells: [] });
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(!initialData);
  const [busy, setBusy] = useState(false);
  const [start, setStart] = useRememberedState("oh-workspace:start", from);
  const [end, setEnd] = useRememberedState("oh-workspace:end", today);
  const [range, setRange] = useRememberedState("oh-workspace:range", { from, to: today });
  const [geoMode, setGeoMode] = useState<"district" | "ward">("ward");
  const [day, setDay] = useRememberedState("oh-workspace:day", today);

  // Hook into AppLoadingOverlay (renders rider loader on top of AppShell while sidebar stays solid)
  useReportInitialDataLoading("onhold", loading);

  // Abort an older date-range read when the selected range changes.
  useEffect(() => {
    if (initialData) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/onhold?from=${start}&to=${end}`, { cache: "no-store", signal: controller.signal })
        .then(async res => { if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Không tải được dữ liệu phân tích OH"); } return res.json(); })
        .then((next: OHData) => { if (!controller.signal.aborted) setData(next); })
        .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Không tải được pivot OH."); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [initialData, start, end]);

  // OH is reported together across all recording statuses.
  const status = "all";
  const [reason, setReason] = useState("all");
  const [area, setArea] = useRememberedState("oh-workspace:area", "all");
  const [district, setDistrict] = useRememberedState("oh-workspace:district", "all");
  const [ward, setWard] = useRememberedState("oh-workspace:ward", "all");

  // Inline table searches and view limits
  const [geoSearch, setGeoSearch] = useState("");
  const [geoLimit, setGeoLimit] = useState<number>(20);
  const [riderSearch, setRiderSearch] = useState("");
  const [riderLimit, setRiderLimit] = useState<number>(20);

  // Dialog states
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);
  const [orderDialogQuery, setOrderDialogQuery] = useState("");
  const [isFullRankingsOpen, setIsFullRankingsOpen] = useState(false);
  const [fullRankingsTab, setFullRankingsTab] = useState<"riders" | "wards" | "districts">("riders");
  const [exportingOrders, setExportingOrders] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3500);
  };

  // Base filtered by the 4 dimensions across dates (for pivot table & KV cards)
  const baseCrossDate = useMemo(() => {
    return data.cells.filter((c) => {
      if (reason !== "all" && c.reason !== reason) return false;
      if (district !== "all" && (c.district || "Chưa rõ quận") !== district) return false;
      if (ward !== "all" && (c.ward || "Chưa rõ phường") !== ward) return false;
      return true;
    });
  }, [data.cells, reason, district, ward]);

  // Cells matching all filters for the selected day
  const cells = useMemo(() => {
    return baseCrossDate.filter((c) => {
      if (c.report_date !== day) return false;
      if (area !== "all" && c.area !== area) return false;
      return true;
    });
  }, [baseCrossDate, day, area]);

  const summary = ohSummary(cells);
  const report = data.reports.find((r) => r.report_date === day);
  const isToday = day === today;
  const isHistorical = !isToday;

  // Dictionary of reason labels
  const reasonLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of data.cells) {
      if (c.reason) {
        map[c.reason] = c.reason_label || reasonNameVi(c.reason);
      }
    }
    return map;
  }, [data.cells]);

  // List of available reasons in the selected day matching area
  const availableReasons = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of data.cells) {
      if (c.report_date !== day) continue;
      if (area !== "all" && c.area !== area) continue;
      counts.set(c.reason, (counts.get(c.reason) || 0) + c.orders);
    }
    return Array.from(counts.entries())
      .map(([code, count]) => ({
        code,
        label: reasonLabelMap[code] || reasonNameVi(code),
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [data.cells, day, area, reasonLabelMap]);

  // Available districts
  const availableDistricts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of data.cells) {
      if (c.report_date !== day) continue;
      if (area !== "all" && c.area !== area) continue;
      if (reason !== "all" && c.reason !== reason) continue;
      const d = c.district || "Chưa rõ quận";
      counts.set(d, (counts.get(d) || 0) + c.orders);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi"));
  }, [data.cells, day, area, reason]);

  // Available wards
  const availableWards = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of data.cells) {
      if (c.report_date !== day) continue;
      if (area !== "all" && c.area !== area) continue;
      if (district !== "all" && (c.district || "Chưa rõ quận") !== district) continue;
      if (reason !== "all" && c.reason !== reason) continue;
      const w = c.ward || "Chưa rõ phường";
      counts.set(w, (counts.get(w) || 0) + c.orders);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi"));
  }, [data.cells, day, area, district, reason]);

  // Reason breakdown
  const reasons = useMemo(() => {
    return Object.entries(
      cells.reduce<Record<string, number>>((out, c) => {
        out[c.reason] = (out[c.reason] ?? 0) + c.orders;
        return out;
      }, {})
    ).sort((a, b) => b[1] - a[1]);
  }, [cells]);

  const days = useMemo(() => {
    return Array.from(
      { length: Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86400000) + 1 },
      (_, i) => new Date(Date.parse(range.from) + i * 86400000).toISOString().slice(0, 10)
    );
  }, [range]);

  const hasDay = (d: string) => data.reports.some((r) => r.report_date === d);
  const pivot = (a: string, d: string) =>
    baseCrossDate.filter((c) => c.area === a && c.report_date === d).reduce((n, c) => n + c.orders, 0);

  const hours = Array.from({ length: 24 }, (_, h) =>
    cells.filter((c) => c.hour === h).reduce((n, c) => n + c.orders, 0)
  );
  const peak = Math.max(...hours);
  const peakHours = hours.flatMap((count, hour) => count === peak && peak > 0 ? [`${String(hour).padStart(2, "0")}:00`] : []);

  // Complete lists of rankings (ALL items)
  const allGeography = useMemo(() => ohRankings(cells, geoMode), [cells, geoMode]);
  const allWards = useMemo(() => ohRankings(cells, "ward"), [cells]);
  const allDistricts = useMemo(() => ohRankings(cells, "district"), [cells]);
  const allRiders = useMemo(() => ohRankings(cells, "rider"), [cells]);

  // Inline filtered Geography list
  const displayGeography = useMemo(() => {
    const q = geoSearch.trim().toLowerCase();
    const list = q
      ? allGeography.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            (r.detail && r.detail.toLowerCase().includes(q))
        )
      : allGeography;
    return list.slice(0, geoLimit);
  }, [allGeography, geoSearch, geoLimit]);

  // Inline filtered Rider list
  const displayRiders = useMemo(() => {
    const q = riderSearch.trim().toLowerCase();
    const list = q
      ? allRiders.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            (r.detail && r.detail.toLowerCase().includes(q)) ||
            (r.area && r.area.toLowerCase().includes(q)) ||
            (r.district && r.district.toLowerCase().includes(q)) ||
            (r.ward && r.ward.toLowerCase().includes(q)) ||
            (r.wards && r.wards.some((w) => w.toLowerCase().includes(q)))
        )
      : allRiders;
    return list.slice(0, riderLimit);
  }, [allRiders, riderSearch, riderLimit]);

  function getAreaBadgeClass(areaName?: string) {
    if (!areaName) return s.areaBadgeOther;
    if (areaName.includes("1")) return `${s.areaBadge} ${s.areaBadgeKV1}`;
    if (areaName.includes("2")) return `${s.areaBadge} ${s.areaBadgeKV2}`;
    if (areaName.includes("3")) return `${s.areaBadge} ${s.areaBadgeKV3}`;
    if (areaName.includes("4")) return `${s.areaBadge} ${s.areaBadgeKV4}`;
    if (areaName.includes("5")) return `${s.areaBadge} ${s.areaBadgeKV5}`;
    return `${s.areaBadge} ${s.areaBadgeOther}`;
  }

  // Peak orders for visual progress bars
  const maxGeoOrders = useMemo(() => {
    return allGeography.length ? Math.max(...allGeography.map((r) => r.orders), 1) : 1;
  }, [allGeography]);

  const maxRiderOrders = useMemo(() => {
    return allRiders.length ? Math.max(...allRiders.map((r) => r.orders), 1) : 1;
  }, [allRiders]);

  const timeLabel = (value: string) =>
    new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const cumulative = report?.collection_mode === "cumulative";
  const reasonLabel = (code: string) =>
    cells.find((c) => c.reason === code && c.reason_label)?.reason_label ||
    reasonLabelMap[code] ||
    reasonNameVi(code) ||
    reasonName(code);

  const activeFilterCount =
    (reason !== "all" ? 1 : 0) +
    (area !== "all" ? 1 : 0) +
    (district !== "all" ? 1 : 0) +
    (ward !== "all" ? 1 : 0);

  function resetFilters() {
    setReason("all");
    setArea("all");
    setDistrict("all");
    setWard("all");
  }

  function handleAreaChange(newArea: string) {
    setArea(newArea);
    if (newArea !== "all" && district !== "all") {
      const match = data.cells.some(
        (c) => c.report_date === day && c.area === newArea && c.district === district
      );
      if (!match) {
        setDistrict("all");
        setWard("all");
      }
    }
  }

  function handleDistrictChange(newDistrict: string) {
    setDistrict(newDistrict);
    if (newDistrict !== "all" && ward !== "all") {
      const match = data.cells.some(
        (c) => c.report_date === day && c.district === newDistrict && c.ward === ward
      );
      if (!match) {
        setWard("all");
      }
    }
  }

  async function refresh() {
    try {
      ohRange(start, end, today);
      setBusy(true);
      setError("");
      const response = await fetch(`/api/onhold?from=${start}&to=${end}`, { cache: "no-store" });
      if (!response.ok)
        throw new Error("Không tải được pivot OH. Dữ liệu đang hiển thị được giữ nguyên.");
      const next: OHData = await response.json();
      setData(next);
      setRange({ from: start, to: end });
      if (day < start || day > end) setDay(end);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được pivot OH.");
    } finally {
      setBusy(false);
    }
  }

  function downloadPivot() {
    const rows = [
      ["Khu vực", ...days],
      ...OH_AREAS.filter((a) => area === "all" || area === a).map((a) => [
        a,
        ...days.map((d) => (hasDay(d) ? String(pivot(a, d)) : "")),
      ]),
    ];
    const csv =
      "\ufeff" +
      rows
        .map((row) => row.map((x) => '"' + x.replaceAll('"', '""') + '"').join(","))
        .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `OH-pivot-${range.from}-${range.to}-${status}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function exportOrdersCsv() {
    setExportingOrders(true);
    try {
      const params = new URLSearchParams({
        day,
        area,
        status,
        reason,
        district,
        ward,
        export: "1",
      });
      const res = await fetch(`/api/onhold/orders?${params}`, { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Không thể tải danh sách mã đơn.");
      }
      const orderData: OHOrdersResult = await res.json();

      if (!orderData.has_snapshot) {
        alert(
          "Mã đơn chi tiết được lưu 7 ngày gần nhất. Ngày này đã hết hạn lưu hoặc chưa có danh sách mã đơn; thống kê OH vẫn được giữ."
        );
        return;
      }

      if (!orderData.orders.length) {
        alert("Không có mã đơn nào khớp với bộ lọc hiện tại.");
        return;
      }

      const headers = [
        "Mã đơn",
        "Trạng thái",
        "Khu vực",
        "Quận",
        "Phường",
        "Mã lý do",
        "Lý do OH",
        "Mã rider",
        "Tên rider",
        "Giờ OH",
        "Ngày",
      ];

      const rows = orderData.orders.map((o) => [
        o.order_code,
        o.status === 5 ? "Onhold (5)" : "Received (1)",
        o.area,
        o.district,
        o.ward,
        o.reason,
        o.reason_label || reasonLabelMap[o.reason] || reasonNameVi(o.reason),
        o.rider_code && o.rider_code !== "0" && o.rider_code !== "unknown" ? o.rider_code : "",
        o.rider_name || "",
        o.hour >= 0 ? `${o.hour}:00` : "Chưa rõ",
        day,
      ]);

      const csvContent =
        "\ufeff" +
        [headers, ...rows]
          .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
          .join("\r\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const filterSuffix = [
        area !== "all" ? area.replace(/\s+/g, "") : "",
        district !== "all" ? district.replace(/\s+/g, "") : "",
        reason !== "all" ? `Lydo-${reason}` : "",
      ]
        .filter(Boolean)
        .join("-");
      link.href = url;
      link.download = `Ma-don-OH-${day}${filterSuffix ? `-${filterSuffix}` : ""}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      showToast(`Đã xuất ${orderData.orders.length.toLocaleString("vi-VN")} mã đơn thành công!`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Lỗi khi xuất danh sách mã đơn.");
    } finally {
      setExportingOrders(false);
    }
  }

  async function copyOrdersToClipboard() {
    setExportingOrders(true);
    try {
      const params = new URLSearchParams({
        day,
        area,
        status,
        reason,
        district,
        ward,
        export: "1",
      });
      const res = await fetch(`/api/onhold/orders?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Không thể tải danh sách mã đơn để sao chép.");
      const orderData: OHOrdersResult = await res.json();

      if (!orderData.has_snapshot) {
        alert(
          "Mã đơn chi tiết được lưu 7 ngày gần nhất. Ngày này đã hết hạn lưu hoặc chưa có danh sách mã đơn; thống kê OH vẫn được giữ."
        );
        return;
      }

      const codes = orderData.orders.map((o) => o.order_code).filter(Boolean);
      if (!codes.length) {
        alert("Không có mã đơn nào khớp với bộ lọc hiện tại.");
        return;
      }

      await navigator.clipboard.writeText(codes.join("\n"));
      showToast(`Đã sao chép ${codes.length.toLocaleString("vi-VN")} mã đơn vào clipboard!`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Lỗi khi sao chép mã đơn.");
    } finally {
      setExportingOrders(false);
    }
  }

  // Render Skeleton inside the workspace while maintaining the sidebar
  if (loading) {
    return (
      <div className={s.workspace} aria-busy="true" aria-label="Đang tải phân tích Onhold">
        <header className={s.header}>
          <div>
            <div className={s.eyebrow}>
              <BarChart3 size={16} /> DELIVERY INTELLIGENCE
            </div>
            <h1>
              Phân tích Onhold<span>OH</span>
            </h1>
            <p>Theo dõi áp lực OH theo khu vực, quận, phường, lý do và thời điểm.</p>
          </div>
          <Link className={s.sourceLink} href="/data-sources">
            Quản lý nguồn dữ liệu <ArrowUpRight size={16} />
          </Link>
        </header>

        {/* Skeleton notice */}
        <div className="h-14 rounded-xl border border-slate-200 bg-white/70 animate-pulse dark:border-slate-800 dark:bg-slate-900/60" />

        {/* Skeleton Toolbar */}
        <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-slate-200 bg-white animate-pulse dark:border-slate-800 dark:bg-slate-900">
          <div className="h-10 w-36 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          <div className="h-10 w-36 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          <div className="h-10 w-36 bg-blue-200 dark:bg-blue-950/60 rounded-lg" />
          <div className="ml-auto h-10 w-32 bg-slate-200 dark:bg-slate-800 rounded-lg" />
        </div>

        {/* Skeleton Filter Card */}
        <div className="p-5 rounded-2xl border border-slate-200 bg-white animate-pulse dark:border-slate-800 dark:bg-slate-900 space-y-4">
          <div className="flex justify-between items-center">
            <div className="h-5 w-48 bg-slate-200 dark:bg-slate-800 rounded-md" />
            <div className="h-5 w-32 bg-slate-100 dark:bg-slate-800 rounded-md" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-3.5 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-10 w-full bg-slate-100 dark:bg-slate-800/80 rounded-lg" />
              </div>
            ))}
          </div>
          <div className="flex gap-2.5 pt-2">
            <div className="h-9 w-36 bg-blue-200 dark:bg-blue-900/40 rounded-lg" />
            <div className="h-9 w-36 bg-emerald-200 dark:bg-emerald-900/40 rounded-lg" />
            <div className="h-9 w-32 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          </div>
        </div>

        {/* Skeleton 4 Metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`p-5 rounded-2xl border ${
                i === 1
                  ? "bg-slate-800 dark:bg-slate-800 border-slate-700"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
              } space-y-3`}
            >
              <div className={`h-3.5 w-28 rounded ${i === 1 ? "bg-slate-600" : "bg-slate-200 dark:bg-slate-800"}`} />
              <div className={`h-9 w-20 rounded-md ${i === 1 ? "bg-slate-500" : "bg-slate-300 dark:bg-slate-700"}`} />
              <div className={`h-3 w-36 rounded ${i === 1 ? "bg-slate-600" : "bg-slate-200 dark:bg-slate-800"}`} />
            </div>
          ))}
        </div>

        {/* Skeleton 7 Area buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 animate-pulse">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="p-3.5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-2">
              <div className="h-3 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-7 w-12 bg-slate-300 dark:bg-slate-700 rounded" />
              <div className="h-2.5 w-20 bg-slate-100 dark:bg-slate-800 rounded" />
            </div>
          ))}
        </div>

        {/* Skeleton 2 Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-pulse">
          {[1, 2].map((panelIdx) => (
            <div key={panelIdx} className="p-6 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1.5">
                  <div className="h-5 w-36 bg-slate-300 dark:bg-slate-700 rounded-md" />
                  <div className="h-3.5 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
                </div>
                <div className="h-8 w-28 bg-slate-100 dark:bg-slate-800 rounded-lg" />
              </div>
              <div className="space-y-2.5 pt-2">
                {[1, 2, 3, 4, 5, 6].map((row) => (
                  <div key={row} className="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="h-6 w-6 rounded-full bg-slate-200 dark:bg-slate-800" />
                      <div className="space-y-1">
                        <div className="h-4 w-36 bg-slate-200 dark:bg-slate-800 rounded" />
                        <div className="h-3 w-20 bg-slate-100 dark:bg-slate-850 rounded" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-4 w-10 bg-slate-300 dark:bg-slate-700 rounded" />
                      <div className="h-2 w-16 bg-slate-200 dark:bg-slate-800 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={s.workspace}>
      {/* Header */}
      <header className={s.header}>
        <div>
          <div className={s.eyebrow}>
            <BarChart3 size={16} /> DELIVERY INTELLIGENCE
          </div>
          <h1>
            Phân tích Onhold<span>OH</span>
          </h1>
          <p>Theo dõi áp lực OH theo khu vực, quận, phường, lý do và thời điểm.</p>
        </div>
        <Link className={s.sourceLink} href="/data-sources">
          Quản lý nguồn dữ liệu <ArrowUpRight size={16} />
        </Link>
      </header>

      <OHAnalysis end={today} />

      {/* Info notice */}
      <div className={s.notice}>
        <Database size={18} />
        <p>
          <strong>Ghi nhận OH lũy kế.</strong> Mỗi mã được tính một lần/ngày, giữ lại dù sau đó hub nhận về hoặc đổi
          trạng thái. Khóa khử trùng và mã đơn chi tiết được lưu 7 ngày gần nhất (hôm nay và 6 ngày trước). Qua thời hạn này,
          danh sách mã đơn được giải phóng; thống kê pivot tổng hợp vẫn được bảo lưu.
        </p>
      </div>

      {/* Date Range Toolbar */}
      <form
        id="onhold-details"
        className={s.toolbar}
        onSubmit={(e) => {
          e.preventDefault();
          void refresh();
        }}
      >
        <label>
          Từ ngày
          <input
            type="date"
            value={start}
            max={today}
            onChange={(e) => setStart(e.target.value)}
            required
          />
        </label>
        <label>
          Đến ngày
          <input
            type="date"
            value={end}
            max={today}
            onChange={(e) => setEnd(e.target.value)}
            required
          />
        </label>
        <button disabled={busy} type="submit">
          <RefreshCw size={16} className={busy ? s.spinning : undefined} />
          {busy ? "Đang tải…" : "Áp dụng / làm mới"}
        </button>
        <button
          type="button"
          className={s.secondary}
          onClick={downloadPivot}
          disabled={!data.reports.length}
          style={{ marginLeft: "auto" }}
        >
          <Download size={16} />
          Xuất pivot
        </button>
      </form>

      {error && (
        <div className={s.error} role="alert">
          {error}
        </div>
      )}

      {/* Daily Overview Bar */}
      <section className={s.daily}>
        <div>
          <div className={s.eyebrow}>LŨY KẾ MÃ ĐƠN TRONG NGÀY</div>
          <h2>Toàn cảnh khu vực</h2>
          <p>
            {report
              ? `Cập nhật: ${timeLabel(report.fetched_at)} · ${
                  cumulative
                    ? `${report.scan_count ?? 0} lần quét · +${number(
                        report.last_new_count ?? 0
                      )} mã mới lượt gần nhất`
                    : "Snapshot cũ, chưa có dữ liệu lũy kế"
                }`
              : "Ngày này chưa có lần đồng bộ thành công."}
          </p>
        </div>
        <label>
          Ngày phân tích
          <input
            type="date"
            min={range.from}
            max={range.to}
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              setDistrict("all");
              setWard("all");
            }}
            required
          />
        </label>
      </section>

      {/* ADVANCED FILTER BAR: Trạng thái, Lý do OH, Khu vực, Quận, Phường */}
      <section className={s.filterCard} aria-label="Bộ lọc nâng cao OH">
        <div className={s.filterHeader}>
          <div className={s.filterHeaderLeft}>
            <h3>
              <Filter size={17} className="text-blue-600" />
              Bộ lọc nâng cao Onhold
            </h3>
            {activeFilterCount > 0 && (
              <span className={s.filterBadge}>Đang lọc {activeFilterCount} tiêu chí</span>
            )}
          </div>
          <div className={s.activeChips}>
            {reason !== "all" && (
              <span className={s.activeChip}>
                Lý do: {reasonLabelMap[reason] || reasonNameVi(reason)}
                <button title="Bỏ lọc lý do" onClick={() => setReason("all")}>
                  ×
                </button>
              </span>
            )}
            {area !== "all" && (
              <span className={s.activeChip}>
                {area}
                <button title="Bỏ lọc khu vực" onClick={() => handleAreaChange("all")}>
                  ×
                </button>
              </span>
            )}
            {district !== "all" && (
              <span className={s.activeChip}>
                {district}
                <button title="Bỏ lọc quận" onClick={() => handleDistrictChange("all")}>
                  ×
                </button>
              </span>
            )}
            {ward !== "all" && (
              <span className={s.activeChip}>
                {ward}
                <button title="Bỏ lọc phường" onClick={() => setWard("all")}>
                  ×
                </button>
              </span>
            )}
          </div>
        </div>

        <div className={s.filterGrid}>
          {/* 2. Filter Lý do OH */}
          <label>
            Lý do Onhold
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="all">Tất cả lý do OH ({availableReasons.reduce((s, r) => s + r.count, 0)})</option>
              {availableReasons.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code} - {r.label} ({r.count})
                </option>
              ))}
            </select>
          </label>

          {/* 3. Filter Khu vực */}
          <label>
            Khu vực
            <select value={area} onChange={(e) => handleAreaChange(e.target.value)}>
              <option value="all">Tất cả khu vực</option>
              {OH_AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          {/* 4. Filter Quận */}
          <label>
            Quận / Huyện
            <select value={district} onChange={(e) => handleDistrictChange(e.target.value)}>
              <option value="all">Tất cả quận ({availableDistricts.length})</option>
              {availableDistricts.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name} ({d.count})
                </option>
              ))}
            </select>
          </label>

          {/* 5. Filter Phường */}
          <label>
            Phường / Xã
            <select value={ward} onChange={(e) => setWard(e.target.value)}>
              <option value="all">Tất cả phường ({availableWards.length})</option>
              {availableWards.map((w) => (
                <option key={w.name} value={w.name}>
                  {w.name} ({w.count})
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Filter Action Buttons */}
        <div className={s.filterActions}>
          <button
            type="button"
            className={s.primaryAction}
            onClick={() => {
              setOrderDialogQuery("");
              setIsOrderDialogOpen(true);
            }}
            title="Xem danh sách mã vận đơn chi tiết khớp với bộ lọc hiện tại"
          >
            <Eye size={16} />
            Xem mã đơn ({report ? number(summary.total) : "0"})
          </button>

          <button
            type="button"
            disabled={exportingOrders || !summary.total}
            className={s.exportAction}
            onClick={() => void exportOrdersCsv()}
            title="Tải file CSV chứa toàn bộ mã đơn khớp bộ lọc"
          >
            <FileSpreadsheet size={16} />
            {exportingOrders ? "Đang xuất…" : "Xuất mã đơn (CSV)"}
          </button>

          <button
            type="button"
            disabled={exportingOrders || !summary.total}
            className={s.copyAction}
            onClick={() => void copyOrdersToClipboard()}
            title="Sao chép toàn bộ mã đơn khớp bộ lọc vào bộ nhớ tạm"
          >
            <Copy size={15} />
            Sao chép mã đơn
          </button>

          {activeFilterCount > 0 && (
            <button
              type="button"
              className={s.resetAction}
              onClick={resetFilters}
              title="Đặt lại toàn bộ 5 bộ lọc về mặc định"
            >
              <RotateCcw size={14} />
              Xóa bộ lọc ({activeFilterCount})
            </button>
          )}
        </div>
      </section>

      {/* Toast Notification */}
      {toastMessage && (
        <div className={s.toastSuccess} role="status">
          <CheckCircle2 size={18} />
          {toastMessage}
        </div>
      )}

      {/* Metrics Cards */}
      <div className={s.metrics}>
        {[
          ["Mã đơn OH duy nhất", summary.total, "Khớp bộ lọc hiện tại"],
          ["Chưa xác định KV", summary.unknown, "Giữ riêng để không bỏ sót"],
        ].map(([label, val, hint]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{report ? number(Number(val)) : "—"}</strong>
            <small>{hint}</small>
          </article>
        ))}
      </div>

      {/* Area Buttons Grid */}
      <div className={s.areaGrid}>
        <button
          className={`${s.area} ${area === "all" ? s.selected : ""}`}
          onClick={() => handleAreaChange("all")}
          aria-pressed={area === "all"}
          style={{ "--area-color": "#334155" } as React.CSSProperties}
        >
          <span>Tất cả khu vực</span>
          <strong>
            {report
              ? number(
                  baseCrossDate
                    .filter((c) => c.report_date === day)
                    .reduce((sum, c) => sum + c.orders, 0)
                )
              : "—"}
          </strong>
          <small>Xem toàn bộ</small>
        </button>
        {OH_AREAS.map((a, i) => {
          const n = baseCrossDate
            .filter((c) => c.report_date === day && c.area === a)
            .reduce((sum, c) => sum + c.orders, 0);
          return (
            <button
              key={a}
              className={`${s.area} ${area === a ? s.selected : ""}`}
              aria-pressed={area === a}
              style={{ "--area-color": OH_COLORS[i] } as React.CSSProperties}
              onClick={() => handleAreaChange(area === a ? "all" : a)}
            >
              <span>{a.replace("Khu vực ", "KV")}</span>
              <strong>{report ? number(n) : "—"}</strong>
              <small>
                {report && summary.total && area === "all"
                  ? `${Math.round((n / summary.total) * 100)}% tổng đơn`
                  : "Lọc khu vực"}
              </small>
            </button>
          );
        })}
      </div>

      {/* Collection / Historical Note */}
      {report && (
        <div className={s.collectionNote}>
          <Database size={16} />
          <p>
            {isHistorical ? (
              <>
                <strong>Dữ liệu lịch sử ({shortDate(day)})</strong> · Số liệu ngày đã chốt được giữ nguyên. Có thể xem và xuất mã đơn còn lưu trong 7 ngày gần nhất; ngoài thời hạn này chỉ giữ thống kê tổng hợp.
              </>
            ) : cumulative ? (
              <>
                <strong>{report.finalized_at ? "Đã chốt cuối ngày" : "Đang thu thập lũy kế trong ngày"}</strong> · Bắt
                đầu {report.collection_started_at ? timeLabel(report.collection_started_at) : "—"}
                {report.finalized_at
                  ? ` · Chốt ${timeLabel(report.finalized_at)}`
                  : " · Tự động chốt lúc 00:00 giờ Việt Nam."}{" "}
                Chức năng xem và xuất mã đơn hoạt động với danh sách còn lưu trong 7 ngày gần nhất.
              </>
            ) : (
              <>
                <strong>Dữ liệu snapshot cũ.</strong> Ngày này chưa có tập mã khử trùng để tính lũy kế và xếp hạng chi
                tiết.
              </>
            )}
          </p>
        </div>
      )}

      {/* REDESIGNED RANKINGS SECTION: 2 PROFESSIONAL PANELS WITH FULL ACCESS TO ALL RIDERS & WARDS */}
      {report && (
        <section className={s.rankSection} aria-label="Xếp hạng OH theo địa bàn và rider">
          <div className={s.panelTitle}>
            <div>
              <div className={s.eyebrow}>ĐỊA BÀN & RIDER</div>
              <h2>
                OH nhiều nhất · {area === "all" ? "Tất cả khu vực" : area}
                {district !== "all" ? ` · ${district}` : ""}
                {ward !== "all" ? ` · ${ward}` : ""}
              </h2>
            </div>
            <span>
              {shortDate(day)} · {number(summary.total)} mã đơn
            </span>
          </div>

          <div className={s.analysis}>
            {/* PANEL 1: QUẬN / PHƯỜNG */}
            <section className={s.panel}>
              {/* Header */}
              <div className={s.rankPanelHeader}>
                <div className={s.rankHeaderTitle}>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                    <MapPin size={16} />
                  </div>
                  <h2>Quận / phường</h2>
                  <span className={s.rankHeaderCount}>
                    {allGeography.length} {geoMode === "ward" ? "phường" : "quận"}
                  </span>
                </div>
                <div className={s.rankHeaderActions}>
                  <div className={s.segment}>
                    <button
                      aria-pressed={geoMode === "district"}
                      onClick={() => {
                        setGeoMode("district");
                        setGeoSearch("");
                      }}
                    >
                      Quận
                    </button>
                    <button
                      aria-pressed={geoMode === "ward"}
                      onClick={() => {
                        setGeoMode("ward");
                        setGeoSearch("");
                      }}
                    >
                      Phường
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFullRankingsTab(geoMode === "ward" ? "wards" : "districts");
                      setIsFullRankingsOpen(true);
                    }}
                    className={s.viewAllBtn}
                    title="Mở hộp thoại xem toàn bộ các phường/quận có đơn OH"
                  >
                    <Maximize2 size={13} />
                    Xem tất cả ({allGeography.length})
                  </button>
                </div>
              </div>

              {/* Quick Search & Limit Toolbar */}
              <div className={s.rankToolbar}>
                <div className={s.rankSearchBox}>
                  <Search size={13} />
                  <input
                    type="text"
                    value={geoSearch}
                    onChange={(e) => setGeoSearch(e.target.value)}
                    placeholder={geoMode === "ward" ? "Tìm theo tên phường, quận…" : "Tìm theo tên quận…"}
                    className={s.rankSearchInput}
                  />
                </div>
                <div className={s.rankViewPills}>
                  {[20, 50, 99999].map((limitVal) => (
                    <button
                      key={limitVal}
                      type="button"
                      aria-pressed={geoLimit === limitVal}
                      onClick={() => setGeoLimit(limitVal)}
                      className={s.rankViewPill}
                    >
                      {limitVal === 99999 ? "Tất cả" : `Top ${limitVal}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div className={s.tableScroll}>
                <table>
                  <caption className={s.srOnly}>Địa bàn có nhiều mã OH trong khu vực đã chọn</caption>
                  <thead>
                    <tr>
                      <th scope="col" style={{ width: "48px", textAlign: "center" }}>
                        Hạng
                      </th>
                      <th scope="col">{geoMode === "ward" ? "Phường / Quận" : "Quận"}</th>
                      <th scope="col" style={{ width: "90px" }}>
                        Mã OH
                      </th>
                      <th scope="col" style={{ width: "130px" }}>
                        Tỷ trọng
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayGeography.map((r, i) => {
                      const rankNum = i + 1;
                      const percent = summary.total ? Math.round((r.orders / summary.total) * 100) : 0;
                      const barPercent = Math.max(5, Math.round((r.orders / maxGeoOrders) * 100));

                      return (
                        <tr
                          key={r.key}
                          className={s.clickableRow}
                          onClick={() => {
                            if (geoMode === "district") {
                              handleDistrictChange(district === r.name ? "all" : r.name);
                            } else {
                              if (r.detail) handleDistrictChange(r.detail);
                              setWard(ward === r.name ? "all" : r.name);
                            }
                          }}
                          title={`Bấm để ${
                            (geoMode === "district" ? district === r.name : ward === r.name)
                              ? "hủy lọc"
                              : "lọc theo"
                          } ${r.name}`}
                        >
                          <th scope="row" style={{ textAlign: "center", padding: "10px 8px" }}>
                            {rankNum === 1 ? (
                              <span className={s.rankBadge1}>1</span>
                            ) : rankNum === 2 ? (
                              <span className={s.rankBadge2}>2</span>
                            ) : rankNum === 3 ? (
                              <span className={s.rankBadge3}>3</span>
                            ) : (
                              <span className={s.rankBadgeNormal}>{rankNum}</span>
                            )}
                          </th>

                          <td style={{ textAlign: "left" }}>
                            <div className={s.entityRow}>
                              <div className={s.geoIconWrap}>
                                <MapPin size={14} />
                              </div>
                              <div>
                                <span className={s.entityName}>{r.name}</span>
                                {r.detail && <span className={s.entitySub}>{r.detail}</span>}
                              </div>
                            </div>
                          </td>

                          <td>
                            <strong className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100">
                              {number(r.orders)}
                            </strong>
                          </td>

                          <td>
                            <div className={s.shareVisual}>
                              <div className={s.shareLabel}>
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  {percent}%
                                </span>
                              </div>
                              <div className={s.shareTrack}>
                                <div
                                  className={s.shareFill}
                                  style={{
                                    width: `${barPercent}%`,
                                    background:
                                      rankNum <= 3
                                        ? "linear-gradient(90deg, #f59e0b, #d97706)"
                                        : "linear-gradient(90deg, #3b82f6, #1d4ed8)",
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {!displayGeography.length && (
                <p className={s.muted} style={{ padding: "16px", textAlign: "center" }}>
                  Chưa có đơn trong bộ lọc hoặc không khớp từ khóa tìm kiếm.
                </p>
              )}

              <div className={s.footnote}>
                <span>
                  Đang hiện <strong>{displayGeography.length}</strong> / <strong>{allGeography.length}</strong> {geoMode === "ward" ? "phường" : "quận"}.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFullRankingsTab(geoMode === "ward" ? "wards" : "districts");
                    setIsFullRankingsOpen(true);
                  }}
                  className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                >
                  Xem toàn bộ danh sách →
                </button>
              </div>
            </section>

            {/* PANEL 2: RIDER OH NHIỀU */}
            <section className={s.panel}>
              {/* Header */}
              <div className={s.rankPanelHeader}>
                <div className={s.rankHeaderTitle}>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400">
                    <Users size={16} />
                  </div>
                  <h2>Rider OH nhiều</h2>
                  <span className={s.rankHeaderCount}>{allRiders.length} rider</span>
                </div>
                <div className={s.rankHeaderActions}>
                  <button
                    type="button"
                    onClick={() => {
                      setFullRankingsTab("riders");
                      setIsFullRankingsOpen(true);
                    }}
                    className={s.viewAllBtn}
                    title="Mở hộp thoại tra cứu toàn bộ rider có đơn OH"
                  >
                    <Maximize2 size={13} />
                    Xem tất cả ({allRiders.length})
                  </button>
                </div>
              </div>

              {/* Quick Search & Limit Toolbar */}
              <div className={s.rankToolbar}>
                <div className={s.rankSearchBox}>
                  <Search size={13} />
                  <input
                    type="text"
                    value={riderSearch}
                    onChange={(e) => setRiderSearch(e.target.value)}
                    placeholder="Tìm tên, mã rider, khu vực, quận, phường…"
                    className={s.rankSearchInput}
                  />
                </div>
                <div className={s.rankViewPills}>
                  {[20, 50, 99999].map((limitVal) => (
                    <button
                      key={limitVal}
                      type="button"
                      aria-pressed={riderLimit === limitVal}
                      onClick={() => setRiderLimit(limitVal)}
                      className={s.rankViewPill}
                    >
                      {limitVal === 99999 ? "Tất cả" : `Top ${limitVal}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div className={s.tableScroll}>
                <table>
                  <caption className={s.srOnly}>Rider có nhiều mã OH trong khu vực đã chọn</caption>
                  <thead>
                    <tr>
                      <th scope="col" style={{ width: "48px", textAlign: "center" }}>
                        Hạng
                      </th>
                      <th scope="col">Rider / Nhân sự</th>
                      <th scope="col" style={{ width: "115px", textAlign: "center" }}>
                        Khu vực
                      </th>
                      <th scope="col" style={{ textAlign: "left" }}>
                        Quận / Phường giao
                      </th>
                      <th scope="col" style={{ width: "90px" }}>
                        Mã OH
                      </th>
                      <th scope="col" style={{ width: "130px" }}>
                        Tỷ trọng
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRiders.map((r, i) => {
                      const rankNum = i + 1;
                      const percent = summary.total ? Math.round((r.orders / summary.total) * 100) : 0;
                      const barPercent = Math.max(5, Math.round((r.orders / maxRiderOrders) * 100));
                      const initial = r.name.trim().charAt(0).toUpperCase();

                      return (
                        <tr
                          key={r.key}
                          className={s.clickableRow}
                          onClick={() => {
                            setOrderDialogQuery(r.name);
                            setIsOrderDialogOpen(true);
                          }}
                          title={`Bấm để xem danh sách mã đơn của rider ${r.name}`}
                        >
                          <th scope="row" style={{ textAlign: "center", padding: "10px 8px" }}>
                            {rankNum === 1 ? (
                              <span className={s.rankBadge1}>1</span>
                            ) : rankNum === 2 ? (
                              <span className={s.rankBadge2}>2</span>
                            ) : rankNum === 3 ? (
                              <span className={s.rankBadge3}>3</span>
                            ) : (
                              <span className={s.rankBadgeNormal}>{rankNum}</span>
                            )}
                          </th>

                          <td style={{ textAlign: "left" }}>
                            <div className={s.entityRow}>
                              <div className={s.avatarWrap}>{initial}</div>
                              <div>
                                <span className={s.entityName}>{r.name}</span>
                                {r.detail && r.detail !== "Chưa có mã rider" ? (
                                  <span className={s.driverCodePill}>ID: {r.detail}</span>
                                ) : (
                                  <span className={s.entitySub}>Chưa có mã rider</span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td style={{ textAlign: "center" }}>
                            <span className={getAreaBadgeClass(r.area)}>
                              {r.area || "Chưa rõ KV"}
                            </span>
                          </td>

                          <td style={{ textAlign: "left" }}>
                            <div className={s.geoCell}>
                              <span className={s.geoDistrict}>{r.district || "Chưa rõ quận"}</span>
                              <span
                                className={s.geoWard}
                                title={
                                  r.wards && r.wards.length > 1
                                    ? `Các phường giao: ${r.wards.join(", ")}`
                                    : r.ward
                                }
                              >
                                {r.ward || "Chưa rõ phường"}
                                {r.wards && r.wards.length > 1 && (
                                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                                    {" "}(+{r.wards.length - 1})
                                  </span>
                                )}
                              </span>
                            </div>
                          </td>

                          <td>
                            <strong className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100">
                              {number(r.orders)}
                            </strong>
                          </td>

                          <td>
                            <div className={s.shareVisual}>
                              <div className={s.shareLabel}>
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  {percent}%
                                </span>
                              </div>
                              <div className={s.shareTrack}>
                                <div
                                  className={s.shareFill}
                                  style={{
                                    width: `${barPercent}%`,
                                    background:
                                      rankNum <= 3
                                        ? "linear-gradient(90deg, #ea580c, #c2410c)"
                                        : "linear-gradient(90deg, #0284c7, #0369a1)",
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {!displayRiders.length && (
                <p className={s.muted} style={{ padding: "16px", textAlign: "center" }}>
                  Chưa có đơn trong bộ lọc hoặc không khớp từ khóa tìm kiếm.
                </p>
              )}

              <div className={s.footnote}>
                <span>
                  Đang hiện <strong>{displayRiders.length}</strong> / <strong>{allRiders.length}</strong> rider.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFullRankingsTab("riders");
                    setIsFullRankingsOpen(true);
                  }}
                  className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                >
                  Xem toàn bộ danh sách →
                </button>
              </div>
            </section>
          </div>
        </section>
      )}

      {/* Reasons & Hourly Distribution */}
      {!report ? (
        <div className={s.empty}>
          <Database size={28} />
          <h3>Chưa có pivot cho {shortDate(day)}</h3>
          <p>Bật thu thập tại Nguồn dữ liệu → OH Delivery. Lịch sử được ghi từ khi worker bắt đầu chạy.</p>
          <Link href="/data-sources">
            Mở nguồn dữ liệu <ArrowUpRight size={15} />
          </Link>
        </div>
      ) : (
        <div className={s.analysis}>
          {/* Lý do OH Panel */}
          <section className={s.panel}>
            <div className={s.panelTitle}>
              <h2>Lý do OH</h2>
              <span>
                {area === "all" ? "Tất cả KV" : area}
                {reason !== "all" ? ` · Đang lọc: ${reason}` : ""}
              </span>
            </div>
            {reasons.length ? (
              reasons.map(([code, n]) => (
                <div
                  className={`${s.reason} ${reason === code ? s.activeReason : ""}`}
                  key={code}
                  onClick={() => setReason(reason === code ? "all" : code)}
                  title={`Bấm để ${reason === code ? "hủy lọc" : "lọc theo"} lý do này`}
                >
                  <div>
                    <span>
                      {reasonLabel(code)} <small>{code === "unknown" ? "" : `(${code})`}</small>
                    </span>
                    <strong>
                      {number(n)}{" "}
                      <small>{summary.total ? Math.round((n / summary.total) * 100) : 0}%</small>
                    </strong>
                  </div>
                  <div className={s.track}>
                    <i style={{ width: `${(n / Math.max(reasons[0][1], 1)) * 100}%` }} />
                  </div>
                </div>
              ))
            ) : (
              <p className={s.muted}>Không có đơn phù hợp bộ lọc.</p>
            )}
            <p className={s.footnote}>Bấm vào từng lý do để lọc nhanh dữ liệu toàn bộ trang.</p>
          </section>

          {/* Phân bố giờ OH Panel */}
          <section className={s.panel}>
            <div className={s.panelTitle}>
              <h2>
                <Clock3 size={17} /> Phân bố giờ OH
              </h2>
              <span>UTC+7</span>
            </div>
            <p className={s.muted}>Giờ OH của đơn tại lần đầu ghi nhận trong ngày {shortDate(day)}.</p>
            <div className={s.hourLegend} aria-label="Thang màu theo số đơn so với giờ cao nhất">
              <span>Ít OH</span>
              {[
                [0, "0 đơn"],
                [1, "≤25% đỉnh"],
                [2, ">25–50%"],
                [3, ">50–75%"],
                [4, ">75% đỉnh"],
              ].map(([level, label]) => (
                <span key={level}><i data-level={level} aria-hidden="true" />{label}</span>
              ))}
              <span>Nhiều OH</span>
            </div>
            <p className={s.hourPeak}>
              {peak > 0
                ? `Giờ cao nhất: ${peakHours.join(", ")} · ${number(peak)} đơn/giờ`
                : "Chưa có đơn OH xác định giờ trong bộ lọc này."}
            </p>
            <div className={s.hourGrid}>
              {hours.map((n, h) => (
                <div
                  key={h}
                  className={s.hour}
                  data-level={n === 0 ? 0 : Math.ceil((n / peak) * 4)}
                  title={`${String(h).padStart(2, "0")}:00 – ${number(n)} đơn OH${peak > 0 ? ` (${Math.round((n / peak) * 100)}% so với giờ cao nhất)` : ""}`}
                >
                  <small>{String(h).padStart(2, "0")}:00</small>
                  <strong>{number(n)}</strong>
                </div>
              ))}
            </div>
            <p className={s.muted}>
              Khác ngày / chưa rõ giờ:{" "}
              <strong>
                {number(cells.filter((c) => c.hour === -1).reduce((n, c) => n + c.orders, 0))}
              </strong>{" "}
              đơn.
            </p>
          </section>
        </div>
      )}

      {/* Lịch sử Pivot khu vực × ngày */}
      <section className={s.panel}>
        <div className={s.panelTitle}>
          <div>
            <div className={s.eyebrow}>LỊCH SỬ ĐƯỢC LƯU</div>
            <h2>Pivot khu vực × ngày</h2>
          </div>
          <span>{data.reports.length} ngày có dữ liệu</span>
        </div>
        <p className={s.muted}>
          Bấm ngày để phân tích. “—” là chưa đồng bộ; “0” là đã đồng bộ và không có đơn trong bộ lọc.
        </p>
        <div className={s.tableScroll}>
          <table>
            <caption className={s.srOnly}>Số đơn OH theo khu vực và ngày</caption>
            <thead>
              <tr>
                <th scope="col">Khu vực</th>
                {days.map((d) => (
                  <th key={d} scope="col">
                    <button onClick={() => setDay(d)} aria-pressed={day === d} title={d}>
                      {shortDate(d)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {OH_AREAS.filter((a) => area === "all" || area === a).map((a) => (
                <tr key={a}>
                  <th scope="row">
                    <span
                      className={s.dot}
                      style={{ background: OH_COLORS[OH_AREAS.indexOf(a)] }}
                    />
                    {a}
                  </th>
                  {days.map((d) => (
                    <td key={d} className={day === d ? s.activeCell : undefined}>
                      {hasDay(d) ? number(pivot(a, d)) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Tổng</th>
                {days.map((d) => (
                  <td key={d}>
                    {hasDay(d)
                      ? number(
                          OH_AREAS.filter((a) => area === "all" || area === a).reduce(
                            (n, a) => n + pivot(a, d),
                            0
                          )
                        )
                      : "—"}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        <p className={s.footnote}>
          Một mã có thể được tính ở các ngày khác nhau. Bộ lọc áp dụng cho cả bảng tổng hợp pivot.
        </p>
      </section>

      {/* Order Detail Modal Dialog */}
      <OHOrderDialog
        isOpen={isOrderDialogOpen}
        onClose={() => setIsOrderDialogOpen(false)}
        day={day}
        today={today}
        filters={{ status, reason, area, district, ward }}
        reasonLabelMap={reasonLabelMap}
        initialQuery={orderDialogQuery}
      />

      {/* Full Rankings Dialog (ALL Riders, ALL Wards, ALL Districts) */}
      <OHFullRankingsDialog
        isOpen={isFullRankingsOpen}
        onClose={() => setIsFullRankingsOpen(false)}
        initialTab={fullRankingsTab}
        day={day}
        areaFilter={area}
        totalOrders={summary.total}
        riders={allRiders}
        wards={allWards}
        districts={allDistricts}
        onFilterRider={(name, code) => {
          setOrderDialogQuery(name);
          setIsOrderDialogOpen(true);
        }}
        onFilterWard={(wName, dName) => {
          if (dName) handleDistrictChange(dName);
          setWard(wName);
        }}
      />
    </div>
  );
}
