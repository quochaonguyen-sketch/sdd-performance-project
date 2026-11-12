import { notFound, redirect } from "next/navigation";
import { LostView } from "@/components/lost/lost-view";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canViewPage } from "@/lib/auth/page-access";
import { vietnamDay } from "@/lib/data-sources/catalog";
import { buildLostAnalysis, recentLostDays } from "@/lib/lost/analysis";
import { defaultLostFilters, prepareLostSnapshot, selectLostPage } from "@/lib/lost/list";
import { readLostSnapshot } from "@/lib/lost/list-server";

export const metadata = { title: "Lost & Compensated" };

export default async function LostPage() {
  const user = await getCurrentUserContext();
  if (!user) redirect("/login");
  if (!canViewPage(user.profile.role, user.profile.page_access, "lost")) notFound();

  const snapshot = await readLostSnapshot().catch(() => prepareLostSnapshot([], null, "Chưa đọc được danh sách đơn. Hãy tải lại trang."));
  const today = vietnamDay();
  const analysis = buildLostAnalysis(snapshot.rowsByNumber.values(), { ...recentLostDays(today), rank: "total" }, today);
  return <LostView key={snapshot.syncedAt ?? "empty"} initial={selectLostPage(snapshot, defaultLostFilters)} initialAnalysis={analysis} />;
}
