import { notFound } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { ProtectedPage } from "@/components/layout/protected-page";
import { SiteHealthView } from "@/components/settings/site-health-view";

export default async function SiteHealthPage() {
  const context = await getCurrentUserContext();
  if (context && context.profile.role !== "admin") notFound();
  return <ProtectedPage><SiteHealthView /></ProtectedPage>;
}
