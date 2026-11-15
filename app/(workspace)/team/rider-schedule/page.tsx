import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendanceView } from "@/components/attendance/attendance-view";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canEditStaff, canViewPage } from "@/lib/auth/page-access";
import { resolveOffScheduleSpreadsheetId } from "@/lib/google/off-schedule";
import { offRegistrationSpreadsheetId, offRegistrationSpreadsheetLink } from "@/lib/off-registration/sheets";

export default async function RiderSchedulePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const context = await getCurrentUserContext();
  if (!context || !canViewPage(context.profile.role, context.profile.page_access, "team")) notFound();
  const canEdit = canEditStaff(context.profile.role, context.profile.page_access);
  const scheduleId = canEdit ? resolveOffScheduleSpreadsheetId() : null;
  const registrationId = canEdit ? offRegistrationSpreadsheetId() : null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const { month } = await searchParams;
  const initialDate = typeof month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month !== today.slice(0, 7)
    ? `${month}-01` : today;

  return <>
    <nav aria-label="Điều hướng lịch rider" className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
      <Link href="/team" className="underline underline-offset-4">Staffing &amp; Scheduling</Link>
      <Link href="/off-registration" className="underline underline-offset-4">Form đăng ký OFF</Link>
      {registrationId && <a href={offRegistrationSpreadsheetLink(registrationId)} target="_blank" rel="noreferrer" className="underline underline-offset-4">Duyệt đăng ký OFF ↗</a>}
      {scheduleId && <a href={`https://docs.google.com/spreadsheets/d/${scheduleId}/edit`} target="_blank" rel="noreferrer" className="underline underline-offset-4">Google Sheet lịch OFF ↗</a>}
    </nav>
    <AttendanceView initialMonth={initialDate.slice(0, 7)} initialDate={initialDate} staffCanEdit={canEdit}
      offSheetUrl={scheduleId ? `https://docs.google.com/spreadsheets/d/${scheduleId}/edit` : undefined}
      registrationConfigured={!!registrationId} />
  </>;
}
