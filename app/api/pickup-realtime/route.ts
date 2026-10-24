import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canAccessPickupManagement } from "@/lib/auth/permissions";
import { buildPickupRealtime, readAllPages, type SourceRow } from "@/lib/pickup/realtime";

export async function GET() {
  const context = await getCurrentUserContext().catch(() => null);
  if (!context) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  if (!canAccessPickupManagement(context.profile.role, context.profile.permissions)) return NextResponse.json({ success: false, error: "Bạn không có quyền xem pickup" }, { status: 403 });
  try {
    const db = createAdminClient();
    async function latest(table: string) {
      const { data, error } = await db.from(table).select("snapshot_id,snapshot_at").order("snapshot_at", { ascending: false, nullsFirst: false }).order("snapshot_id", { ascending: false }).limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    }
    const [summaryHead, riderHead, groupHead, fullFleet] = await Promise.all([
      latest("pickup_48h_summary_groups"), latest("pickup_48h_realtime_riders"), latest("pickup_48h_rider_groups"),
      db.from("pickup_realtime_current").select("snapshot_id,snapshot_at,source_date,inventory_snapshot_at,task_count,riders,groups").eq("id", 1).maybeSingle(),
    ]);
    if (fullFleet.error) throw fullFleet.error;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
    // Preserve full-fleet coverage if a later refresh fails or crosses midnight.
    const current = fullFleet.data;
    const riderStale = !!current && (current.source_date !== today || Date.now() - Date.parse(current.snapshot_at) > 20 * 60_000);
    async function snapshot(table: string, columns: string, id: string | undefined, order: string[]) {
      if (!id) return [];
      return readAllPages<SourceRow>((from, to) => {
        let query = db.from(table).select(columns).eq("snapshot_id", id);
        for (const column of order) query = query.order(column, { ascending: true });
        return query.range(from, to).returns<SourceRow[]>();
      });
    }
    const [profiles, realtime, summary, groups, assigned, onhold] = await Promise.all([
      readAllPages<SourceRow>((from, to) => db.from("riders").select("rider_code,full_name,name,kv,cot,status").order("id").range(from, to)),
      current ? Promise.resolve(current.riders as SourceRow[]) : snapshot("pickup_48h_realtime_riders", "driver_id,driver_name,area,zones,assigned_orders,total_pickup_quantity,onhold_orders", riderHead?.snapshot_id, ["driver_id"]),
      snapshot("pickup_48h_summary_groups", "khu_vuc,ward,area,route_area,assign_orders,picked_orders,onhold_orders", summaryHead?.snapshot_id, ["khu_vuc", "quan", "phuong", "cot"]),
      current ? Promise.resolve(current.groups as SourceRow[]) : snapshot("pickup_48h_rider_groups", "driver_id,khu_vuc,ward,ward_area,assigned_orders,picked_orders,onhold_orders", groupHead?.snapshot_id === riderHead?.snapshot_id ? groupHead?.snapshot_id : undefined, ["driver_id", "khu_vuc", "quan", "phuong"]),
      db.rpc("pickup_inventory_riders", { p_status: "Assigned" }),
      db.rpc("pickup_inventory_riders", { p_status: "Pickup Onhold" }),
    ]);
    if (assigned.error || onhold.error) throw assigned.error ?? onhold.error;
    const inventory = [...(assigned.data?.rows ?? []), ...(onhold.data?.rows ?? [])] as SourceRow[];
    const routeSnapshotAt = [assigned.data?.snapshotAt, onhold.data?.snapshotAt].filter(Boolean).sort().at(-1) ?? null;
    return NextResponse.json({ success: true, ...buildPickupRealtime(profiles, realtime, groups, summary, inventory),
      snapshotAt: summaryHead?.snapshot_at ?? null, riderSnapshotAt: current?.snapshot_at ?? riderHead?.snapshot_at ?? null,
      riderSource: current ? "sdd-web-data" : "legacy", taskCount: current?.task_count ?? null,
      riderStale,
      inventorySnapshotAt: current?.inventory_snapshot_at ?? null,
      routeSnapshotAt,
      snapshotsAligned: current ? !!summaryHead?.snapshot_at && Math.abs(Date.parse(summaryHead.snapshot_at) - Date.parse(current.snapshot_at)) <= 15 * 60_000
        : !!summaryHead && summaryHead.snapshot_id === riderHead?.snapshot_id && riderHead?.snapshot_id === groupHead?.snapshot_id,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Không tải được pickup realtime" }, { status: 500 });
  }
}
