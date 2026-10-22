import { notFound } from "next/navigation";
import { ProtectedPage } from "@/components/layout/protected-page";
import { RouteSheetView } from "@/components/settings/route-sheet-view";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canManageRiders, canAccessPickupManagement } from "@/lib/auth/permissions";

export default async function RouteSheetPage() {
  const context = await getCurrentUserContext();
  if (context && !canManageRiders(context.profile.role, context.profile.permissions) && !canAccessPickupManagement(context.profile.role, context.profile.permissions)) notFound();
  return <ProtectedPage><RouteSheetView /></ProtectedPage>;
}
