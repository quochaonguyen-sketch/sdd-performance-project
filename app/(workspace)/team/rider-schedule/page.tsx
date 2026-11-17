import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ChevronRight, MapPin } from "lucide-react";
import { AttendanceView } from "@/components/attendance/attendance-view";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canEditStaff, canViewPage } from "@/lib/auth/page-access";
import { resolveOffScheduleSpreadsheetId } from "@/lib/google/off-schedule";
import { OPERATING_AREAS, normalizeOperatingArea } from "@/lib/locations/operating-areas";

export default async function RiderSchedulePage({ searchParams }: { searchParams: Promise<{ month?: string; date?: string; rider?: string; area?: string; embed?: string }> }) {
  const context = await getCurrentUserContext();
  if (!context || !canViewPage(context.profile.role, context.profile.page_access, "team")) notFound();
  const canEdit = canEditStaff(context.profile.role, context.profile.page_access);
  const scheduleId = canEdit ? resolveOffScheduleSpreadsheetId() : null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const { month, date, rider, area, embed } = await searchParams;
  const selectedArea = typeof area === "string" ? normalizeOperatingArea(area) : null;
  const initialDate = z.iso.date().safeParse(date).data ?? (typeof month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month !== today.slice(0, 7)
    ? `${month}-01` : today);
  const initialRider = typeof rider === "string" && /^[a-z0-9-]{2,30}$/i.test(rider) ? rider : "";
  const query = new URLSearchParams();
  if (date || month) query.set("date", initialDate);
  if (initialRider && !selectedArea) query.set("rider", initialRider);
  if (embed === "split") query.set("embed", embed);
  const pickerLink = query.size ? `/team/rider-schedule?${query}` : "/team/rider-schedule";

  return <>
    <nav aria-label="Điều hướng lịch rider" className="mx-auto mb-4 flex max-w-[1600px] flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
      <Link href="/team" className="underline underline-offset-4">Staffing &amp; Scheduling</Link>
      <Link href="/off-registration" className="underline underline-offset-4">Form đăng ký OFF</Link>
      {canEdit && <Link href="/team/off-review" className="font-semibold text-[var(--color-accent)] underline underline-offset-4">Duyệt lịch OFF</Link>}
      {scheduleId && <a href={`https://docs.google.com/spreadsheets/d/${scheduleId}/edit`} target="_blank" rel="noreferrer" className="underline underline-offset-4">Google Sheet lịch OFF ↗</a>}
      {selectedArea && <Link href={pickerLink} prefetch={false} className="font-semibold text-[var(--color-accent)] underline underline-offset-4">Đổi khu vực</Link>}
    </nav>
    {selectedArea ? <AttendanceView key={`${selectedArea}:${initialDate}:${initialRider}`} area={selectedArea}
      initialMonth={initialDate.slice(0, 7)} initialDate={initialDate} initialRider={initialRider} staffCanEdit={canEdit}
      offSheetUrl={scheduleId ? `https://docs.google.com/spreadsheets/d/${scheduleId}/edit` : undefined} /> :
      <section className="mx-auto max-w-[1600px] space-y-4">
        <header className="ops-page-header">
          <h1 className="text-2xl font-bold">Lịch rider</h1>
        </header>
        <div className="rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper)] p-4 sm:p-5">
          <h2 className="font-semibold text-[var(--color-ink)]">Chọn khu vực xem lịch</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {OPERATING_AREAS.map(code => {
              const params = new URLSearchParams(query);
              params.set("area", code);
              return <li key={code}><Link href={`/team/rider-schedule?${params}`} prefetch={false}
                className="flex min-h-16 items-center gap-3 rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-2)] px-3 py-2 font-semibold hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--color-accent-soft)] text-[var(--color-accent)]"><MapPin size={17} aria-hidden="true" /></span>
                Khu vực {code.slice(2)}
                <ChevronRight size={16} className="ml-auto shrink-0 text-[var(--color-muted)]" aria-hidden="true" />
              </Link></li>;
            })}
          </ul>
        </div>
      </section>}
  </>;
}
