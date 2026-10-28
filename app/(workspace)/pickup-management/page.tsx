import { ProtectedPage } from "@/components/layout/protected-page";
import { PickupToolsView } from "@/components/pickup/pickup-tools-view";
import { notFound } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canAccessPickupManagement } from "@/lib/auth/permissions";
import {canViewPage} from "@/lib/auth/page-access";

export default async function PickupManagementPage() {
  const context = await getCurrentUserContext();

  if (context && (!canAccessPickupManagement(context.profile.role, context.profile.permissions)||!canViewPage(context.profile.role,context.profile.page_access,"pickup_management"))) notFound();

  return (
    <ProtectedPage>
      <PickupToolsView />
    </ProtectedPage>
  );
}
