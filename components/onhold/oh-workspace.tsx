"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
import { OHOrderDialog } from "./oh-order-dialog";
import s from "./oh-workspace.module.css";

const nf = new Intl.NumberFormat("vi-VN");
const number = (n: number) => nf.format(n);
const shortDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

export function OHWorkspace({
  initialData,
  initialError,
  from,
  today,
}: {
  initialData: OHData;
  initialError: string;
  from: string;
  today: string;
}) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(today);
  const [range, setRange] = useState({ from, to: today });
  const [geoMode, setGeoMode] = useState<"district" | "ward">("ward");
  const [day, setDay] = useState(today);

  // 5 Dimensional Filters requested by user:
  // 1. Trạng thái (status: "all" | "5" | "1")
  // 2. Lý do OH (reason: "all" | code)
  // 3. Khu vực (area: "all" | OH_AREAS)
  // 4. Quận (district: "all" | name)
  // 5. Phường (ward: "all" | name)
  const [status, setStatus] = useState("all");
  const [reason, setReason] = useState("all");
  const [area, setArea] = useState("all");
  const [district, setDistrict] = useState("all");
  const [ward, setWard] = useState("all");

  // Modal Dialog and Export state
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);
  const [exportingOrders, setExportingOrders] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3500);
  };

  // Base filtered by the 4 dimensions (excluding area) across the date range (for pivot table and KV cards)
  const baseCrossDate = useMemo(() => {
    return data.cells.filter((c) => {
      if (status !== "all" && String(c.status) !== status) return false;
      if (reason !== "all" && c.reason !== reason) return false;
      if (district !== "all" && (c.district || "Chưa rõ quận") !== district) return false;
      if (ward !== "all" && (c.ward || "Chưa rõ phường") !== ward) return false;
      return true;
    });
  }, [data.cells, status, reason, district, ward]);

  // Cells strictly matching ALL 5 filters for the selected `day`
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

  // List of available reasons in the selected day matching status & area
  const availableReasons = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of data.cells) {
      if (c.report_date !== day) continue;
      if (status !== "all" && String(c.status) !== status) continue;
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
  }, [data.cells, day, status, area, reasonLabelMap]);

  // List of available districts in the selected day matching area, status & reason
  const availableDistricts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of data.cells) {
      if (c.report_date !== day) continue;
      if (area !== "all" && c.area !== area) continue;
      if (status !== "all" && String(c.status) !== status) continue;
      if (reason !== "all" && c.reason !== reason) continue;
      const d = c.district || "Chưa rõ quận";
      counts.set(d, (counts.get(d) || 0) + c.orders);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi"));
  }, [data.cells, day, area, status, reason]);

  // List of available wards in the selected day matching district, area, status & reason
  const availableWards = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of data.cells) {
      if (c.report_date !== day) continue;
      if (area !== "all" && c.area !== area) continue;
      if (district !== "all" && (c.district || "Chưa rõ quận") !== district) continue;
      if (status !== "all" && String(c.status) !== status) continue;
      if (reason !== "all" && c.reason !== reason) continue;
      const w = c.ward || "Chưa rõ phường";
      counts.set(w, (counts.get(w) || 0) + c.orders);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi"));
  }, [data.cells, day, area, district, status, reason]);

  // Reason breakdown for the current filtered cell list
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
  const peak = Math.max(...hours, 1);
  const geography = ohRankings(cells, geoMode);
  const riders = ohRankings(cells, "rider");

  const timeLabel = (value: string) =>
    new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const cumulative = report?.collection_mode === "cumulative";
  const reasonLabel = (code: string) =>
    cells.find((c) => c.reason === code && c.reason_label)?.reason_label ||
    reasonLabelMap[code] ||
    reasonNameVi(code) ||
    reasonName(code);

  const activeFilterCount =
    (status !== "all" ? 1 : 0) +
    (reason !== "all" ? 1 : 0) +
    (area !== "all" ? 1 : 0) +
    (district !== "all" ? 1 : 0) +
    (ward !== "all" ? 1 : 0);

  function resetFilters() {
    setStatus("all");
    setReason("all");
    setArea("all");
    setDistrict("all");
    setWard("all");
  }

  function handleAreaChange(newArea: string) {
    setArea(newArea);
    // If current district is not in new area, reset district & ward
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
          "Mã đơn chi tiết chỉ lưu trong ngày hiện tại. Ngày này đã chốt qua ngày và snapshot đã giải phóng, chỉ lưu pivot thống kê."
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
          "Mã đơn chi tiết chỉ lưu trong ngày hiện tại. Ngày này đã chốt qua ngày và snapshot đã giải phóng, chỉ lưu pivot thống kê."
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

      {/* Info notice */}
      <div className={s.notice}>
        <Database size={18} />
        <p>
          <strong>Ghi nhận OH lũy kế.</strong> Mỗi mã được tính một lần/ngày, giữ lại dù sau đó hub nhận về hoặc đổi
          trạng thái. Khóa khử trùng và mã đơn chi tiết được lưu trong ngày; khi chốt sang ngày mới, snapshot chi tiết
          sẽ giải phóng và bảo lưu thống kê pivot tổng hợp.
        </p>
      </div>

      {/* Date Range Toolbar */}
      <form
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
            {status !== "all" && (
              <span className={s.activeChip}>
                Trạng thái: {status === "5" ? "Onhold (5)" : "Received (1)"}
                <button title="Bỏ lọc trạng thái" onClick={() => setStatus("all")}>
                  ×
                </button>
              </span>
            )}
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
          {/* 1. Filter Trạng thái */}
          <label>
            Trạng thái lúc ghi nhận
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Tất cả trạng thái</option>
              <option value="5">Ghi nhận ở Onhold · 5</option>
              <option value="1">Ghi nhận ở Received · 1</option>
            </select>
          </label>

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
          {/* Xem danh sách mã đơn */}
          <button
            type="button"
            className={s.primaryAction}
            onClick={() => setIsOrderDialogOpen(true)}
            title={
              isToday
                ? "Xem danh sách mã vận đơn chi tiết khớp với bộ lọc hiện tại"
                : "Xem mã đơn (lưu ý: snapshot chi tiết qua ngày sẽ giải phóng theo quy chế)"
            }
          >
            <Eye size={16} />
            Xem mã đơn ({report ? number(summary.total) : "0"})
          </button>

          {/* Xuất mã đơn CSV */}
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

          {/* Sao chép mã đơn */}
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

          {/* Reset Filters */}
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
          ["Ghi nhận ở Onhold", summary.held, "Trạng thái ở lần đầu ghi nhận = 5"],
          ["Ghi nhận ở Received", summary.received, "Trạng thái ở lần đầu ghi nhận = 1"],
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
                <strong>Dữ liệu lịch sử ({shortDate(day)})</strong> · Snapshot chi tiết mã đơn đã tự động giải phóng
                sau khi chốt ngày; dữ liệu lưu trữ dưới dạng pivot tổng hợp để phân tích và đối soát.
              </>
            ) : cumulative ? (
              <>
                <strong>{report.finalized_at ? "Đã chốt cuối ngày" : "Đang thu thập lũy kế trong ngày"}</strong> · Bắt
                đầu {report.collection_started_at ? timeLabel(report.collection_started_at) : "—"}
                {report.finalized_at
                  ? ` · Chốt ${timeLabel(report.finalized_at)}`
                  : " · Tự động chốt lúc 00:00 giờ Việt Nam."}{" "}
                Chức năng xem và xuất mã đơn hoạt động đầy đủ trong ngày.
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

      {/* Rankings Section (Địa bàn & Rider) */}
      {report && (
        <section className={s.rankSection} aria-label="Xếp hạng OH theo khu vực và địa bàn">
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
              {shortDate(day)} · {number(summary.total)} mã
            </span>
          </div>
          <div className={s.analysis}>
            {/* Quận / Phường Panel */}
            <section className={s.panel}>
              <div className={s.panelTitle}>
                <h2>Quận / phường</h2>
                <div className={s.segment}>
                  <button
                    aria-pressed={geoMode === "district"}
                    onClick={() => setGeoMode("district")}
                  >
                    Quận
                  </button>
                  <button aria-pressed={geoMode === "ward"} onClick={() => setGeoMode("ward")}>
                    Phường
                  </button>
                </div>
              </div>
              <div className={s.tableScroll}>
                <table>
                  <caption className={s.srOnly}>Địa bàn có nhiều mã OH trong khu vực đã chọn</caption>
                  <thead>
                    <tr>
                      <th scope="col">{geoMode === "ward" ? "Phường / quận" : "Quận"}</th>
                      <th scope="col">Mã OH</th>
                      <th scope="col">Tỷ trọng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {geography.slice(0, 25).map((r, i) => (
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
                        <th scope="row">
                          <span className={s.rankNumber}>{i + 1}</span>
                          {r.name}
                          {r.detail && <small className={s.rowDetail}>{r.detail}</small>}
                        </th>
                        <td>
                          <strong>{number(r.orders)}</strong>
                        </td>
                        <td>{summary.total ? Math.round((r.orders / summary.total) * 100) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!geography.length && <p className={s.muted}>Chưa có đơn trong bộ lọc.</p>}
              <p className={s.footnote}>
                Bấm vào một hàng để lọc trực tiếp theo Quận/Phường đó. Top 25 theo số mã OH.
              </p>
            </section>

            {/* Rider Panel */}
            <section className={s.panel}>
              <div className={s.panelTitle}>
                <h2>Rider OH nhiều</h2>
                <span>Top 25 · {riders.length} rider/nhóm</span>
              </div>
              <div className={s.tableScroll}>
                <table>
                  <caption className={s.srOnly}>Rider có nhiều mã OH trong khu vực đã chọn</caption>
                  <thead>
                    <tr>
                      <th scope="col">Rider / mã rider</th>
                      <th scope="col">Mã OH</th>
                      <th scope="col">Tỷ trọng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {riders.slice(0, 25).map((r, i) => (
                      <tr key={r.key}>
                        <th scope="row">
                          <span className={s.rankNumber}>{i + 1}</span>
                          {r.name}
                          <small className={s.rowDetail}>{r.detail}</small>
                        </th>
                        <td>
                          <strong>{number(r.orders)}</strong>
                        </td>
                        <td>{summary.total ? Math.round((r.orders / summary.total) * 100) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!riders.length && <p className={s.muted}>Chưa có đơn trong bộ lọc.</p>}
              <p className={s.footnote}>
                Rider tại lần đầu ghi nhận; không suy đoán rider khi SPX đã xóa thông tin.
              </p>
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
            <div className={s.hourGrid}>
              {hours.map((n, h) => (
                <div
                  key={h}
                  className={s.hour}
                  style={{
                    background: n ? `rgba(37,99,235,${0.09 + (0.19 * n) / peak})` : undefined,
                  }}
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
      />
    </div>
  );
}
