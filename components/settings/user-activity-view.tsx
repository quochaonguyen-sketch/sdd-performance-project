"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, ChevronLeft, ChevronRight, RefreshCcw, ShieldCheck, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

type Member = { id: string; email: string; full_name: string | null; role: string; last_seen_at: string | null; last_path: string | null };
type Event = { id: string; actor_id: string | null; actor_name: string | null; actor_email: string; event_type: string; entity_type: string | null; entity_id: string | null; path: string | null; summary: string; changes: Record<string, unknown>; created_at: string };
type Result = { events: Event[]; members: Member[]; total: number; error?: string };
const eventNames: Record<string, string> = { login: "Đăng nhập", logout: "Đăng xuất", page_view: "Truy cập trang", insert: "Thêm dữ liệu", update: "Sửa dữ liệu", delete: "Xóa dữ liệu", permission_change: "Đổi quyền", member_created: "Thêm tài khoản", member_deleted: "Xóa tài khoản" };
function time(value: string | null) { return value ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)) : "Chưa có hoạt động"; }

export function UserActivityView() {
  const [actor, setActor] = useState("all");
  const [type, setType] = useState("all");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result>({ events: [], members: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      const query = new URLSearchParams({ actor, type, page: String(page) });
      if (date) query.set("date", date);
      const response = await fetch(`/api/admin/activity?${query}`, { cache: "no-store", signal });
      const payload = await response.json().catch(() => null) as Result | null;
      if (!response.ok || !payload) throw new Error(payload?.error ?? (response.status === 401 ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." : "Chưa tải được nhật ký. Vui lòng bấm Làm mới để thử lại."));
      if (!Array.isArray(payload.events) || !Array.isArray(payload.members) || !Number.isFinite(payload.total) || payload.total < 0) throw new Error("Dữ liệu nhật ký không hợp lệ. Vui lòng thử lại.");
      if (!signal.aborted) setResult(payload);
    } catch (failure) {
      if (!signal.aborted) setError(failure instanceof Error ? failure.message : "Không tải được nhật ký");
    } finally { if (!signal.aborted) setLoading(false); }
  }, [actor, type, page, date]);
  useEffect(() => {
    const controller = new AbortController();
    // A new network request resets its loading/error indicators.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refresh]);
  const pages = Math.max(1, Math.ceil(result.total / 40));
  return <div className="mx-auto max-w-[1600px] space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Quản trị hệ thống</p><h1 className="mt-1 text-2xl font-bold text-slate-950">Theo dõi người dùng</h1><p className="mt-1 text-sm text-slate-500">Nhật ký đăng nhập, truy cập và thay đổi dữ liệu · Giờ Việt Nam</p></div><div className="flex gap-2"><Link className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" href="/settings"><UsersRound size={16} />Quản lý tài khoản</Link><Button variant="secondary" onClick={() => setRefresh((value) => value + 1)} disabled={loading}><RefreshCcw size={16} className={loading ? "animate-spin" : undefined} />Làm mới</Button></div></header>
    <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="mb-3 flex items-center gap-2 text-sm font-bold"><ShieldCheck size={17} className="text-blue-600" />Hoạt động gần nhất của thành viên</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{result.members.map((member) => <button type="button" key={member.id} aria-pressed={actor === member.id} onClick={() => { setActor(member.id); setPage(1); }} className={"min-w-0 rounded-lg border p-3 text-left " + (actor === member.id ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-slate-50 hover:border-blue-300")}><p className="truncate text-sm font-semibold text-slate-900">{member.full_name ?? member.email}<span className="ml-2 text-xs font-normal text-slate-500">{member.role}</span></p><p className="truncate text-xs text-slate-500">{member.email}</p><p className="mt-2 text-xs tabular-nums text-slate-600">{time(member.last_seen_at)}</p>{member.last_path ? <p className="mt-1 truncate text-xs text-blue-700">{member.last_path}</p> : null}</button>)}</div></section>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4">
        <label className="min-w-48 flex-1 text-xs font-semibold text-slate-600">Người dùng<Select value={actor} onChange={(event) => { setActor(event.target.value); setPage(1); }}><option value="all">Tất cả người dùng</option>{result.members.map((member) => <option key={member.id} value={member.id}>{member.full_name ?? member.email}</option>)}</Select></label>
        <label className="min-w-40 text-xs font-semibold text-slate-600">Hoạt động<Select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="all">Tất cả hoạt động</option>{Object.entries(eventNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></label>
        <label className="text-xs font-semibold text-slate-600">Ngày (giờ Việt Nam)<Input type="date" value={date} onChange={(event) => { setDate(event.target.value); setPage(1); }} /></label>
        <Button variant="secondary" onClick={() => { setActor("all"); setType("all"); setDate(""); setPage(1); }}>Đặt lại</Button>
      </div>
      {error ? <p role="alert" className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <div className="overflow-x-auto" aria-busy={loading}><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Thời gian</th><th className="p-3">Người thực hiện</th><th className="p-3">Hoạt động</th><th className="p-3">Nội dung / thay đổi</th></tr></thead><tbody className="divide-y divide-slate-100">{(!error ? result.events : []).map((event) => <tr key={event.id} className="align-top hover:bg-slate-50"><td className="whitespace-nowrap p-3 text-xs tabular-nums text-slate-500">{time(event.created_at)}</td><td className="p-3"><p className="font-semibold text-slate-900">{event.actor_name ?? event.actor_email}</p><p className="text-xs text-slate-500">{event.actor_email}</p></td><td className="p-3"><span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800"><Activity size={12} />{eventNames[event.event_type] ?? event.event_type}</span>{event.entity_type ? <p className="mt-1 text-xs text-slate-500">{event.entity_type}</p> : null}</td><td className="max-w-xl p-3"><p className="break-words text-slate-800">{event.summary}</p>{event.path ? <p className="mt-1 text-xs text-blue-700">{event.path}</p> : null}{Object.keys(event.changes ?? {}).length ? <details className="mt-2 text-xs"><summary className="cursor-pointer font-semibold text-slate-600">Xem thay đổi</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-100 p-3 text-slate-700">{JSON.stringify(event.changes, null, 2)}</pre></details> : null}</td></tr>)}{!loading && !error && !result.events.length ? <tr><td colSpan={4} className="p-10 text-center text-slate-500">Chưa có hoạt động khớp bộ lọc. Nhật ký bắt đầu từ khi tính năng được bật.</td></tr> : null}</tbody></table></div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-4 text-xs text-slate-500"><span>{error ? "—" : result.total.toLocaleString("vi-VN")} hoạt động · Trang {page}/{pages}</span><div className="flex gap-2"><Button variant="secondary" disabled={loading || !!error || page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={15} />Trước</Button><Button variant="secondary" disabled={loading || !!error || page >= pages} onClick={() => setPage((value) => value + 1)}>Sau<ChevronRight size={15} /></Button></div></footer>
    </section>
  </div>;
}
