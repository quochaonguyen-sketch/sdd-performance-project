import { notFound } from "next/navigation";
import { ProtectedPage } from "@/components/layout/protected-page";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { UserActivityView } from "@/components/settings/user-activity-view";

export default async function UserActivityPage() {
  const context = await getCurrentUserContext();
  if (context && context.profile.role !== "admin") notFound();
  return <ProtectedPage><UserActivityView /></ProtectedPage>;
}
