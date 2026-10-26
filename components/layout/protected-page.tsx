import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/current-user";

export async function ProtectedPage({ children }: { children: React.ReactNode }) {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  // Keep the per-page auth check; the shared workspace layout owns the shell.
  return children;
}
