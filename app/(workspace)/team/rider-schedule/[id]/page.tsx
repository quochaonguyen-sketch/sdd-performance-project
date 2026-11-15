import { notFound } from "next/navigation";
import { RiderMonthView } from "@/components/attendance/rider-month-view";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canEditStaff, canViewPage } from "@/lib/auth/page-access";
import { resolveOffScheduleSpreadsheetId } from "@/lib/google/off-schedule";

export default async function RiderScheduleDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const context = await getCurrentUserContext();
  if (!context || !canViewPage(context.profile.role, context.profile.page_access, "team")) notFound();
  const [{ id }, { month }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) notFound();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const canEdit = canEditStaff(context.profile.role, context.profile.page_access);
  const scheduleId = canEdit ? resolveOffScheduleSpreadsheetId() : null;
  return <RiderMonthView riderId={id} initialMonth={typeof month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : today.slice(0, 7)}
    staffCanEdit={canEdit} offSheetUrl={scheduleId ? `https://docs.google.com/spreadsheets/d/${scheduleId}/edit` : undefined} />;
}
