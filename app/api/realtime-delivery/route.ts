import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveVolumeMaskMap, maskDeliveryRow } from "@/lib/rider-volume-mask/service";
import { readAllPages } from "@/lib/pickup/realtime";
import type { RealtimeRider } from "@/lib/dashboard/live-delivery-riders";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getCurrentUserContext().catch(() => null);
  if (!session) {
    return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const latest = await admin
      .from("realtime_delivery_riders")
      .select("work_date, snapshot_id, snapshot_at")
      .order("snapshot_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest.error) throw latest.error;
    if (!latest.data) {
      return NextResponse.json({
        success: true,
        workDate: null,
        snapshotId: null,
        snapshotAt: null,
        rows: [],
      });
    }

    const head = latest.data;
    const rawRows = await readAllPages<RealtimeRider>((from, to) =>
      admin
        .from("realtime_delivery_riders")
        .select("id,driver_id,driver_name,total_assigned,delivered,delivering,failed,zone_id,first_delivery_at,idle_delivery_seconds,snapshot_id,snapshot_at")
        .eq("work_date", head.work_date)
        .eq("snapshot_id", head.snapshot_id)
        .order("driver_id")
        .range(from, to)
    );

    const isSuperAdmin = session.profile.is_super_admin === true;
    const previewAsUser = request ? new URL(request.url).searchParams.get("preview_as_user") === "1" : false;
    const shouldMask = !isSuperAdmin || previewAsUser;

    // If Super Admin not previewing as user, return genuine raw 100% data
    if (!shouldMask) {
      return NextResponse.json({
        success: true,
        workDate: head.work_date,
        snapshotId: head.snapshot_id,
        snapshotAt: head.snapshot_at,
        rows: rawRows,
        isSuperAdmin: true,
        previewingAsUser: false,
      });
    }

    // For all other users (Admin, Leader, Viewer), or Super Admin in preview mode, apply volume mask
    const masks = await getActiveVolumeMaskMap();
    if (masks.size === 0) {
      return NextResponse.json({
        success: true,
        workDate: head.work_date,
        snapshotId: head.snapshot_id,
        snapshotAt: head.snapshot_at,
        rows: rawRows,
        isSuperAdmin,
        previewingAsUser: previewAsUser,
      });
    }

    const maskedRows = rawRows.map((r) => maskDeliveryRow(r, masks));

    return NextResponse.json({
      success: true,
      workDate: head.work_date,
      snapshotId: head.snapshot_id,
      snapshotAt: head.snapshot_at,
      rows: maskedRows,
      isSuperAdmin,
      previewingAsUser: previewAsUser,
    });
  } catch (err) {
    console.error("[RealtimeDelivery API Error]:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Lỗi tải delivery realtime" },
      { status: 500 }
    );
  }
}
