"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, RefreshCcw, Search, X } from "lucide-react";
import { formatDateTime } from "./lmhub-inventory-model";
import type { PickupOrderScope } from "@/lib/pickup/inventory-orders";

type Order = {
  shipment_id: string; sls_tracking_number: string | null; pickup_point_id: string | null;
  pickup_point_name: string | null; area: string; zone: string; ward: string;
  cot_group: string | null; create_time: string | null;
};
type Result = { rows: Order[]; total: number; pageSize: number; snapshotAt: string | null };

export function PickupOrderDialog({ scope, onClose }: { scope: PickupOrderScope; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [result, setResult] = useState<Result>({ rows: [], total: 0, pageSize: 100, snapshotAt: null });
  const [page, setPage] = useState(0), [input, setInput] = useState(""), [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError(""); setNotice("");
      try {
        const params = new URLSearchParams({ view: "orders", p_area: scope.area, p_status: scope.status,
          p_cot: scope.cot, p_zone: scope.zone ?? "", p_rider: scope.rider ?? "",
          p_rider_cot: scope.riderCot ?? "", q: query, page: String(page) });
        const res = await fetch(`/api/pickup-inventory?${params}`, { cache: "no-store", signal: controller.signal });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error ?? "Không tải được mã đơn pickup.");
        if (!controller.signal.aborted) setResult(data);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Không tải được mã đơn."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [scope.area, scope.status, scope.cot, scope.zone, scope.rider, scope.riderCot, query, page, retry]);
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice("Đã sao chép mã đơn."); }
    catch { setNotice("Không sao chép được. Bạn có thể chọn mã đơn trong bảng để sao chép."); }
  }
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const code = (order: Order) => order.sls_tracking_number?.trim() || order.shipment_id;
  return <dialog ref={dialog} aria-modal="true" aria-labelledby={titleId}
    className="fixed inset-0 m-auto w-[min(1200px,95vw)] max-w-none overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-950/50"
    onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="flex max-h-[88dvh] flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div><p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">Mã đơn tồn pickup · {scope.status}</p>
          <h2 id={titleId} className="mt-1 text-lg font-bold">{scope.title}</h2>
          <p className="mt-1 text-xs text-slate-500">{scope.area === "all" ? "KV1–KV5" : scope.area} · {scope.rider ? `COT phụ trách: ${scope.riderCot}. Gồm cả đơn từ COT trước đang gán.` : scope.cot === "all" ? "Cả COT" : scope.cot === "cot1" ? "COT đơn: COT 1" : "COT đơn: COT 2"}</p>
        </div><button autoFocus onClick={onClose} aria-label="Đóng danh sách mã đơn" className="rounded-lg p-2 hover:bg-slate-200"><X size={20}/></button>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
        <form className="flex min-w-60 flex-1 gap-2" onSubmit={event => { event.preventDefault(); setPage(0); setQuery(input.trim()); }}>
          <label className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3"><Search size={15} className="text-slate-400"/><input aria-label="Tìm mã đơn" maxLength={100} value={input} onChange={event => setInput(event.target.value)} placeholder="Tìm mã vận đơn hoặc mã SPX…" className="h-9 w-full bg-transparent text-xs outline-none"/></label>
          <button className="rounded-lg bg-slate-800 px-3 text-xs font-semibold text-white">Tìm</button>
        </form>
        <button disabled={loading || !result.rows.length || !!error} onClick={() => void copy(result.rows.map(code).join("\n"))} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs disabled:opacity-40"><Copy size={14}/>Sao chép trang này</button>
        <button aria-label="Làm mới mã đơn" disabled={loading} onClick={() => { setPage(0); setRetry(n => n + 1); }} className="rounded-lg border p-2 disabled:opacity-40"><RefreshCcw size={15} className={loading ? "animate-spin" : ""}/></button>
      </div>
      {notice && <p role="status" className="border-b border-slate-100 px-5 py-2 text-xs text-blue-700">{notice}</p>}
      <div className="min-h-40 overflow-auto">
        {loading ? <p className="p-12 text-center text-sm text-slate-400">Đang tải mã đơn…</p> : error ? <div role="alert" className="p-8 text-center text-sm text-red-600">{error} <button className="underline" onClick={() => setRetry(n => n + 1)}>Thử lại</button></div> :
          <table className="w-full min-w-[850px] text-left text-xs"><thead className="sticky top-0 bg-slate-100 text-slate-500"><tr>{["Mã đơn", "Mã zone / KV", "Điểm lấy hàng", "COT đơn", "Thời gian tạo"].map(label => <th key={label} className="px-5 py-3 font-semibold">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{result.rows.map(order => <tr key={order.shipment_id} className="hover:bg-blue-50/30">
              <td className="px-5 py-3"><button title="Sao chép mã đơn" onClick={() => void copy(code(order))} className="font-mono font-bold text-blue-700 hover:underline">{code(order)}</button>{code(order) !== order.shipment_id && <span className="mt-1 block font-mono text-[10px] text-slate-400">SPX: {order.shipment_id}</span>}</td>
              <td className="px-5 py-3"><span className="block font-mono font-semibold">{order.zone}</span><span className="mt-1 block text-[10px] text-slate-400">{order.area} · {order.ward}</span></td>
              <td className="max-w-64 px-5 py-3"><span className="block">{order.pickup_point_name || "—"}</span><span className="mt-1 block font-mono text-[10px] text-slate-400">{order.pickup_point_id}</span></td>
              <td className="whitespace-nowrap px-5 py-3 font-mono text-slate-500">{order.cot_group || "—"}</td>
              <td className="whitespace-nowrap px-5 py-3 text-slate-500">{order.create_time || "—"}</td>
            </tr>)}{!result.rows.length && <tr><td colSpan={5} className="p-12 text-center text-slate-400">Không có mã đơn khớp bộ lọc hiện tại.</td></tr>}</tbody>
          </table>}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 text-[11px] text-slate-500">
        <div><strong className="text-slate-700">{loading ? "Đang đếm…" : `${result.total.toLocaleString("vi-VN")} đơn`}</strong><span className="ml-3">Dữ liệu: {formatDateTime(result.snapshotAt)}</span></div>
        <div className="flex items-center gap-3"><button aria-label="Trang mã đơn trước" disabled={loading || page === 0} onClick={() => setPage(n => n - 1)} className="rounded border p-1.5 disabled:opacity-30"><ChevronLeft size={15}/></button><span>Trang {page + 1} / {pageCount}</span><button aria-label="Trang mã đơn sau" disabled={loading || !!error || page + 1 >= pageCount} onClick={() => setPage(n => n + 1)} className="rounded border p-1.5 disabled:opacity-30"><ChevronRight size={15}/></button></div>
      </footer>
    </div>
  </dialog>;
}
