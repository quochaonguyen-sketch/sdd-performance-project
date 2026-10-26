import { ProtectedPage } from "@/components/layout/protected-page";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { TeamView } from "@/components/team/team-view";

export default async function TeamPage() {
  const context = await getCurrentUserContext();
  return <ProtectedPage><TeamView canEdit={context?.profile.role === "admin"} /></ProtectedPage>;
}
