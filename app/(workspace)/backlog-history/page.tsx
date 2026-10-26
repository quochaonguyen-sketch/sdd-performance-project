import { notFound } from "next/navigation";
import { ProtectedPage } from "@/components/layout/protected-page";
import { BacklogHistoryView } from "@/components/lmhub-inventory/backlog-history-view";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canAccessPickupManagement } from "@/lib/auth/permissions";

export default async function BacklogHistoryPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const context = await getCurrentUserContext();
  if (context && !canAccessPickupManagement(context.profile.role, context.profile.permissions)) notFound();
  const { source } = await searchParams;
  return <ProtectedPage><BacklogHistoryView initialSource={source === "delivery" ? "delivery" : "pickup"} /></ProtectedPage>;
}
