import { ProtectedPage } from "@/components/layout/protected-page";
import Link from "next/link";
import { LmhubInventoryView } from "@/components/lmhub-inventory/lmhub-inventory-view";
import { notFound } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canAccessPickupManagement, canManageOperations } from "@/lib/auth/permissions";

export default async function InventoryDeliveryPage() {
  const context = await getCurrentUserContext();

  if (context && !canAccessPickupManagement(context.profile.role, context.profile.permissions)) notFound();

  return (
    <ProtectedPage>
      <nav className="mb-3 text-sm"><Link href="/backlog-history?source=delivery">Lịch sử tồn · Đối chiếu 16:00 / 16:30 →</Link></nav>
      <LmhubInventoryView canQueue={canManageOperations(context?.profile.role)} />
    </ProtectedPage>
  );
}
