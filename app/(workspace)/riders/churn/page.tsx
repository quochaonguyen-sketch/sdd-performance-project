import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { RiderChurnView } from "@/components/riders/rider-churn-view";
import { Button } from "@/components/ui/button";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canViewPage } from "@/lib/auth/page-access";
import { HUB_SHEET_ID } from "@/lib/dashboard/hub-sheet";
import { RIDER_CHURN_TAB } from "@/lib/dashboard/rider-churn";

export const metadata = { title: "Đối chiếu rider nghỉ việc" };

export default async function RiderChurnPage() {
  const context = await getCurrentUserContext();
  if (!context) redirect("/login");
  if (!canViewPage(context.profile.role, context.profile.page_access, "riders")) notFound();
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${HUB_SHEET_ID}/edit#range=${encodeURIComponent(`'${RIDER_CHURN_TAB}'!A1`)}`;

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <header className="ops-page-header flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Đối chiếu rider nghỉ việc</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary"><Link href="/riders">Rider Directory</Link></Button>
          <Button asChild variant="outline"><a href={sheetUrl} target="_blank" rel="noreferrer">Info Rider SDD <ArrowUpRight aria-hidden="true" /></a></Button>
        </div>
      </header>
      <RiderChurnView />
    </div>
  );
}
