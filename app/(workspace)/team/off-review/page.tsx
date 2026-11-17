import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { OffReviewView } from "@/components/attendance/off-review-view";
import { Button } from "@/components/ui/button";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canEditStaff } from "@/lib/auth/page-access";

export const metadata = { title: "Duyệt lịch OFF" };

export default async function OffReviewPage() {
  const context = await getCurrentUserContext();
  if (!context || !canEditStaff(context.profile.role, context.profile.page_access)) notFound();

  return <div className="mx-auto max-w-[1600px] space-y-5">
    <header className="ops-page-header flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-tight">Duyệt lịch OFF</h1>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="lg"><Link href="/team/rider-schedule"><CalendarDays aria-hidden="true" /> Bảng lịch rider</Link></Button>
        <Button asChild variant="outline" size="lg"><Link href="/off-registration">Form đăng ký</Link></Button>
      </div>
    </header>
    <OffReviewView />
  </div>;
}
