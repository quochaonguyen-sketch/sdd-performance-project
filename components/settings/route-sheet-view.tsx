"use client";

import { useEffect, useState } from "react";
import { Download, ExternalLink, FileSpreadsheet, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLAN_TABS, type PlanChange, type PlanIssue } from "@/lib/operations-sheet/schema";

type Preview = { changes: PlanChange[]; rows: number; token: string };
type Config = { rider: boolean; pickup: boolean; serviceAccount: string; spreadsheetId: string; googleConfigured: boolean };

export function RouteSheetView() {
  const [config, setConfig] = useState<Config | null>(null);
  const [source, setSource] = useState<"excel" | "google">("excel");
  const [file, setFile] = useState<File | null>(null);
  const [spreadsheet, setSpreadsheet] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [issues, setIssues] = useState<PlanIssue[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/operations-sheet", { cache: "no-store", signal: controller.signal }).then(r => r.json()).then(result => {
      if (!result.success) throw new Error(result.error);
      setConfig(result);
      setSpreadsheet(result.spreadsheetId);
    }).catch(error => { if (error.name !== "AbortError") setMessage(error.message); });
    return () => controller.abort();
  }, []);

  async function sync(action: "preview" | "apply") {
    setBusy(true); setMessage(""); setIssues([]);
    if (action === "preview") setPreview(null);
    try {
      const body = new FormData();
      body.set("action", action);
      if (source === "excel") {
        if (!file) throw new Error("Hãy chọn file Excel trước.");
        body.set("file", file);
      } else body.set("spreadsheet", spreadsheet);
      if (action === "apply") body.set("token", preview?.token ?? "");
      const response = await fetch("/api/operations-sheet", { method: "POST", body });
      const result = await response.json();
      if (!response.ok || !result.success) { setIssues(result.issues ?? []); throw new Error(result.error ?? "Đồng bộ thất bại."); }
      if (action === "preview") {
        setPreview(result);
        if (!result.changes.length) setMessage(`Đã đọc ${result.rows} dòng. Không có thay đổi cần áp dụng.`);
      } else { setPreview(null); setMessage(`Đã cập nhật ${result.applied} dòng tuyến trên web.`); }
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof Error ? error.message : "Không kết nối được máy chủ.");
    } finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-[1500px] space-y-5">
    <header><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Quản lý tuyến</p><h1 className="mt-1 text-2xl font-bold">Excel / Google Sheet</h1><p className="mt-2 text-sm text-slate-600">Chỉnh tuyến rider, COT, KV, phường giao / lấy và tuyến PUP trong cùng một file.</p></header>
    <section className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-xl border bg-white p-5"><h2 className="font-bold">1. Lấy dữ liệu đang dùng</h2><p className="my-3 text-sm text-slate-600">Tải dữ liệu web để có đúng mã rider và mã phân công. File mẫu có danh mục chọn và ví dụ điền.</p><div className="flex flex-wrap gap-2"><a className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold" href="/templates/SDD_Quan_ly_tuyen.xlsx"><FileSpreadsheet size={16} />File mẫu Excel</a><a className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold" href="/api/operations-sheet?download=data"><Download size={16} />Dữ liệu web</a></div></div>
      <div className="rounded-xl border bg-white p-5"><h2 className="font-bold">2. Chỉnh trong Excel hoặc Sheets</h2><p className="mt-3 text-sm text-slate-600">Giữ nguyên tên tab và hàng tiêu đề. Ô trống giữ giá trị đang có; nhập <code>[XOA]</code> để xóa trường tuyến tùy chọn. Dòng bị xóa khỏi file không xóa dữ liệu web.</p><p className="mt-2 text-sm text-slate-600">Mỗi tab tối đa 5.000 dòng. Các tab hướng dẫn, danh mục và ví dụ không được nhập vào web.</p></div>
      <div className="rounded-xl border bg-white p-5"><h2 className="font-bold">3. Xem trước rồi áp dụng</h2><p className="mt-3 text-sm text-slate-600">Web kiểm tra mã, dữ liệu trùng và quyền chỉnh sửa. Bản xem trước có hiệu lực 10 phút; nếu dữ liệu đổi cần xem trước lại.</p><p className="mt-2 text-sm text-slate-600">Quyền của bạn: {config ? [config.rider && "Tuyến rider", config.pickup && "Tuyến pickup"].filter(Boolean).join(" · ") : "Đang kiểm tra…"}</p></div>
    </section>
    <section className="space-y-4 rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-center gap-3"><h2 className="mr-auto font-bold">Nguồn dữ liệu</h2><Button variant={source === "excel" ? "default" : "secondary"} disabled={busy} onClick={() => { setSource("excel"); setPreview(null); }}>Excel</Button><Button variant={source === "google" ? "default" : "secondary"} disabled={busy} onClick={() => { setSource("google"); setPreview(null); }}>Google Sheets</Button></div>
      {source === "excel" ? <label className="block space-y-2 text-sm font-medium"><span>File .xlsx, tối đa 5 MB</span><input className="block w-full rounded-lg border p-3" type="file" accept=".xlsx" disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setPreview(null); }} /></label> : <div className="space-y-3"><label className="block space-y-2 text-sm font-medium"><span>Link hoặc ID Google Sheet</span><Input value={spreadsheet} disabled={busy} onChange={event => { setSpreadsheet(event.target.value); setPreview(null); }} placeholder="https://docs.google.com/spreadsheets/d/…" /></label><p className="text-sm text-slate-600">Tải file mẫu lên Google Drive, mở bằng Google Sheets rồi chọn Lưu dưới dạng Google Trang tính. Chia sẻ quyền Người xem cho <strong>{config?.serviceAccount || "email Service Account do quản trị viên cấu hình"}</strong>.</p>{!config?.googleConfigured ? <p className="text-sm text-amber-800">Chưa cấu hình Google Service Account trên máy chủ. Bạn có thể nhập Excel ngay.</p> : null}<a href="https://sheets.google.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-700">Mở Google Sheets<ExternalLink size={14} /></a></div>}
      <Button disabled={busy || !config || (source === "google" && !config.googleConfigured)} onClick={() => void sync("preview")}><RefreshCcw size={16} className={busy ? "animate-spin" : ""} />{busy ? "Đang xử lý…" : "Xem trước thay đổi"}</Button>
      {message ? <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm">{message}</p> : null}
      {issues.length ? <ul role="alert" className="space-y-1 rounded-lg bg-red-50 p-4 text-sm text-red-800">{issues.map((issue, index) => <li key={index}>{issue.tab} · Dòng {issue.row}: {issue.message}</li>)}</ul> : null}
    </section>
    {preview && preview.changes.length > 0 ? <section className="overflow-hidden rounded-xl border bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h2 className="font-bold">{preview.changes.length} dòng thay đổi / {preview.rows} dòng đã đọc</h2><p className="mt-1 text-sm text-slate-600">Hiển thị tối đa 200 dòng. Tất cả {preview.changes.length} dòng sẽ được áp dụng.</p></div><Button disabled={busy} onClick={() => void sync("apply")}>Áp dụng {preview.changes.length} dòng</Button></div><div className="max-h-[560px] overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50"><tr><th className="p-3">Tab / dòng</th><th className="p-3">Mã</th><th className="p-3">Trường</th><th className="p-3">Đang dùng</th><th className="p-3">Sau thay đổi</th></tr></thead><tbody>{preview.changes.slice(0, 200).flatMap(change => Object.entries(change.after).map(([field, value]) => { const config = PLAN_TABS[change.tab]; const label = config.headers[(config.fields as readonly string[]).indexOf(field)]; return <tr key={`${change.tab}:${change.key}:${field}`} className="border-t align-top"><td className="p-3">{change.tab} · {change.row}</td><td className="p-3 font-mono">{change.key}</td><td className="p-3">{label}</td><td className="p-3 text-slate-500">{String(change.before[field] ?? "—")}</td><td className="p-3 font-semibold">{value ?? "Xóa giá trị"}</td></tr>; }))}</tbody></table></div></section> : null}
  </div>;
}

