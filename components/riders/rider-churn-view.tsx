"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RiderChurnReport } from "@/lib/dashboard/rider-churn";
import { readJsonResponse } from "@/lib/http/json-response";

const timeLabel = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });

export function RiderChurnView() {
  const [report, setReport] = useState<RiderChurnReport | null>(null);
  const [busy, setBusy] = useState<"check" | "update" | null>("check");
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<number | null>(null);
  const pending = report?.rows.filter(row => row.status === "active") ?? [];
  const editable = pending.filter(row => row.canDeactivate).map(row => row.riderId);

  const reconcile = useCallback(async (riderIds?: string[], signal?: AbortSignal) => {
    setBusy(riderIds ? "update" : "check");
    setError(null);
    setUpdated(null);
    try {
      const response = await fetch("/api/riders/churn", {
        method: riderIds ? "POST" : "GET",
        headers: riderIds ? { "Content-Type": "application/json" } : undefined,
        body: riderIds ? JSON.stringify({ riderIds }) : undefined,
        cache: "no-store",
        signal,
      });
      const result = await readJsonResponse(response, "Đối chiếu rider nghỉ việc");
      if (!response.ok) throw new Error(result.error ?? "Không đối chiếu được dữ liệu.");
      if (signal?.aborted) return;
      setReport(riderIds ? result.report : result);
      if (riderIds) setUpdated(result.updated);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Không đối chiếu được dữ liệu.");
    } finally {
      if (!signal?.aborted) setBusy(null);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void reconcile(undefined, controller.signal), 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [reconcile]);

  return (
    <section aria-label="Kết quả đối chiếu" className="overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-rule)] bg-[var(--color-paper)]">
      <div className="space-y-4 border-b border-[var(--color-rule)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Rider khớp trạng thái Churned theo ID</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]" role="status">
              {busy === "check" ? "Đang đọc Info Rider SDD…" : busy === "update" ? "Đang xác minh lại và cập nhật…" : report ? `Đối chiếu lúc ${timeLabel.format(new Date(report.checkedAt))}` : "Chờ kết quả đối chiếu."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={!!busy} onClick={() => void reconcile()}><RefreshCcw aria-hidden="true" /> Đối chiếu lại</Button>
            {editable.length > 0 && <Button type="button" disabled={!!busy || !!error} onClick={() => void reconcile(editable)}>Chuyển {editable.length} rider sang nghỉ việc</Button>}
          </div>
        </div>
        {report && <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--color-muted)]"><span><strong>{report.rows.length}</strong> ID trùng</span><span><strong>{pending.length}</strong> còn Active</span><span><strong>{report.rows.length - pending.length}</strong> đã nghỉ việc trên web</span></p>}
        {error && <p role="alert" className="text-sm text-[var(--color-warning)]">{error}</p>}
        {updated !== null && <p role="status" className="text-sm text-[var(--color-success)]">{updated > 0 ? `Đã chuyển ${updated} rider sang nghỉ việc.` : "Đã kiểm tra lại. Các ID đã chọn không còn cần chuyển trạng thái."}</p>}
      </div>
      {report && (report.rows.length ? (
        <div className="max-h-[60vh] overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)]" role="region" aria-label="Bảng Rider ID đã đối chiếu" tabIndex={0}>
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-[var(--color-paper-2)]">
              <tr><th scope="col" className="px-4 py-3 sm:px-5">Rider ID</th><th scope="col" className="px-4 py-3 sm:px-5">Trạng thái trên web</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-rule)]">
              {report.rows.map(row => (
                <tr key={row.riderId}>
                  <th scope="row" className="px-4 py-3 font-medium tabular-nums sm:px-5">{row.riderId}</th>
                  <td className={`px-4 py-3 sm:px-5 ${row.status === "active" ? "text-[var(--color-warning)]" : "text-[var(--color-muted)]"}`}>{row.status === "active" ? "Còn Active" : "Đã nghỉ việc"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="p-5 text-sm text-[var(--color-muted)]">Không có Rider ID trùng với danh sách Churned.</p>)}
    </section>
  );
}
