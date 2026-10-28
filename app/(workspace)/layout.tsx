import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { UserActivityTracker } from "@/components/layout/user-activity-tracker";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { ProductUpdatesProvider } from "@/components/feedback/use-product-updates";
import { FilterMemoryProvider } from "@/components/layout/filter-memory";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const context = await getCurrentUserContext();
  if (!context) redirect("/login");

  return <FilterMemoryProvider key={context.user.id} userId={context.user.id}><ProductUpdatesProvider><AppShell user={{ email: context.user.email, fullName: context.profile.full_name, role: context.profile.role, pageAccess:context.profile.page_access }}>
    <UserActivityTracker />
    {children}
  </AppShell></ProductUpdatesProvider></FilterMemoryProvider>;
}
