import { notFound, redirect } from "next/navigation";
import { ProtectedPage } from "@/components/layout/protected-page";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canManageReturn } from "@/lib/auth/permissions";
import { getReturnWorkspace } from "@/lib/return-orders/workspace-server";
import { ReturnWorkspace } from "@/components/return-orders/return-workspace";

export default async function ReturnOrdersPage() {
  const context = await getCurrentUserContext();
  if (!context) redirect("/login");
  if (!canManageReturn(context.profile.role, context.profile.permissions)) notFound();
  let data = { rows: [], snapshotAt: null } as Awaited<ReturnType<typeof getReturnWorkspace>>;
  let error = "";
  try { data = await getReturnWorkspace(); }
  catch { error = "Không tải được dữ liệu hàng trả. Vui lòng thử làm mới."; }
  return <ProtectedPage><ReturnWorkspace initialData={data} initialError={error} initialNow={data.readAt ?? 0} /></ProtectedPage>;
}
