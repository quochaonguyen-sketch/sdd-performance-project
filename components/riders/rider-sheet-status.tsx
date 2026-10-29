"use client";
import { useEffect, useState } from "react";
import { RIDER_PLAN_ID } from "@/lib/google/rider-plan";

type State = { status: string; stale?: boolean; checkedAt?: string; validRows?: number; skippedRows?: number; error?: string; issues?: { row: number; rider_code: string; error: string }[] };
export function RiderSheetStatus() {
  const [state, setState] = useState<State | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const read = async () => {
      try {
        const response = await fetch("/api/riders/sheet-sync", { cache: "no-store", signal: controller.signal });
        if (response.ok) setState(await response.json());
      } catch { /* The source badge remains usable during a temporary read failure. */ }
    };
    void read();
    const timer = setInterval(() => { if (!document.hidden) void read(); }, 60000);
    return () => { clearInterval(timer); controller.abort(); };
  }, []);
  const stale = state?.stale;
  return <aside className="my-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><a href={`https://docs.google.com/spreadsheets/d/${RIDER_PLAN_ID}/edit#gid=0`} target="_blank" rel="noreferrer" className="font-semibold text-blue-700">Nguồn rider: Data Web dashboard SDD ↗</a><span className="text-xs text-slate-500">Sheet → Web · Kiểm tra mỗi phút</span></div>
    <p className="mt-1 text-xs text-slate-600">{state?.status === "SYNCED" ? `${state.validRows?.toLocaleString("vi-VN")} dòng hợp lệ · ${state.skippedRows ?? 0} dòng bỏ qua · Kiểm tra ${new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }).format(new Date(state.checkedAt!))}${stale ? " · Trạng thái đã cũ; kiểm tra tiến trình đồng bộ" : ""}` : state?.error ?? "Đang kiểm tra kết nối nguồn…"}</p>
    {!!state?.issues?.length && <details className="mt-2 text-xs text-amber-800"><summary className="cursor-pointer">Xem {state.issues.length} dòng cần sửa trên Sheet</summary><ul className="mt-2 max-h-48 space-y-1 overflow-auto">{state.issues.map(issue => <li key={issue.row}>Dòng {issue.row} · ID {issue.rider_code || "trống"}: {issue.error}</li>)}</ul></details>}
  </aside>;
}
