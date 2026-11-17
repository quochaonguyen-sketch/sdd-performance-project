import { ProtectedPage } from "@/components/layout/protected-page";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { TeamView } from "@/components/team/team-view";
import {canEditStaff,canViewPage} from "@/lib/auth/page-access";
import {notFound} from "next/navigation";
import Link from "next/link";

export default async function TeamPage() {
  const context = await getCurrentUserContext();
  if(context&&!canViewPage(context.profile.role,context.profile.page_access,"team"))notFound();
  const canEdit = !!context && canEditStaff(context.profile.role, context.profile.page_access);
  return <ProtectedPage>
    <nav aria-label="Lịch OFF" className="mb-3 flex flex-wrap gap-2">
      <Link href="/team/rider-schedule" className="inline-flex min-h-10 items-center rounded-md bg-[var(--color-accent)] px-3 text-sm font-semibold text-white">Lịch rider</Link>
      <Link href="/off-registration" className="inline-flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold">Đăng ký lịch OFF</Link>
      {canEdit && <Link href="/team/off-review"
        className="inline-flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold">Duyệt lịch OFF</Link>}
    </nav>
    <TeamView canEdit={canEdit} />
  </ProtectedPage>;
}
