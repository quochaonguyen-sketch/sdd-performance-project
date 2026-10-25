"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, RefreshCw } from "lucide-react";
import { DATA_SOURCES } from "@/lib/data-sources/catalog";
import { encryptSpxCredentials, type CredentialEnvelope } from "@/lib/data-sources/spx-credentials";

type Session = { worker_id: string; cookie_present: boolean; account_saved: boolean; profile_ready: boolean; cookie_updated_at: string | null; cookie_expires_at: string | null; cookie_expiry_kind: string; checked_at: string; status: string; public_key: string | null; key_id: string | null };
type State = { sessions: Session[]; canRefresh: boolean; serverTime: string };
const labels: Record<string, string> = { IDLE: "Chưa yêu cầu làm mới", QUEUED: "Chờ máy chủ làm mới", RUNNING: "Đang làm mới cookie", SUCCEEDED: "Đã làm mới và xác minh với SPX", FAILED: "Chưa làm mới được. Mở SDD Web Data → Đăng nhập SPX để kiểm tra tài khoản hoặc OTP/CAPTCHA." };
const time = (value: string | null) => value ? new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "Chưa có";
function remaining(expires: string, now: number) {
  let seconds = Math.max(0, Math.ceil((Date.parse(expires) - now) / 1000));
  if (!seconds) return "Đã đến hạn hết cookie";
  const days = Math.floor(seconds / 86400); seconds %= 86400;
  const hours = Math.floor(seconds / 3600); seconds %= 3600;
  const minutes = Math.floor(seconds / 60); seconds %= 60;
  return `Còn ${days ? `${days} ngày ` : ""}${hours} giờ ${minutes} phút ${seconds} giây`;
}

function CredentialsForm({ session, disabled, onSave }: { session: Session; disabled: boolean; onSave: (envelope: CredentialEnvelope) => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return <form className="mt-4 space-y-3 border-t pt-4" onSubmit={async event => {
    event.preventDefault();
    if (disabled || saving || !session.public_key || !session.key_id) return;
    setSaving(true); setError("");
    try {
      const envelope = await encryptSpxCredentials(session.worker_id, session.public_key, session.key_id, username, password);
      setPassword("");
      await onSave(envelope);
    } catch (e) { setError(e instanceof Error ? e.message : "Không mã hóa được tài khoản SPX"); }
    finally { setSaving(false); }
  }}>
    <p className="font-medium">{session.account_saved ? "Cập nhật tài khoản SPX" : "Lưu tài khoản SPX để tự làm mới cookie"}</p>
    {session.account_saved && <p className="text-xs text-slate-500">Tài khoản đã được lưu. Các ô bên dưới để trống; chỉ nhập khi muốn đổi tài khoản hoặc mật khẩu.</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1"><span>Tên đăng nhập SPX</span><input name="spx-username" autoComplete="off" required maxLength={256} value={username} onChange={e => setUsername(e.target.value)} disabled={disabled || saving} className="block w-full rounded-lg border bg-white px-3 py-2 disabled:opacity-50" /></label>
      <label className="space-y-1"><span>Mật khẩu SPX</span><input name="spx-password" type="password" autoComplete="new-password" required maxLength={1024} value={password} onChange={e => setPassword(e.target.value)} disabled={disabled || saving} className="block w-full rounded-lg border bg-white px-3 py-2 disabled:opacity-50" /></label>
    </div>
    <p className="text-xs text-slate-500">Mã hóa trước khi gửi; lưu mã hóa trên máy chủ. Sau khi lưu, worker đăng nhập và làm mới cookie cho tất cả nguồn. OTP/CAPTCHA cần xử lý qua Đăng nhập SPX trên máy chủ.</p>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    <button type="submit" disabled={disabled || saving || !session.public_key || !session.key_id} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-40">{saving && <Loader2 size={15} className="animate-spin" />}Lưu tài khoản & làm mới cookie</button>
    {(!session.public_key || !session.key_id) && <p className="text-amber-700">Worker cần cập nhật để nhận tài khoản đã mã hóa từ web.</p>}
  </form>;
}

export function SpxSession() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/data-sources/session", { cache: "no-store", signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setState(body); setElapsed(0); setError("");
    } catch (e) { if (!(e instanceof Error && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Không tải được phiên SPX"); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const initial = setTimeout(() => void load(controller.signal), 0);
    const interval = setInterval(() => { if (!document.hidden) void load(controller.signal); }, 5000);
    return () => { controller.abort(); clearTimeout(initial); clearInterval(interval); };
  }, [load]);
  useEffect(() => {
    const timer = setInterval(() => setElapsed(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  async function refresh(worker: string, envelope?: CredentialEnvelope) {
    if (busy) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/data-sources/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: envelope ? "save_credentials" : "refresh", worker, ...(envelope ? { envelope } : {}) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setNotice(body.message); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Không gửi được yêu cầu"); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border bg-white p-5">
    <h2 className="flex items-center gap-2 font-semibold"><KeyRound size={19} />Cookie SPX · dùng chung cho mọi nguồn</h2>
    <p className="mt-2 text-sm text-slate-500">{DATA_SOURCES.map(s => s.name).join(" · ")}</p>
    <p className="mt-2 text-sm text-slate-600">Khi SPX báo hết phiên, worker tự đăng nhập lại bằng tài khoản đã lưu trên máy chủ và thử lại một lần. Nếu cần OTP/CAPTCHA, mở SDD Web Data trên máy chủ và chọn Đăng nhập SPX. Cookie mới chỉ thay phiên cũ sau khi xác minh thành công.</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-blue-600">{notice}</p>}
    {!state && !error && <p className="mt-3 text-sm text-slate-500">Đang kiểm tra phiên SPX…</p>}
    {state && !state.sessions.length && <p className="mt-3 text-sm text-amber-700">Chưa nhận trạng thái. Bật worker đã cập nhật trên máy chủ.</p>}
    {state?.sessions.slice(0, 1).map(session => {
      const now = Date.parse(state.serverTime) + elapsed * 1000;
      const online = !error && now - Date.parse(session.checked_at) < 45000;
      const pending = ["QUEUED", "RUNNING"].includes(session.status);
      return <div key={session.worker_id} className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-medium">Máy chủ SPX · {online ? "Đang kết nối" : "Ngoại tuyến"}</p>
          {state.canRefresh && <button disabled={busy || pending || !online} onClick={() => void refresh(session.worker_id)} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 disabled:opacity-40">{busy || pending ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}Làm mới cookie SPX</button>}</div>
        <p className="mt-2">Cookie: {session.cookie_present ? "Đã có trên máy chủ" : "Chưa có"} · Tài khoản: {session.account_saved ? "Đã lưu mã hóa" : "Chưa lưu"} · Phiên trình duyệt: {session.profile_ready ? "Đã thiết lập" : "Chưa thiết lập"}</p>
        <p className="mt-1 text-slate-500">Cập nhật cookie: {time(session.cookie_updated_at)}</p>
        <div className="mt-3 rounded-lg border bg-white p-3">
          <p className="font-medium">Thời hạn cookie: {session.cookie_expiry_kind === "fixed" && session.cookie_expires_at
            ? remaining(session.cookie_expires_at, now)
            : session.cookie_expiry_kind === "session" ? "Theo phiên đăng nhập · SPX không ghi giờ hết hạn"
            : session.cookie_expiry_kind === "missing" ? "Chưa có cookie đăng nhập"
            : "Chưa nhận thời hạn từ máy chủ"}</p>
          {session.cookie_expiry_kind === "fixed" && session.cookie_expires_at && <p className="mt-1 text-xs text-slate-500">Hết hạn lúc {time(session.cookie_expires_at)} (giờ Việt Nam). Đây là hạn ghi trong cookie; SPX có thể kết thúc phiên sớm hơn.</p>}
          {!online && <p className="mt-1 text-xs text-amber-700">Đang dùng thời hạn nhận gần nhất; chờ máy chủ kết nối để cập nhật cookie mới.</p>}
        </div>
        <p role="status" className={`mt-2 ${session.status === "FAILED" ? "text-red-600" : session.status === "SUCCEEDED" ? "font-medium text-emerald-700" : "text-slate-600"}`}>Yêu cầu làm mới gần nhất: {labels[session.status] ?? session.status}</p>
        {state.canRefresh && <CredentialsForm session={session} disabled={busy || pending || !online} onSave={envelope => refresh(session.worker_id, envelope)} />}
      </div>;
    })}
  </section>;
}
