"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  RefreshCcw,
  Search,
  X,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import type { OHOrder, OHOrdersResult } from "@/lib/onhold/model";
import { reasonNameVi, reasonName } from "@/lib/onhold/model";

export type OHOrderDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  day: string;
  today: string;
  filters: {
    status: string;
    reason: string;
    area: string;
    district: string;
    ward: string;
  };
  reasonLabelMap?: Record<string, string>;
  initialQuery?: string;
};

export function OHOrderDialog({
  isOpen,
  onClose,
  day,
  today,
  filters,
  reasonLabelMap = {},
  initialQuery = "",
}: OHOrderDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [result, setResult] = useState<OHOrdersResult>({
    has_snapshot: true,
    total: 0,
    orders: [],
    limit: 50,
    offset: 0,
  });
  const [page, setPage] = useState(0);
  const [input, setInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    if (isOpen) {
      setInput(initialQuery || "");
      setQuery(initialQuery || "");
      setPage(0);
    }
  }, [isOpen, initialQuery]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const node = dialog.current;
    if (isOpen) {
      if (!node?.open) node?.showModal();
    } else {
      if (node?.open) node?.close();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");

    const params = new URLSearchParams({
      day,
      area: filters.area,
      status: filters.status,
      reason: filters.reason,
      district: filters.district,
      ward: filters.ward,
      q: query,
      page: String(page),
      limit: "50",
    });

    fetch(`/api/onhold/orders?${params}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Không tải được danh sách mã đơn OH.");
        }
        return res.json();
      })
      .then((data: OHOrdersResult) => {
        if (!controller.signal.aborted) {
          setResult(data);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Không tải được mã đơn.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [isOpen, day, filters.area, filters.status, filters.reason, filters.district, filters.ward, query, page, retry]);

  if (!isOpen) return null;

  async function copyToClipboard(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(message);
      setTimeout(() => setNotice(""), 3500);
    } catch {
      setNotice("Không thể sao chép tự động. Vui lòng chọn văn bản để sao chép.");
      setTimeout(() => setNotice(""), 3500);
    }
  }

  async function copyAllFiltered() {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        day,
        area: filters.area,
        status: filters.status,
        reason: filters.reason,
        district: filters.district,
        ward: filters.ward,
        q: query,
        export: "1",
      });
      const res = await fetch(`/api/onhold/orders?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Không thể tải toàn bộ mã đơn để sao chép.");
      const data: OHOrdersResult = await res.json();
      const codes = data.orders.map((o) => o.order_code).filter(Boolean);
      await copyToClipboard(codes.join("\n"), `Đã sao chép toàn bộ ${codes.length.toLocaleString("vi-VN")} mã đơn!`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi sao chép mã đơn.");
    } finally {
      setExporting(false);
    }
  }

  async function downloadCsv() {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        day,
        area: filters.area,
        status: filters.status,
        reason: filters.reason,
        district: filters.district,
        ward: filters.ward,
        q: query,
        export: "1",
      });
      const res = await fetch(`/api/onhold/orders?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Không tải được dữ liệu xuất mã đơn.");
      const data: OHOrdersResult = await res.json();

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

      const rows = data.orders.map((o) => [
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
        filters.area !== "all" ? filters.area.replace(/\s+/g, "") : "",
        filters.district !== "all" ? filters.district.replace(/\s+/g, "") : "",
        filters.reason !== "all" ? `Lydo-${filters.reason}` : "",
      ]
        .filter(Boolean)
        .join("-");
      link.href = url;
      link.download = `Ma-don-OH-${day}${filterSuffix ? `-${filterSuffix}` : ""}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải file CSV.");
    } finally {
      setExporting(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(result.total / (result.limit || 50)));

  return (
    <dialog
      ref={dialog}
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 m-auto w-[min(1280px,96vw)] max-w-none overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-950/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90dvh] flex-col">
        {/* Modal Header */}
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-850">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Chi tiết Onhold · {day}
              </span>
              {day === today ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                  Lũy kế trong ngày
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                  Lịch sử
                </span>
              )}
            </div>
            <h2 id={titleId} className="mt-1 text-xl font-bold tracking-tight">
              Danh sách mã đơn Onhold
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Bộ lọc:</span>
              <span className="rounded bg-slate-200/80 px-2 py-0.5 dark:bg-slate-800">
                {filters.status === "all" ? "Tất cả trạng thái" : filters.status === "5" ? "Onhold (5)" : "Received (1)"}
              </span>
              <span className="rounded bg-slate-200/80 px-2 py-0.5 dark:bg-slate-800">
                {filters.area === "all" ? "Tất cả KV" : filters.area}
              </span>
              {filters.district !== "all" && (
                <span className="rounded bg-slate-200/80 px-2 py-0.5 dark:bg-slate-800">{filters.district}</span>
              )}
              {filters.ward !== "all" && (
                <span className="rounded bg-slate-200/80 px-2 py-0.5 dark:bg-slate-800">{filters.ward}</span>
              )}
              {filters.reason !== "all" && (
                <span className="rounded bg-slate-200/80 px-2 py-0.5 dark:bg-slate-800">
                  Lý do: {reasonLabelMap[filters.reason] || reasonNameVi(filters.reason)} ({filters.reason})
                </span>
              )}
            </div>
          </div>
          <button
            autoFocus
            onClick={onClose}
            aria-label="Đóng danh sách mã đơn"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </header>

        {/* Notice for historical days with no snapshot */}
        {!result.has_snapshot ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <div className="rounded-full bg-amber-100 p-4 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
              <AlertCircle size={36} />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
              Mã đơn chi tiết được lưu trong 7 ngày gần nhất
            </h3>
            <p className="max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Ngày <strong>{day}</strong> đã hết thời hạn lưu mã đơn hoặc chưa có danh sách chi tiết. Hệ thống giữ danh sách trong 7 ngày (hôm nay và 6 ngày trước). Các mã đã xóa trước khi đổi thời hạn lưu không thể khôi phục từ thống kê tổng hợp.
            </p>
            <button
              onClick={onClose}
              className="mt-2 rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              Đóng và xem thống kê pivot
            </button>
          </div>
        ) : (
          <>
            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-3 dark:border-slate-800">
              <form
                className="flex min-w-[280px] flex-1 items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setPage(0);
                  setQuery(input.trim());
                }}
              >
                <div className="relative flex flex-1 items-center">
                  <Search size={15} className="absolute left-3 text-slate-400" />
                  <input
                    aria-label="Tìm kiếm mã đơn hoặc rider"
                    maxLength={100}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Tìm theo mã vận đơn hoặc tên/mã rider…"
                    className="h-9 w-full rounded-lg border border-slate-200 bg-transparent pl-9 pr-3 text-xs outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:focus:border-blue-400"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-800 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"
                >
                  Tìm
                </button>
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setInput("");
                      setQuery("");
                      setPage(0);
                    }}
                    className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    Xóa tìm
                  </button>
                )}
              </form>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  disabled={loading || exporting || !result.orders.length}
                  onClick={() => {
                    const pageCodes = result.orders.map((o) => o.order_code).filter(Boolean);
                    void copyToClipboard(
                      pageCodes.join("\n"),
                      `Đã sao chép ${pageCodes.length} mã đơn của trang này!`
                    );
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  title="Sao chép danh sách mã đơn đang hiển thị trên trang hiện tại"
                >
                  <Copy size={13} />
                  Sao chép trang
                </button>

                <button
                  disabled={loading || exporting || !result.total}
                  onClick={() => void copyAllFiltered()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 hover:border-blue-300 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-850 dark:text-blue-400 dark:hover:bg-slate-800"
                  title="Sao chép toàn bộ mã đơn khớp với bộ lọc hiện tại"
                >
                  <Copy size={13} />
                  Sao chép tất cả ({result.total.toLocaleString("vi-VN")})
                </button>

                <button
                  disabled={loading || exporting || !result.total}
                  onClick={() => void downloadCsv()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-40 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                  title="Xuất file CSV chứa toàn bộ mã đơn và thông tin chi tiết khớp bộ lọc"
                >
                  <FileSpreadsheet size={14} />
                  {exporting ? "Đang xuất…" : "Xuất file CSV"}
                </button>

                <button
                  aria-label="Làm mới danh sách mã đơn"
                  disabled={loading}
                  onClick={() => setRetry((n) => n + 1)}
                  className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <RefreshCcw size={15} className={loading ? "animate-spin" : ""} />
                </button>
              </div>
            </div>

            {/* Notification alert */}
            {notice && (
              <div
                role="status"
                className="flex items-center gap-2 border-b border-blue-100 bg-blue-50/80 px-6 py-2 text-xs font-medium text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300"
              >
                <CheckCircle2 size={14} className="text-blue-600 dark:text-blue-400" />
                {notice}
              </div>
            )}

            {/* Orders Table */}
            <div className="min-h-60 flex-1 overflow-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center p-16 text-center text-sm text-slate-400">
                  <RefreshCcw size={24} className="animate-spin text-blue-600" />
                  <p className="mt-3">Đang tải danh sách mã đơn…</p>
                </div>
              ) : error ? (
                <div role="alert" className="p-12 text-center text-sm text-red-600 dark:text-red-400">
                  <p className="font-semibold">{error}</p>
                  <button
                    className="mt-2 text-xs underline hover:no-underline"
                    onClick={() => setRetry((n) => n + 1)}
                  >
                    Thử lại
                  </button>
                </div>
              ) : (
                <table className="w-full min-w-[900px] border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 text-center">STT</th>
                      <th className="px-4 py-3">Mã đơn</th>
                      <th className="px-4 py-3">Trạng thái</th>
                      <th className="px-4 py-3">Khu vực</th>
                      <th className="px-4 py-3">Quận / Phường</th>
                      <th className="px-4 py-3">Lý do OH</th>
                      <th className="px-4 py-3">Rider</th>
                      <th className="px-4 py-3 text-center">Giờ OH</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {result.orders.map((order, idx) => {
                      const rowNum = page * (result.limit || 50) + idx + 1;
                      const reasonDesc =
                        order.reason_label || reasonLabelMap[order.reason] || reasonNameVi(order.reason);
                      return (
                        <tr
                          key={order.order_code + idx}
                          className="transition hover:bg-blue-50/40 dark:hover:bg-slate-800/50"
                        >
                          <td className="px-4 py-3 text-center font-mono text-[11px] text-slate-400">{rowNum}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold tracking-tight text-blue-700 dark:text-blue-400">
                                {order.order_code}
                              </span>
                              <button
                                title="Sao chép mã đơn"
                                onClick={() =>
                                  void copyToClipboard(order.order_code, `Đã sao chép mã ${order.order_code}`)
                                }
                                className="rounded p-1 text-slate-400 opacity-60 transition hover:bg-slate-200 hover:opacity-100 dark:hover:bg-slate-700"
                              >
                                <Copy size={12} />
                              </button>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {order.status === 5 ? (
                              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                                Onhold (5)
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                                Received (1)
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">
                            {order.area}
                          </td>
                          <td className="max-w-[200px] px-4 py-3">
                            <span className="block font-medium text-slate-800 dark:text-slate-200">
                              {order.district || "Chưa rõ quận"}
                            </span>
                            <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                              {order.ward || "Chưa rõ phường"}
                            </span>
                          </td>
                          <td className="max-w-[240px] px-4 py-3">
                            <span className="block font-medium text-slate-800 dark:text-slate-200" title={reasonDesc}>
                              {reasonDesc}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">Mã: {order.reason}</span>
                          </td>
                          <td className="max-w-[180px] px-4 py-3">
                            <span className="block font-medium text-slate-800 dark:text-slate-200">
                              {order.rider_name || "Chưa rõ rider"}
                            </span>
                            {order.rider_code &&
                              order.rider_code !== "0" &&
                              order.rider_code !== "unknown" && (
                                <span className="font-mono text-[10px] text-slate-400">Mã: {order.rider_code}</span>
                              )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-center font-mono text-slate-600 dark:text-slate-400">
                            {order.hour >= 0 ? `${String(order.hour).padStart(2, "0")}:00` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {!result.orders.length && (
                      <tr>
                        <td colSpan={8} className="p-16 text-center text-slate-400 dark:text-slate-500">
                          Không tìm thấy mã đơn nào phù hợp với bộ lọc hiện tại.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer with Pagination */}
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-850 dark:text-slate-400">
              <div>
                <strong className="text-slate-800 dark:text-slate-200">
                  {loading ? "Đang đếm…" : `${result.total.toLocaleString("vi-VN")} mã đơn`}
                </strong>
                {query && <span className="ml-2 text-slate-500">(khớp từ khóa &quot;{query}&quot;)</span>}
              </div>
              <div className="flex items-center gap-3">
                <button
                  aria-label="Trang trước"
                  disabled={loading || page === 0}
                  onClick={() => setPage((n) => Math.max(0, n - 1))}
                  className="rounded border border-slate-300 p-1.5 transition hover:bg-slate-200 disabled:opacity-30 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Trang {page + 1} / {pageCount}
                </span>
                <button
                  aria-label="Trang sau"
                  disabled={loading || page + 1 >= pageCount}
                  onClick={() => setPage((n) => n + 1)}
                  className="rounded border border-slate-300 p-1.5 transition hover:bg-slate-200 disabled:opacity-30 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
    </dialog>
  );
}
