import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canViewPage } from "@/lib/auth/page-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { vietnamDay } from "@/lib/data-sources/catalog";
import type { LinehaulTrip } from "@/lib/linehaul/model";
import { assertEtaSnapshot, LinehaulEtaError } from "@/lib/linehaul/traffic-eta";
import { getLinehaulEta } from "@/lib/linehaul/traffic-server";

export async function GET(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) return Response.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const { role, permissions, page_access } = context.profile;
  if (!canViewPage(role, page_access, "linehaul") || role !== "admin" && !permissions.manage_dashboard) return Response.json({ error: "Không có quyền xem LH" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("trip_id");
  if (!id || !/^[\w-]{1,100}$/.test(id)) return Response.json({ error: "Mã chuyến không hợp lệ" }, { status: 400 });
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const { data, error } = await createAdminClient().from("linehaul_snapshots").select("snapshot_at,trips").eq("station_id", "4232").eq("report_date", vietnamDay()).maybeSingle();
    if (error) throw new LinehaulEtaError("snapshot_unavailable", "Chưa đọc được dữ liệu chuyến LH.", 503);
    const trip = (data?.trips as LinehaulTrip[] | undefined)?.find(trip => trip.trip_id === id);
    if (!trip) return Response.json({ error: "Không tìm thấy chuyến trong dữ liệu hôm nay." }, { status: 404, headers });
    assertEtaSnapshot(data?.snapshot_at ?? null, Date.now());
    return Response.json({ ...await getLinehaulEta(trip), snapshotAt: data?.snapshot_at ?? null }, { headers });
  } catch (error) {
    if (error instanceof LinehaulEtaError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
    return Response.json({ error: "Chưa dự đoán được ETA. Vui lòng thử lại sau." }, { status: 503, headers });
  }
}
