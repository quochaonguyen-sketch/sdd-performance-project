import { notFound, redirect } from "next/navigation";
import { ProtectedPage } from "@/components/layout/protected-page";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { vietnamDay } from "@/lib/data-sources/catalog";
import { OHWorkspace } from "@/components/onhold/oh-workspace";

export default async function OnholdPage() {
  const context = await getCurrentUserContext();
  if (!context) redirect("/login");
  if (context.profile.role !== "admin" && !context.profile.permissions.manage_performance) notFound();

  const today = vietnamDay();
  const from = new Date(Date.parse(today) - 13 * 86400000).toISOString().slice(0, 10);

  return (
    <ProtectedPage>
      <OHWorkspace from={from} today={today} />
    </ProtectedPage>
  );
}
