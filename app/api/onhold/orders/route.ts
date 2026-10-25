import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { vietnamDay } from "@/lib/data-sources/catalog";
import { getOHOrders, exportOHOrders } from "@/lib/onhold/server";

export async function GET(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (context.profile.role !== "admin" && !context.profile.permissions.manage_performance) {
    return NextResponse.json({ error: "Không có quyền xem phân tích OH" }, { status: 403 });
  }

  const query = new URL(request.url).searchParams;
  const day = query.get("day") ?? vietnamDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ error: "Ngày không hợp lệ" }, { status: 400 });
  }

  const area = query.get("area") ?? "all";
  const status = query.get("status") ?? "all";
  const reason = query.get("reason") ?? "all";
  const district = query.get("district") ?? "all";
  const ward = query.get("ward") ?? "all";
  const q = (query.get("q") ?? "").trim();
  const isExport = query.get("export") === "1" || query.get("export") === "true";

  try {
    if (isExport) {
      const result = await exportOHOrders(day, { area, status, reason, district, ward, q });
      return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
    }

    const page = Math.max(0, parseInt(query.get("page") ?? "0", 10) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(query.get("limit") ?? "50", 10) || 50));
    const offset = page * limit;

    const result = await getOHOrders(day, { area, status, reason, district, ward, q, limit, offset });
    return NextResponse.json({ ...result, page, pageSize: limit }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không tải được danh sách mã đơn OH." },
      { status: 503 }
    );
  }
}
