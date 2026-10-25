"use client";

import { useId, useRef, useState, useEffect, useMemo } from "react";
import {
  X,
  Search,
  Download,
  Copy,
  Users,
  MapPin,
  Building2,
  TrendingUp,
  ArrowUpDown,
  Filter,
  CheckCircle2,
  Eye,
} from "lucide-react";
import type { OHRank } from "@/lib/onhold/model";

export type OHFullRankingsDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "riders" | "wards" | "districts";
  day: string;
  areaFilter: string;
  totalOrders: number;
  riders: OHRank[];
  wards: OHRank[];
  districts: OHRank[];
  onFilterRider?: (riderName: string, riderCode: string) => void;
  onFilterWard?: (wardName: string, districtName?: string) => void;
  onViewOrdersForRider?: (riderName: string) => void;
  onViewOrdersForWard?: (wardName: string, districtName?: string) => void;
};

export function OHFullRankingsDialog({
  isOpen,
  onClose,
  initialTab = "riders",
  day,
  areaFilter,
  totalOrders,
  riders,
  wards,
  districts,
  onFilterRider,
  onFilterWard,
  onViewOrdersForRider,
  onViewOrdersForWard,
}: OHFullRankingsDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [tab, setTab] = useState<"riders" | "wards" | "districts">(initialTab);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"orders-desc" | "orders-asc" | "name-asc">("orders-desc");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setSearch("");
      const node = dialog.current;
      if (!node?.open) node?.showModal();
    } else {
      dialog.current?.close();
    }
  }, [isOpen, initialTab]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const rawList = tab === "riders" ? riders : tab === "wards" ? wards : districts;

  // Filter and sort
  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = rawList.filter((item) => {
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.detail && item.detail.toLowerCase().includes(q)) ||
        (item.area && item.area.toLowerCase().includes(q)) ||
        (item.district && item.district.toLowerCase().includes(q)) ||
        (item.ward && item.ward.toLowerCase().includes(q)) ||
        (item.wards && item.wards.some((w) => w.toLowerCase().includes(q)))
      );
    });

    if (sortBy === "orders-desc") {
      result = [...result].sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name, "vi"));
    } else if (sortBy === "orders-asc") {
      result = [...result].sort((a, b) => a.orders - b.orders || a.name.localeCompare(b.name, "vi"));
    } else if (sortBy === "name-asc") {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name, "vi"));
    }

    return result;
  }, [rawList, search, sortBy]);

  const maxOrders = useMemo(() => {
    return rawList.length ? Math.max(...rawList.map((r) => r.orders), 1) : 1;
  }, [rawList]);

  function exportCsv() {
    const isRider = tab === "riders";
    const isWard = tab === "wards";
    const title = isRider ? "Rider" : isWard ? "Phuong" : "Quan";

    const headers = isRider
      ? [
          "Hạng",
          "Tên Rider",
          "Mã Rider",
          "Khu vực",
          "Quận giao",
          "Phường giao",
          "Số mã OH",
          "Tỷ trọng (%)",
          "Ngày phân tích",
          "Khu vực lọc",
        ]
      : [
          "Hạng",
          isWard ? "Phường / Xã" : "Quận / Huyện",
          isWard ? "Thuộc Quận" : "Khu vực",
          "Khu vực",
          "Số mã OH",
          "Tỷ trọng (%)",
          "Ngày phân tích",
          "Khu vực lọc",
        ];

    const rows = filteredList.map((item, idx) =>
      isRider
        ? [
            idx + 1,
            item.name,
            item.detail || "",
            item.area || "",
            item.district || "",
            item.wards?.length ? item.wards.join("; ") : item.ward || "",
            item.orders,
            totalOrders ? `${((item.orders / totalOrders) * 100).toFixed(1)}%` : "0%",
            day,
            areaFilter,
          ]
        : [
            idx + 1,
            item.name,
            item.detail || "",
            item.area || "",
            item.orders,
            totalOrders ? `${((item.orders / totalOrders) * 100).toFixed(1)}%` : "0%",
            day,
            areaFilter,
          ]
    );

    const csvContent =
      "\ufeff" +
      [headers, ...rows]
        .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
        .join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Danh-sach-OH-${title}-${day}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Đã xuất ${filteredList.length} dòng ra file CSV!`);
  }

  async function copyList() {
    const text = filteredList
      .map((r, i) => {
        const loc =
          tab === "riders"
            ? ` [${r.area || "Chưa rõ KV"} - ${r.district || ""}${r.ward ? ` / ${r.ward}` : ""}]`
            : "";
        return `${i + 1}. ${r.name}${r.detail ? ` (${r.detail})` : ""}${loc}: ${r.orders} đơn (${
          totalOrders ? Math.round((r.orders / totalOrders) * 100) : 0
        }%)`;
      })
      .join("\n");
    await navigator.clipboard.writeText(text);
    showToast(`Đã sao chép danh sách ${filteredList.length} mục vào clipboard!`);
  }

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialog}
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 m-auto w-[min(1240px,96vw)] max-w-none overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-950/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90dvh] flex-col">
        {/* Header */}
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-850">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Toàn bộ danh sách · {day}
              </span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-950/70 dark:text-blue-300">
                {areaFilter === "all" ? "Tất cả khu vực" : areaFilter}
              </span>
            </div>
            <h2 id={titleId} className="mt-1 text-xl font-bold tracking-tight">
              Thống kê toàn diện Rider & Địa bàn Onhold
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Xem đầy đủ toàn bộ rider và địa bàn có đơn OH trong ngày, không bị giới hạn Top 25.
            </p>
          </div>
          <button
            autoFocus
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </header>

        {/* Tab Switcher & Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100/80 p-1 dark:border-slate-700 dark:bg-slate-800">
            <button
              onClick={() => setTab("riders")}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                tab === "riders"
                  ? "bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-blue-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <Users size={14} />
              Tất cả Rider ({riders.length})
            </button>
            <button
              onClick={() => setTab("wards")}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                tab === "wards"
                  ? "bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-blue-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <MapPin size={14} />
              Tất cả Phường ({wards.length})
            </button>
            <button
              onClick={() => setTab("districts")}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                tab === "districts"
                  ? "bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-blue-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <Building2 size={14} />
              Quận / Huyện ({districts.length})
            </button>
          </div>

          {/* Search & Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  tab === "riders"
                    ? "Tìm tên hoặc mã rider…"
                    : tab === "wards"
                    ? "Tìm tên phường hoặc quận…"
                    : "Tìm tên quận…"
                }
                className="h-9 w-full rounded-lg border border-slate-200 bg-transparent pl-8 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700"
              />
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-9 rounded-lg border border-slate-200 bg-transparent px-3 text-xs font-medium text-slate-700 outline-none dark:border-slate-700 dark:text-slate-300"
            >
              <option value="orders-desc">Đơn OH nhiều nhất</option>
              <option value="orders-asc">Đơn OH ít nhất</option>
              <option value="name-asc">Tên A-Z</option>
            </select>

            {/* Copy button */}
            <button
              onClick={() => void copyList()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              title="Sao chép toàn bộ danh sách hiện tại"
            >
              <Copy size={13} />
              Sao chép
            </button>

            {/* Export CSV button */}
            <button
              onClick={exportCsv}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-700"
              title="Xuất bảng này ra file CSV"
            >
              <Download size={13} />
              Xuất CSV
            </button>
          </div>
        </div>

        {/* Toast notification */}
        {toast && (
          <div
            role="status"
            className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-6 py-2 text-xs font-medium text-emerald-800 dark:border-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-300"
          >
            <CheckCircle2 size={14} className="text-emerald-600" />
            {toast}
          </div>
        )}

        {/* Table Body */}
        <div className="flex-1 overflow-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <tr>
                <th className="w-14 px-4 py-3 text-center">Hạng</th>
                <th className="px-4 py-3">
                  {tab === "riders" ? "Rider / Nhân sự" : tab === "wards" ? "Phường / Xã" : "Quận / Huyện"}
                </th>
                <th className="w-28 px-4 py-3 text-center">Khu vực</th>
                <th className="px-4 py-3">
                  {tab === "riders" ? "Quận / Phường giao" : tab === "wards" ? "Thuộc Quận / Huyện" : "Chi tiết"}
                </th>
                <th className="w-24 px-4 py-3 text-right">Mã OH</th>
                <th className="w-44 px-4 py-3">Tỷ trọng & Phân bổ</th>
                <th className="w-28 px-4 py-3 text-center">Tác vụ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredList.map((item, idx) => {
                const rank = idx + 1;
                const percent = totalOrders ? Math.round((item.orders / totalOrders) * 100) : 0;
                const barWidth = Math.max(4, Math.round((item.orders / maxOrders) * 100));

                const areaBadgeClass = item.area?.includes("1")
                  ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
                  : item.area?.includes("2")
                  ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
                  : item.area?.includes("3")
                  ? "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800"
                  : item.area?.includes("4")
                  ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
                  : item.area?.includes("5")
                  ? "bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-950 dark:text-pink-300 dark:border-pink-800"
                  : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700";

                return (
                  <tr
                    key={item.key || item.name + idx}
                    className="transition hover:bg-blue-50/40 dark:hover:bg-slate-800/50"
                  >
                    {/* Rank Badge */}
                    <td className="px-4 py-3 text-center">
                      {rank === 1 ? (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 font-bold text-white shadow-sm">
                          1
                        </span>
                      ) : rank === 2 ? (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-400 font-bold text-white shadow-sm">
                          2
                        </span>
                      ) : rank === 3 ? (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-700 font-bold text-white shadow-sm">
                          3
                        </span>
                      ) : (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 font-mono text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {rank}
                        </span>
                      )}
                    </td>

                    {/* Name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {tab === "riders" ? (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            {item.name.trim().charAt(0).toUpperCase()}
                          </div>
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            <MapPin size={15} />
                          </div>
                        )}
                        <div>
                          <strong className="block text-slate-800 dark:text-slate-100">{item.name}</strong>
                          {tab === "riders" && item.detail && item.detail !== "Chưa có mã rider" && (
                            <span className="font-mono text-[10px] text-slate-400">ID: {item.detail}</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Khu vuc */}
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${areaBadgeClass}`}>
                        {item.area || areaFilter || "Chưa rõ KV"}
                      </span>
                    </td>

                    {/* Detail / Quan / Phuong */}
                    <td className="px-4 py-3">
                      {tab === "riders" ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {item.district || "Chưa rõ quận"}
                          </span>
                          <span
                            className="text-[11px] text-slate-500 dark:text-slate-400"
                            title={item.wards?.length && item.wards.length > 1 ? `Các phường giao: ${item.wards.join(", ")}` : item.ward}
                          >
                            {item.ward || "Chưa rõ phường"}
                            {item.wards && item.wards.length > 1 && (
                              <span className="font-semibold text-blue-600 dark:text-blue-400">
                                {" "}(+{item.wards.length - 1})
                              </span>
                            )}
                          </span>
                        </div>
                      ) : tab === "wards" ? (
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {item.detail || "Chưa rõ quận"}
                        </span>
                      ) : (
                        <span className="font-medium text-slate-500 dark:text-slate-400">
                          {item.detail || "—"}
                        </span>
                      )}
                    </td>

                    {/* Orders count */}
                    <td className="px-4 py-3 text-right">
                      <strong className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100">
                        {item.orders.toLocaleString("vi-VN")}
                      </strong>
                    </td>

                    {/* Share percent & Visual bar */}
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">{percent}%</span>
                          <span className="text-[10px] text-slate-400">
                            {((item.orders / maxOrders) * 100).toFixed(0)}% đỉnh
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              rank <= 3 ? "bg-amber-500" : percent >= 5 ? "bg-blue-600" : "bg-sky-400"
                            }`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-center">
                      {tab === "riders" ? (
                        <button
                          onClick={() => {
                            if (onFilterRider) onFilterRider(item.name, item.detail);
                            if (onViewOrdersForRider) onViewOrdersForRider(item.name);
                            onClose();
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50/70 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300"
                          title="Lọc và xem mã đơn của rider này"
                        >
                          <Eye size={12} />
                          Mã đơn
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            if (onFilterWard) onFilterWard(item.name, item.detail);
                            if (onViewOrdersForWard) onViewOrdersForWard(item.name, item.detail);
                            onClose();
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          title="Lọc theo địa bàn này"
                        >
                          <Filter size={12} />
                          Lọc
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!filteredList.length && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400">
                    Không tìm thấy mục nào khớp với &quot;{search}&quot;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-850">
          <div>
            Đang hiển thị <strong>{filteredList.length}</strong> / <strong>{rawList.length}</strong> mục
            {search && <span> (lọc theo từ khóa)</span>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            Đóng
          </button>
        </footer>
      </div>
    </dialog>
  );
}
