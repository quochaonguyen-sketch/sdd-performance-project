"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardCheck, Clock3, RefreshCw, Search, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { offIdentity, offShifts, offStatuses } from "@/lib/off-registration/model";
import { offReviewKey, type OffReviewDecisionStatus, type OffReviewRequest, type OffReviewStatus } from "@/lib/off-registration/review";
import { normalizeOperatingArea } from "@/lib/locations/operating-areas";

const [pending, approved, rejected] = offStatuses;
const filters = [...offStatuses, "Tất cả"] as const;
const pageSize = 20;
const endpoint = "/api/attendance/schedule/off-review";
const formatDate = (day: string) => day.split("-").reverse().join("/");
const tones: Record<OffReviewStatus, string> = {
  [pending]: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
  [approved]: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
  [rejected]: "bg-[var(--color-error-soft)] text-[var(--color-error)]",
};
type ReviewData = { items: OffReviewRequest[]; pending_schedule_sync: number };
type Action = { item: OffReviewRequest; status: OffReviewDecisionStatus };

export function OffReviewView() {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<typeof filters[number]>(pending);
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncNeeded, setSyncNeeded] = useState(false);
  const decisionTrigger = useRef<HTMLButtonElement>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    setRefreshing(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal });
      const result = await response.json();
      if (!response.ok || !result.success) throw Error(result.error || "Chưa tải được yêu cầu OFF.");
      if (signal.aborted) return;
      setLoadError("");
      setData(result);
      setSyncNeeded(false);
    } catch (error) {
      if (!signal.aborted) setLoadError(error instanceof Error ? error.message : "Chưa tải được yêu cầu OFF.");
    } finally {
      setRefreshing(false);
    }
  }, []);
  const refresh = useVisiblePolling(load, undefined, 45_000);

  const scoped = useMemo(() => {
    const term = offIdentity(query);
    return (data?.items ?? []).filter(item => (!month || item.work_date.startsWith(month)) &&
      (!term || offIdentity(`${item.rider_name} ${item.rider_code} ${item.area} ${item.cot}`).includes(term)));
  }, [data, month, query]);
  const matching = useMemo(() => {
    const found = scoped.filter(item => filter === "Tất cả" || item.status === filter);
    return filter === pending ? found : [...found].reverse();
  }, [scoped, filter]);
  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rows = matching.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function openDecision(item: OffReviewRequest, status: Action["status"], trigger: HTMLButtonElement) {
    decisionTrigger.current = trigger;
    setAction({ item, status });
    setNote(item.manager_note);
    setActionError("");
  }

  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || saving) return;
    const { item, status } = action;
    if (status === rejected && !note.trim()) {
      setActionError("Nhập lý do từ chối.");
      return;
    }
    setSaving(true);
    setActionError("");
    try {
      const response = await fetch(endpoint, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: item.request_id, work_date: item.work_date, rider_code: item.rider_code, status, manager_note: note }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        if (response.status === 409) void refresh();
        throw Error(result.error || "Chưa lưu được quyết định.");
      }
      const pendingSheet = result.sheet_sync?.success === false;
      if (pendingSheet) setSyncNeeded(true);
      setNotice(status === approved ? "Đã đưa lịch OFF vào bảng lịch rider." : "Đã từ chối yêu cầu OFF.");
      if (status === approved && typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("rider-schedule");
        channel.postMessage({ date: item.work_date });
        channel.close();
      }
      setAction(null);
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Chưa lưu được quyết định.");
    } finally {
      setSaving(false);
    }
  }

  async function retrySync() {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/attendance/schedule/sync", { method: "POST" });
      const result = await response.json();
      const complete = response.ok && result.success;
      setSyncNeeded(!complete);
      setNotice(complete ? "Đã chạy lại đồng bộ Google Sheet." : "Google Sheet còn thay đổi chờ đồng bộ.");
      await refresh();
    } catch {
      setNotice("Mất kết nối. Hãy thử đồng bộ lại.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    {notice && <p role="status" className="rounded-lg bg-[var(--color-accent-soft)] px-4 py-3 text-sm text-[var(--color-ink)]">{notice}</p>}
    {(syncNeeded || !!data?.pending_schedule_sync) && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-rule)] bg-[var(--color-warning-soft)] px-4 py-2">
      <div className="flex items-center gap-2 text-sm text-[var(--color-warning)]"><Clock3 size={16} aria-hidden="true" />
        <div>
          {!!data?.pending_schedule_sync && <p>{data.pending_schedule_sync} thay đổi chờ ghi vào Sheet lịch rider</p>}
          {!data?.pending_schedule_sync && <p>Google Sheet đang chờ cập nhật</p>}
        </div>
      </div>
      <Button type="button" variant="outline" size="lg" disabled={saving} onClick={() => void retrySync()}>Thử đồng bộ lại</Button>
    </div>}

    <section aria-label="Danh sách duyệt OFF" className="overflow-hidden rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-rule)] p-4">
        <label className="grid w-full gap-1.5 text-sm font-medium md:max-w-96 md:flex-1">
          Tìm rider
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-3.5 text-[var(--color-muted)]" size={16} aria-hidden="true" />
            <Input id="off-review-focus" className="h-11 pl-9" value={query} placeholder="Tên, mã, khu vực hoặc COT"
              onChange={event => { setQuery(event.target.value); setPage(1); }} />
          </span>
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 text-sm font-medium">Tháng nghỉ
            <Input className="h-11" type="month" value={month} onChange={event => { setMonth(event.target.value); setPage(1); }} />
          </label>
          {month && <Button type="button" size="lg" variant="ghost" onClick={() => { setMonth(""); setPage(1); }}>Bỏ lọc tháng</Button>}
          <Button type="button" variant="outline" size="lg" disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw className={refreshing ? "motion-safe:animate-spin" : ""} aria-hidden="true" /> Tải lại
          </Button>
        </div>
      </div>
      <div role="group" aria-label="Trạng thái yêu cầu" className="flex flex-wrap gap-2 border-b border-[var(--color-rule)] bg-[var(--color-paper-2)] px-4 py-3">
        {filters.map(status => {
          const count = status === "Tất cả" ? scoped.length : scoped.filter(item => item.status === status).length;
          return <Button type="button" size="lg" key={status} variant={filter === status ? "default" : "ghost"} aria-pressed={filter === status}
            onClick={() => { setFilter(status); setPage(1); }}>
            {status} {data && <span className="font-semibold tabular-nums">{count}</span>}
          </Button>;
        })}
      </div>
      {loadError && <p role="alert" className="m-4 rounded-lg bg-[var(--color-error-soft)] p-3 text-sm text-[var(--color-error)]">{loadError}</p>}
      {rows.length ? <>
        <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b border-[var(--color-rule)] px-4 py-2 text-xs font-semibold text-[var(--color-muted)] lg:grid" aria-hidden="true">
          <span>Rider</span><span>Ngày và ca nghỉ</span><span>Lý do</span><span className="text-right">Trạng thái và xử lý</span>
        </div>
        <ul className="divide-y divide-[var(--color-rule)]">
          {rows.map(item => <li key={offReviewKey(item)} className="grid gap-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-4">
            <div className="min-w-0">
              <p className="break-words font-semibold">{item.rider_name || item.rider_code}</p>
              <p className="mt-1 break-words text-xs text-[var(--color-muted)]">{[item.rider_code, item.area, item.cot].filter(Boolean).join(" · ")}</p>
            </div>
            <div>
              <p className="flex items-center gap-2 font-semibold tabular-nums"><CalendarDays size={15} aria-hidden="true" /><time dateTime={item.work_date}>{formatDate(item.work_date)}</time></p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">{[item.type, item.shift].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="min-w-0 [overflow-wrap:anywhere]">
              <p>{item.reason || "—"}</p>
              {item.manager_note && <p className="mt-1 text-xs text-[var(--color-muted)]">Quản lý · {item.manager_note}</p>}
            </div>
            <div className="flex flex-col items-start gap-2 lg:items-end">
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[item.status]}`}>{item.status}</span>
              {item.status === approved && item.decided_at && <Button asChild variant="ghost" size="lg">
                <Link href={`/team/rider-schedule?date=${item.work_date}&rider=${encodeURIComponent(item.rider_code)}&area=${normalizeOperatingArea(item.area) ?? ""}`}>Xem ngày trên lịch</Link>
              </Button>}
              {!item.decided_at && item.status !== rejected && <div className="flex flex-wrap gap-2 lg:justify-end">
                {item.status === pending && <Button type="button" variant="outline" size="lg" disabled={saving} onClick={event => openDecision(item, rejected, event.currentTarget)}>Từ chối</Button>}
                {item.shift === offShifts.FULL_DAY && <Button type="button" size="lg" disabled={saving} onClick={event => openDecision(item, approved, event.currentTarget)}>
                  <Check aria-hidden="true" /> {item.status === pending ? "Duyệt" : "Đưa vào lịch"}
                </Button>}
              </div>}
              {!item.decided_at && item.status !== rejected && item.shift !== offShifts.FULL_DAY && <p className="text-xs text-[var(--color-warning)]">Nghỉ theo ca cần xử lý riêng</p>}
            </div>
          </li>)}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-rule)] px-4 py-3 text-sm">
          <p className="text-[var(--color-muted)]">{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, matching.length)} / {matching.length} lượt nghỉ</p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className="size-11 p-0" disabled={currentPage <= 1} aria-label="Trang trước" onClick={() => setPage(currentPage - 1)}><ChevronLeft aria-hidden="true" /></Button>
            <span className="tabular-nums">{currentPage}/{pageCount}</span>
            <Button type="button" variant="outline" className="size-11 p-0" disabled={currentPage >= pageCount} aria-label="Trang sau" onClick={() => setPage(currentPage + 1)}><ChevronRight aria-hidden="true" /></Button>
          </div>
        </div>
      </> : !loadError && <div className="grid justify-items-center gap-2 p-12 text-center text-sm text-[var(--color-muted)]" role="status">
        <ClipboardCheck size={26} aria-hidden="true" />
        {data ? "Không có yêu cầu phù hợp." : "Đang tải yêu cầu OFF…"}
      </div>}
    </section>

    <Dialog.Root open={!!action} onOpenChange={open => { if (!open && !saving) setAction(null); }}>
      {action && <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--color-scrim)]" />
        <Dialog.Content className="fixed inset-x-4 top-1/2 z-50 mx-auto max-h-[calc(100dvh-2rem)] max-w-md -translate-y-1/2 overflow-auto rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper)] p-5 text-[var(--color-ink)] shadow-xl"
          onCloseAutoFocus={event => {
            event.preventDefault();
            const trigger = decisionTrigger.current;
            if (trigger?.isConnected && !trigger.disabled) trigger.focus();
            else document.getElementById("off-review-focus")?.focus();
          }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-lg font-bold">{action.status === approved ? "Xác nhận đưa OFF vào lịch" : "Từ chối yêu cầu OFF"}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[var(--color-muted)]">
                {action.item.rider_name || action.item.rider_code} · {formatDate(action.item.work_date)} · {action.item.shift}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild><Button type="button" variant="ghost" className="size-11 p-0" aria-label="Đóng" disabled={saving}><X aria-hidden="true" /></Button></Dialog.Close>
          </div>
          <form className="mt-4 space-y-4" onSubmit={decide}>
            <label className="grid gap-1.5 text-sm font-medium">
              {action.status === rejected ? "Lý do từ chối" : "Ghi chú quản lý (tùy chọn)"}
              <textarea className="ops-input min-h-24 w-full p-3" required={action.status === rejected} maxLength={500}
                value={note} onChange={event => setNote(event.target.value)} disabled={saving} />
            </label>
            {actionError && <p role="alert" className="text-sm text-[var(--color-error)]">{actionError}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close asChild><Button type="button" size="lg" variant="outline" disabled={saving}>Hủy</Button></Dialog.Close>
              <Button type="submit" size="lg" variant={action.status === approved ? "default" : "destructive"} disabled={saving}>
                {saving ? "Đang lưu…" : action.status === approved ? "Xác nhận duyệt" : "Xác nhận từ chối"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>}
    </Dialog.Root>
  </>;
}
