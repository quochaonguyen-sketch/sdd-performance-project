import { ProtectedPage } from "@/components/layout/protected-page";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { TeamView } from "@/components/team/team-view";
import {canEditStaff,canViewPage} from "@/lib/auth/page-access";
import {notFound} from "next/navigation";
import Link from "next/link";
import { offRegistrationSpreadsheetId, offRegistrationSpreadsheetLink } from "@/lib/off-registration/sheets";

export default async function TeamPage() {
  const context = await getCurrentUserContext();
  if(context&&!canViewPage(context.profile.role,context.profile.page_access,"team"))notFound();
  const canEdit = !!context && canEditStaff(context.profile.role, context.profile.page_access);
  const offSheet = canEdit ? offRegistrationSpreadsheetId() : null;
  return <ProtectedPage>
    <nav aria-label="Lịch OFF" className="mb-3 flex flex-wrap gap-2">
      <Link href="/off-registration" className="inline-flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold">Đăng ký lịch OFF</Link>
      {offSheet && <a href={offRegistrationSpreadsheetLink(offSheet)} target="_blank" rel="noreferrer"
        className="inline-flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold">Quản lý đăng ký OFF ↗</a>}
    </nav>
    <TeamView canEdit={canEdit} />
  </ProtectedPage>;
}
