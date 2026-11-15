"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApprovedOffCandidate, ApprovedOffIssue } from "@/lib/off-registration/approved-schedule";

type Preview = { entries: (ApprovedOffCandidate & { rider_name: string })[]; issues: ApprovedOffIssue[]; version: string };
const labels = { OFF_WEEKLY: "OFF tuần", OFF_APPROVED: "OFF phép", OFF_UNEXPECTED: "OFF đột xuất" } as const;

export function ApprovedOffPanel({ start, end, onImported }: { start: string; end: string; onImported: () => Promise<void> }) {
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function run(mode: "preview" | "apply") {
    setBusy(true);
    setError("");
    setNotice("");
    if (mode === "preview") setPreview(null);
    try {
      const response = await fetch("/api/attendance/schedule/approved-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, mode, version: preview?.version }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        if (response.status === 409) setPreview(null);
        throw Error(result?.error ?? "Chưa xử lý được đăng ký OFF.");
      }
      if (mode === "preview") {
        setPreview(result);
      } else {
        setPreview(null);
        const output = result.sheet_sync?.success
          ? `Đã xử lý hàng đợi Google Sheet, ghi ${result.sheet_sync.synced} mục.`
          : `Đã lưu trên web. Google Sheet: ${result.sheet_sync?.error ?? "đang chờ đồng bộ."}`;
        setNotice(`Đã nhập ${result.imported} lượt OFF.${result.conflicts ? ` Bỏ qua ${result.conflicts} lượt vừa được xếp lịch.` : ""} ${output}`);
        await onImported();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chưa xử lý được đăng ký OFF.");
    } finally {
      setBusy(false);
    }
  }

  return <details className="rounded-xl border border-slate-200 bg-white p-4">
    <summary className="cursor-pointer font-semibold">Nhập đăng ký OFF đã duyệt</summary>
    <form onSubmit={event => { event.preventDefault(); void run("preview"); }} className="mt-4 flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm">Từ ngày<Input required type="date" disabled={busy} value={from}
        onChange={event => { setFrom(event.target.value); setPreview(null); }} /></label>
      <label className="grid gap-1 text-sm">Đến ngày<Input required type="date" disabled={busy} min={from} value={to}
        onChange={event => { setTo(event.target.value); setPreview(null); }} /></label>
      <Button type="submit" variant="secondary" disabled={busy || !from || !to}>Xem trước</Button>
    </form>
    {busy && <p className="mt-3 text-sm" role="status">Đang xử lý lịch OFF…</p>}
    {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
    {notice && <p className="mt-3 text-sm" role="status">{notice}</p>}
    {preview && <div className="mt-4 space-y-3">
      <p className="text-sm" role="status">{preview.entries.length} lượt có thể nhập · {preview.issues.length} dòng bỏ qua</p>
      {preview.entries.length > 0 && <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50"><tr><th scope="col" className="p-2">Rider</th><th scope="col" className="p-2">Ngày OFF</th><th scope="col" className="p-2">Loại OFF</th></tr></thead>
          <tbody>{preview.entries.map(item => <tr key={item.row} className="border-t border-slate-100">
            <td className="p-2">{item.rider_name || item.rider_code} · {item.rider_code}</td>
            <td className="whitespace-nowrap p-2">{item.work_date.split("-").reverse().join("/")}</td>
            <td className="p-2">{labels[item.status]}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      {preview.issues.length > 0 && <details className="text-sm">
        <summary className="cursor-pointer">Xem lý do bỏ qua</summary>
        <ul className="mt-2 max-h-48 list-disc space-y-1 overflow-auto pl-5">
          {preview.issues.map(issue => <li key={issue.row}>Dòng {issue.row} · {issue.reason}</li>)}
        </ul>
      </details>}
      <Button type="button" disabled={busy || !preview.entries.length} onClick={() => void run("apply")}>Nhập vào lịch rider</Button>
    </div>}
  </details>;
}
