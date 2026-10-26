import { ProtectedPage } from "@/components/layout/protected-page";
import { OperationsDashboard } from "@/components/dashboard/operations-dashboard";

export default function DashboardPage() {
  return (
    <ProtectedPage>
      <OperationsDashboard />
    </ProtectedPage>
  );
}
