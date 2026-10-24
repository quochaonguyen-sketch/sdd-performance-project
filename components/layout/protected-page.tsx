import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { UserActivityTracker } from "@/components/layout/user-activity-tracker";

export async function ProtectedPage({ children }: { children: React.ReactNode }) {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  return (
    <Suspense fallback={<main className="app-embedded-main">{children}</main>}>
      <AppShell
        user={{
          email: context.user.email,
          fullName: context.profile.full_name,
          role: context.profile.role,
        }}
      >
        <UserActivityTracker />
        {children}
      </AppShell>
    </Suspense>
  );
}
