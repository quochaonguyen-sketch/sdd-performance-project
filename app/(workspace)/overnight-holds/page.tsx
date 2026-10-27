import { redirect } from "next/navigation";
import { ProtectedPage } from "@/components/layout/protected-page";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { overnightCutoffDay } from "@/lib/overnight-holds/dates";
import { OvernightHoldsView } from "@/components/overnight-holds/overnight-holds-view";

export default async function OvernightHoldsPage() {
  const context = await getCurrentUserContext();
  if (!context) redirect("/login");

  const today = overnightCutoffDay();

  return (
    <ProtectedPage>
      <OvernightHoldsView initialDay={today} />
    </ProtectedPage>
  );
}
