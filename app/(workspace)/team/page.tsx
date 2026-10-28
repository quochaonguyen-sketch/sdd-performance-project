import { ProtectedPage } from "@/components/layout/protected-page";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { TeamView } from "@/components/team/team-view";
import {canEditStaff,canViewPage} from "@/lib/auth/page-access";
import {notFound} from "next/navigation";

export default async function TeamPage() {
  const context = await getCurrentUserContext();
  if(context&&!canViewPage(context.profile.role,context.profile.page_access,"team"))notFound();
  return <ProtectedPage><TeamView canEdit={!!context&&canEditStaff(context.profile.role,context.profile.page_access)} /></ProtectedPage>;
}
