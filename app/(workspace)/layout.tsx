import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { UserActivityTracker } from "@/components/layout/user-activity-tracker";
import { getCurrentUserContext } from "@/lib/auth/current-user";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const context = await getCurrentUserContext();
  if (!context) redirect("/login");

  return <AppShell user={{ email: context.user.email, fullName: context.profile.full_name, role: context.profile.role }}>
    <UserActivityTracker />
    {children}
  </AppShell>;
}
