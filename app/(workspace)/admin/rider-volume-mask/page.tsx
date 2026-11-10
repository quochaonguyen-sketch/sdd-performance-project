import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { RiderVolumeMaskView } from "@/components/admin/rider-volume-mask-view";

export const metadata = {
  title: "Điều chỉnh sản lượng Rider · Super Admin",
};

export default async function RiderVolumeMaskPage() {
  const context = await getCurrentUserContext();
  if (!context) {
    redirect("/login");
  }

  // Strictly enforce Super Admin access only.
  // Regular admins, leaders, and viewers are immediately redirected out.
  if (!context.profile.is_super_admin) {
    redirect("/dashboard");
  }

  return <RiderVolumeMaskView currentUserEmail={context.user.email} />;
}
