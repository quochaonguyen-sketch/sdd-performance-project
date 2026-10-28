"use client";
import { useRememberedState } from "@/components/layout/filter-memory";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Moon,
  UsersRound,
  ChevronDown,
  RefreshCw,
  Download,
  Search,
  CheckCircle2,
  AlertCircle,
  Truck,
  Package,
  Edit2,
  Check,
  X,
  Copy,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import type { OvernightHoldData, OvernightHoldOrder, OvernightRider } from "@/lib/overnight-holds/model";
import s from "./overnight-holds.module.css";
import { pickupCsvCell } from "@/lib/pickup/csv";

const nf = new Intl.NumberFormat("vi-VN");

export function OvernightHoldsView({ initialDay }: { initialDay: string }) {
  const [day, setDay] = useState(initialDay);
  const pendingLoad=useRef<AbortController|null>(null);
  const [data, setData] = useState<OvernightHoldData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Filters
  const [query, setQuery] = useState("");
  const [areaFilter, setAreaFilter] = useRememberedState("overnight-holds-view:areaFilter", "all");
  const [cutoffStatusFilter, setCutoffStatusFilter] = useState("all");
  const [currentStatusFilter, setCurrentStatusFilter] = useState("all");
  const [noteFilter, setNoteFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [selectedRider,setSelectedRider]=useState<string|null>(null);
  const pageSize = 20;

  // Inline note editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useReportInitialDataLoading("overnight-holds", loading);

  const loadData = useCallback(
    async (targetDay = day, targetPage = page, background = false) => {
      if (background && pendingLoad.current) return;
      pendingLoad.current?.abort();
      const controller=new AbortController();pendingLoad.current=controller;
      if (!background) setLoading(true);
      try {
        const params = new URLSearchParams({
          day: targetDay,
          page: String(targetPage),
          limit: String(pageSize),
          area: areaFilter,
          cutoff_status: cutoffStatusFilter,
          current_status: currentStatusFilter,
          has_note: noteFilter,
          q: query,
        });

        const res = await fetch(`/api/overnight-holds?${params.toString()}`, { cache: "no-store",signal:controller.signal });
        if (!res.ok) throw new Error("Không thể tải dữ liệu đơn giữ qua đêm");
        const json = (await res.json()) as OvernightHoldData;
        if(controller.signal.aborted)return;
        setData(json);
        setPage(json.page);
      } catch (err) {
        if(controller.signal.aborted)return;
        setFeedback({
          type: "error",
          message: err instanceof Error ? err.message : "Đã xảy ra lỗi khi tải dữ liệu",
        });
      } finally {
        if(!controller.signal.aborted){setLoading(false);pendingLoad.current=null;}
      }
    },
    [day, page, areaFilter, cutoffStatusFilter, currentStatusFilter, noteFilter, query]
  );

  useEffect(() => {
    const timer=setTimeout(()=>void loadData(day, page),0);
    return ()=>{clearTimeout(timer);pendingLoad.current?.abort();};
  }, [loadData, day, page]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void loadData(day, page, true);
    };
    const timer = setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [loadData, day, page]);

  // Cập nhật trạng thái liên tục
  const handleSyncStatus = async () => {
    if (syncing) return;
    setSyncing(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/overnight-holds/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || "Không thể cập nhật trạng thái");
      }
      setFeedback({
        type: "success",
        message: "Đã yêu cầu lấy trạng thái từ SPX. Kết quả sẽ tự cập nhật khi worker hoàn tất.",
      });
      await loadData(day, page);
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Lỗi khi cập nhật trạng thái",
      });
    } finally {
      setSyncing(false);
    }
  };

  // Lưu ghi chú
  const handleSaveNote = async (id: string) => {
    if (savingNote) return;
    setSavingNote(true);
    try {
      const res = await fetch("/api/overnight-holds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, note: noteDraft }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || "Không thể lưu ghi chú");
      }
      // Update local state
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          orders: prev.orders.map((o) =>
            o.id === id
              ? {
                  ...o,
                  note: result.note,
                  note_updated_at: result.note_updated_at,
                  note_updated_by: result.note_updated_by,
                }
              : o
          ),
        };
      });
      setEditingId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Lỗi khi lưu ghi chú");
    } finally {
      setSavingNote(false);
    }
  };

  // Xuất CSV
  const handleExportCSV = async () => {
    try {
      const params = new URLSearchParams({
        day,
        export: "1",
        area: areaFilter,
        cutoff_status: cutoffStatusFilter,
        current_status: currentStatusFilter,
        has_note: noteFilter,
        q: query,
      });

      const res = await fetch(`/api/overnight-holds?${params.toString()}`);
      const json = await res.json() as OvernightHoldData & {error?:string};
      if(!res.ok)throw new Error(json.error||"Không xuất được danh sách.");
      const orders = (json.orders || []) as OvernightHoldOrder[];
      const riderNotes=new Map(json.riders.map(rider=>[rider.code,rider.note]));

      if (orders.length === 0) {
        alert("Không có dữ liệu để xuất");
        return;
      }

      const headers = [
        "Mã đơn",
        "Khu vực",
        "Quận",
        "Phường",
        "Mã tài xế",
        "Tên tài xế",
        "Trạng thái 23h",
        "Trạng thái hiện tại",
        "Lý do giữ hàng",
        "Ghi chú",
        "Người ghi chú",
        "Thời gian cập nhật",
        "Ghi chú xử lý rider",
      ];

      const csvRows = [headers.join(",")];
      for (const o of orders) {
        const row = [o.order_code,o.area,o.district,o.ward,o.rider_code,o.rider_name,
          o.cutoff_status===1?"Delivering":"Onhold",o.current_status,o.reason_label,o.note,
          o.note_updated_by,o.last_synced_at,riderNotes.get(o.rider_code)].map(pickupCsvCell);
        csvRows.push(row.join(","));
      }

      const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `giu-hang-qua-dem-${day}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      alert("Không thể xuất file CSV");
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1500);
  };

  const snapshot = data?.snapshot;
  const summary = data?.summary || {
    total: 0,
    delivering: 0,
    onhold: 0,
    resolved: 0,
    hasNotes: 0,
    riderCount: 0,
  };

  const totalPages = Math.ceil((data?.totalRiders || 0) / pageSize);
  const visibleOrders=data?.orders.filter(order=>order.rider_code===selectedRider)??[];
  const activeRider=data?.riders.find(rider=>rider.code===selectedRider);

  async function saveRiderNote(code:string,note:string){
    const response=await fetch("/api/overnight-holds",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({day,rider_code:code,note})});
    const result=await response.json();
    if(!response.ok||!result.success)throw new Error(result.error||"Không lưu được ghi chú rider.");
    setData(previous=>previous?{...previous,riders:previous.riders.map(rider=>rider.code===code?{...rider,note:result.note,noteUpdatedBy:result.updated_by}:rider)}:previous);
  }

  const orderDetails = (activeRider?<><h2 className={s.orderHeading}>Đơn của {activeRider.name} · {nf.format(visibleOrders.length)} đơn theo bộ lọc</h2><div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th style={{ width: "180px" }}>Mã đơn hàng</th>
                <th style={{ width: "200px" }}>Tài xế giữ hàng</th>
                <th style={{ width: "150px" }}>Khu vực / Tuyến</th>
                <th style={{ width: "130px" }}>Trạng thái 23h</th>
                <th style={{ width: "190px" }}>Lý do Onhold</th>
                <th style={{ width: "150px" }}>Trạng thái hiện tại</th>
                <th style={{ minWidth: "260px" }}>Ghi chú điều phối (Note sự cố)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="h-48 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw size={24} className="animate-spin text-blue-600" />
                      <span>Đang tải dữ liệu giữ hàng qua đêm...</span>
                    </div>
                  </td>
                </tr>
              ) : visibleOrders.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className={s.emptyState}>
                      <Moon size={36} className="text-slate-400" />
                      <div className="font-semibold text-slate-700">Không tìm thấy đơn hàng phù hợp</div>
                      <p className="text-xs text-slate-500 max-w-md">
                        {snapshot
                          ? "Thử thay đổi bộ lọc tìm kiếm hoặc khu vực."
                          : "Ngày này chưa có snapshot 23h hợp lệ. Cần worker chạy tại thời điểm chốt."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                visibleOrders.map((order) => {
                  const isDelivering = order.cutoff_status === 1;
                  const isCurrentDelivered = order.current_status === "Delivered";
                  const isCurrentReturned = order.current_status === "Returned";
                  const isCurrentOnhold = order.current_status === "Onhold";
                  const isCurrentDelivering = order.current_status === "Delivering";

                  return (
                    <tr key={order.id}>
                      {/* Order Code */}
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold text-slate-900 text-xs">
                            {order.order_code}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyCode(order.order_code)}
                            className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-700"
                            title="Sao chép mã đơn"
                          >
                            {copiedCode === order.order_code ? (
                              <Check size={12} className="text-emerald-600" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Rider */}
                      <td>
                        <div className="font-medium text-slate-900 text-xs truncate max-w-[190px]">
                          {order.rider_name || "Chưa rõ tên"}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          ID: {order.rider_code || "—"}
                        </div>
                      </td>

                      {/* Area & Location */}
                      <td>
                        <div className="font-semibold text-xs text-slate-800">{order.area}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[140px]" title={`${order.ward}, ${order.district}`}>
                          {order.ward ? `${order.ward}, ` : ""}{order.district || "—"}
                        </div>
                      </td>

                      {/* Cutoff Status 23h */}
                      <td>
                        <span
                          className={`${s.badge} ${
                            isDelivering ? s.badgeDelivering : s.badgeOnhold
                          }`}
                        >
                          {isDelivering ? <Truck size={12} /> : <Moon size={12} />}
                          {isDelivering ? "Delivering" : "Onhold"}
                        </span>
                      </td>

                      {/* Reason Label */}
                      <td>
                        <div className="text-xs text-slate-700 line-clamp-2" title={order.reason_label}>
                          {order.reason_label || "—"}
                        </div>
                      </td>

                      {/* Current Status */}
                      <td>
                        <div className="flex flex-col gap-1">
                          <span
                            className={`${s.badge} ${
                              isCurrentDelivered
                                ? s.badgeDelivered
                                : isCurrentReturned
                                ? s.badgeReturned
                                : isCurrentDelivering
                                ? s.badgeDelivering
                                : isCurrentOnhold
                                ? s.badgeOnhold
                                : s.badgeOther
                            }`}
                          >
                            {isCurrentDelivered ? (
                              <CheckCircle2 size={12} />
                            ) : isCurrentReturned ? (
                              <RotateCcw size={12} />
                            ) : isCurrentDelivering ? (
                              <Truck size={12} />
                            ) : (
                              <Moon size={12} />
                            )}
                            {order.current_status}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {snapshot?.status_synced_at ? `Sync SPX: ${new Date(order.last_synced_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone:"Asia/Ho_Chi_Minh" })}` : "Chưa đồng bộ SPX"}
                          </span>
                        </div>
                      </td>

                      {/* Note Cell with inline editing */}
                      <td className={s.noteCell}>
                        {editingId === order.id ? (
                          <div className={s.noteEditor}>
                            <textarea
                              className={s.noteInput}
                              rows={2}
                              autoFocus
                              placeholder="Nhập ghi chú lỗi, lý do sự cố..."
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  void handleSaveNote(order.id);
                                } else if (e.key === "Escape") {
                                  setEditingId(null);
                                }
                              }}
                            />
                            <div className={s.noteActions}>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => setEditingId(null)}
                                disabled={savingNote}
                              >
                                Hủy
                              </Button>
                              <Button
                                type="button"
                                variant="default"
                                className="h-6 px-2 text-[11px] bg-blue-600 hover:bg-blue-700 text-white"
                                onClick={() => void handleSaveNote(order.id)}
                                disabled={savingNote}
                              >
                                {savingNote ? "Lưu..." : "Lưu"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <button type="button"
                            className={s.noteDisplay}
                            onClick={() => {
                              setEditingId(order.id);
                              setNoteDraft(order.note || "");
                            }}
                            title="Nhấp để sửa ghi chú"
                          >
                            {order.note ? (
                              <div>
                                <div className={s.noteText}>{order.note}</div>
                                {order.note_updated_by && (
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    Bởi: {order.note_updated_by}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className={s.noteEmpty}>+ Thêm ghi chú lỗi / xử lý...</div>
                            )}
                            <Edit2 size={13} className="text-slate-400 shrink-0 opacity-40 hover:opacity-100" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div></>:null);

  return (
    <div className={s.container}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.titleArea}>
          <span className={s.eyebrow}><Moon size={15} aria-hidden="true"/> SDD OPERATIONS <span>/</span> MORNING FOLLOW-UP</span>
          <h1>Giữ hàng qua đêm<span className={s.cutoffBadge}>Chốt 23:00</span></h1>
          <p>
            Bàn giao từ đêm trước. Theo sát rider, xử lý từng đơn trong ca sáng.
          </p>
        </div>

        <div className={s.actions}>
          <label className={s.dateField}><span>Ngày giao / chốt 23h</span><input
            type="date"
            aria-label="Ngày đưa đi giao và chốt danh sách 23h"
            className={s.dateInput}
            value={day}
            onChange={(e) => {
              if (e.target.value) {
                setDay(e.target.value);
                setPage(0);
              }
            }}
          /></label>

          <Button
            type="button"
            variant="outline"
            className={s.primaryAction}
            onClick={handleSyncStatus}
            disabled={syncing || !snapshot || Boolean(snapshot.status_sync_token || snapshot.status_sync_requested_at)}
          >
            <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
            {syncing || snapshot?.status_sync_token || snapshot?.status_sync_requested_at ? "Đang đồng bộ SPX..." : "Cập nhật trạng thái"}
          </Button>

          <Button
            type="button"
            variant="outline"
            className={s.secondaryAction}
            onClick={handleExportCSV}
            disabled={!data?.orders.length}
          >
            <Download size={15} />
            Xuất CSV
          </Button>
        </div>
      </div>

      {/* Snapshot Alert / Info */}
      {snapshot ? (
        <div className={s.snapshotStatus} data-state="locked">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-600" />
            <span>
              Danh sách đêm <strong>{day.split("-").reverse().join("/")}</strong> đã khóa (Lúc {new Date(snapshot.captured_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone:"Asia/Ho_Chi_Minh" })})
            </span>
          </div>
          <span className="text-slate-500">
            {snapshot.status_sync_error ? snapshot.status_sync_error : snapshot.status_sync_token ? "Đang lấy trạng thái từ SPX..." : snapshot.status_sync_requested_at ? "Đang chờ worker lấy trạng thái SPX..." : snapshot.status_synced_at ? `Đồng bộ SPX: ${new Date(snapshot.status_synced_at).toLocaleString("vi-VN", { timeZone:"Asia/Ho_Chi_Minh" })} · Tự cập nhật mỗi 5 phút` : "Chưa đồng bộ SPX · Tự cập nhật mỗi 5 phút"}
          </span>
        </div>
      ) : (
        <div className={s.snapshotStatus} data-state="pending">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-600" />
            <span>
              <strong>Chờ danh sách chốt đêm {day.split("-").reverse().join("/")}</strong>. Danh sách được lấy sau 23h để xử lý vào sáng hôm sau.
            </span>
          </div>
        </div>
      )}

      {feedback && (
        <div
          className={`flex items-center justify-between text-xs px-4 py-2.5 rounded-lg border ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{feedback.message}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="p-1 hover:opacity-75">
            <X size={14} />
          </button>
        </div>
      )}

      <section className={s.kpiGrid} aria-label="Tổng quan bàn giao ca sáng">
        <div className={`${s.kpiCard} ${s.kpiPending}`}><div className={s.kpiLabel}>Đơn còn giữ<Package size={18}/></div><strong className={s.kpiValue}>{loading?"—":nf.format(Math.max(0,summary.total-summary.resolved))}</strong><p className={s.kpiSub}>Cần theo dõi trong ca sáng</p></div>
        <div className={s.kpiCard}><div className={s.kpiLabel}>Rider lúc chốt<UsersRound size={18}/></div><strong className={s.kpiValue}>{loading?"—":nf.format(summary.riderCount)}</strong><p className={s.kpiSub}>{nf.format(summary.total)} đơn tại thời điểm chốt 23h</p></div>
        <div className={s.kpiCard}><div className={s.kpiLabel}>Đã xử lý<CheckCircle2 size={18}/></div><strong className={s.kpiValue}>{loading?"—":nf.format(summary.resolved)}<small> / {nf.format(summary.total)}</small></strong><p className={s.kpiSub}>Đã giao hoặc đã trả về hub</p></div>
        <div className={s.kpiCard}><div className={s.kpiLabel}>Đơn có ghi chú<Edit2 size={18}/></div><strong className={s.kpiValue}>{loading?"—":nf.format(summary.hasNotes)}</strong><p className={s.kpiSub}>Ghi chú sự cố theo từng đơn</p></div>
      </section>

      {/* Filters Toolbar */}
      <section className={s.filterCard} aria-label="Bộ lọc rider và đơn giữ qua đêm">
        <div className={s.searchBox}>
          <Search size={15} className={s.searchIcon} />
          <input
            type="text"
            className={s.searchInput}
            aria-label="Tìm rider, mã đơn hoặc ghi chú đơn"
            placeholder="Tìm rider, mã đơn, ghi chú đơn…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </div>

        <select
          className={s.filterSelect}
          aria-label="Lọc khu vực"
          value={areaFilter}
          onChange={(e) => {
            setAreaFilter(e.target.value);
            setPage(0);
          }}
        >
          <option value="all">Tất cả khu vực</option>
          <option value="Khu vực 1">Khu vực 1 (KV1)</option>
          <option value="Khu vực 2">Khu vực 2 (KV2)</option>
          <option value="Khu vực 3">Khu vực 3 (KV3)</option>
          <option value="Khu vực 4">Khu vực 4 (KV4)</option>
          <option value="Khu vực 5">Khu vực 5 (KV5)</option>
        </select>

        <select
          className={s.filterSelect}
          aria-label="Trạng thái lúc chốt 23h"
          value={cutoffStatusFilter}
          onChange={(e) => {
            setCutoffStatusFilter(e.target.value);
            setPage(0);
          }}
        >
          <option value="all">Chốt 23h: tất cả</option>
          <option value="1">Delivering (Đang giao)</option>
          <option value="5">Onhold (Giữ hàng)</option>
        </select>

        <select
          className={s.filterSelect}
          aria-label="Trạng thái hiện tại"
          value={currentStatusFilter}
          onChange={(e) => {
            setCurrentStatusFilter(e.target.value);
            setPage(0);
          }}
        >
          <option value="all">Hiện tại: tất cả</option>
          <option value="Delivering">Đang giao</option>
          <option value="Onhold">Giữ hàng (Onhold)</option>
          <option value="Delivered">Đã giao thành công</option>
          <option value="Returned">Đã hoàn trả hub</option>
        </select>

        <select
          className={s.filterSelect}
          aria-label="Ghi chú từng đơn"
          value={noteFilter}
          onChange={(e) => {
            setNoteFilter(e.target.value);
            setPage(0);
          }}
        >
          <option value="all">Ghi chú từng đơn</option>
          <option value="has_note">Có ghi chú</option>
          <option value="no_note">Chưa ghi chú</option>
        </select>
      </section>

      <section className={s.riderBoard} aria-label="Theo dõi giữ hàng theo rider" aria-busy={loading}>
        <header><div><span className={s.sectionEyebrow}>DANH SÁCH ƯU TIÊN</span><h2>Theo dõi theo rider</h2><p>Nhiều đơn còn giữ xếp trước · số lượng theo bộ lọc đang chọn.</p></div><span className={s.riderTotal}>{nf.format(data?.totalRiders??0)} rider</span></header>
        <div className={s.columnLabels} aria-hidden="true"><span>Rider / khu vực</span><span>Còn giữ</span><span>Đã xử lý</span><span>Ghi chú & hướng xử lý</span></div>
        {loading?<div className={s.boardEmpty} role="status"><RefreshCw size={24} className="animate-spin"/><strong>Đang tải danh sách rider…</strong></div>:!data?.riders.length?<div className={s.boardEmpty}><Moon size={28}/><strong>Chưa có rider cần theo dõi</strong><p>{snapshot?"Không có kết quả khớp bộ lọc. Thử chọn lại khu vực hoặc trạng thái.":"Chưa có snapshot 23h hợp lệ cho ngày đang xem. Chọn ngày đã chốt để đối chiếu ca sáng."}</p></div>:data.riders.map((rider,index)=><article key={`${day}:${rider.code}`} className={s.riderRow} data-active={selectedRider===rider.code}>
          <button type="button" className={s.riderToggle} aria-expanded={selectedRider===rider.code} aria-controls={`rider-orders-${rider.code}`} onClick={()=>{setSelectedRider(value=>value===rider.code?null:rider.code);setEditingId(null);}}>
            <span className={s.riderIdentity}><span className={s.rank}>{String(page*pageSize+index+1).padStart(2,"0")}</span><span><strong>{rider.name}</strong><small>ID {rider.code} · {rider.areas.join(", ")}</small><span className={s.expandHint}>{selectedRider===rider.code?"Thu gọn danh sách":"Xem danh sách đơn"}<ChevronDown size={13}/></span></span></span>
            <span className={s.riderCount} data-pending={rider.remaining>0}><strong>{nf.format(rider.remaining)}</strong><small>còn giữ / {nf.format(rider.total)}</small></span>
            <span className={s.riderResolved}><strong>{nf.format(rider.resolved)}</strong><small>đã xử lý</small><span className={s.progressTrack}><span style={{width:`${rider.total?Math.round(rider.resolved/rider.total*100):0}%`}}/></span></span>
          </button>
          <RiderNoteEditor rider={rider} onSave={saveRiderNote}/>
          <div className={s.riderDetails} id={`rider-orders-${rider.code}`} hidden={selectedRider!==rider.code}>{selectedRider===rider.code?orderDetails:null}</div>
        </article>)}
      </section>

      {/* Orders Table */}
      <div className={s.tableCard}>
        {/* Pagination */}
        {data && data.totalRiders > 0 && (
          <div className={s.pagination}>
            <div>
              Hiển thị {page * pageSize + 1} - {Math.min((page + 1) * pageSize, data.totalRiders)} / {nf.format(data.totalRiders)} rider
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                className="h-8 px-2.5 text-xs gap-1"
                disabled={page <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft size={14} /> Trước
              </Button>
              <span className="text-xs font-semibold px-2">
                Trang {page + 1} / {Math.max(1, totalPages)}
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-8 px-2.5 text-xs gap-1"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Sau <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RiderNoteEditor({rider,onSave}:{rider:OvernightRider;onSave:(code:string,note:string)=>Promise<void>}){
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState(""),[saving,setSaving]=useState(false),[error,setError]=useState("");
  if(!editing)return <button type="button" className={s.riderNoteButton} onClick={()=>{setDraft(rider.note);setEditing(true);setError("");}} aria-label={`Ghi chú xử lý cho ${rider.name}`}>
    <Edit2 size={15} aria-hidden="true"/><span>{rider.note||"Thêm ghi chú xử lý cho rider…"}{rider.noteUpdatedBy?<small>Người cập nhật: {rider.noteUpdatedBy}</small>:null}</span>
  </button>;
  return <form className={s.riderNoteForm} onSubmit={async event=>{
    event.preventDefault();if(saving)return;setSaving(true);setError("");
    try{await onSave(rider.code,draft);setEditing(false);}catch(caught){setError(caught instanceof Error?caught.message:"Không lưu được ghi chú.");}finally{setSaving(false);}
  }}>
    <label>Ghi chú xử lý · {rider.name}<textarea autoFocus maxLength={2000} rows={2} value={draft} onChange={event=>setDraft(event.target.value)} disabled={saving}/></label>
    {error?<p role="alert">{error}</p>:null}
    <div><Button type="button" variant="outline" onClick={()=>setEditing(false)} disabled={saving}>Hủy</Button><Button type="submit" disabled={saving}>{saving?"Đang lưu…":"Lưu ghi chú"}</Button></div>
  </form>;
}
