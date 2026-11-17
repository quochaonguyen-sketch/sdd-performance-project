import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canViewPage } from "@/lib/auth/page-access";
import { queryRiderNoOrders } from "@/lib/dashboard/rider-no-orders";
import { vietnamDay } from "@/lib/data-sources/catalog";
import { shiftCalendarDay } from "@/lib/performance/calendar";
import { getPerformanceDatabase } from "@/lib/performance/database";
import { getActiveVolumeMaskMap } from "@/lib/rider-volume-mask/service";

export async function GET() {
  const context = await getCurrentUserContext();
  if (!context) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const { role, page_access, is_super_admin } = context.profile;
  if (!canViewPage(role, page_access, "dashboard") || !canViewPage(role, page_access, "performance")) {
    return NextResponse.json({ error: "Bạn chưa có quyền xem mục này." }, { status: 403 });
  }

  try {
    const today = vietnamDay();
    const yesterday = shiftCalendarDay(today, -1);
    const start = shiftCalendarDay(today, -30);
    // Adjusted volume can make a rider with orders appear to have zero orders.
    const masks = is_super_admin ? [] : [...await getActiveVolumeMaskMap()];
    const excluded = masks.filter(([, mask]) => mask.factor !== 1).map(([code]) => code).sort();
    const value = await queryRiderNoOrders(await getPerformanceDatabase(), start, yesterday, excluded);
    return NextResponse.json(value, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[dashboard/rider-no-orders]", error);
    return NextResponse.json({ error: "Không tải được bảng rider không phát sinh đơn. Thử làm mới Dashboard." }, { status: 500 });
  }
}
