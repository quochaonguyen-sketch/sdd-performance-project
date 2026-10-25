import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canAccessPickupManagement } from "@/lib/auth/permissions";
import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { readAllPages } from "@/lib/pickup/realtime";
import { summarizeLiveDelivery, summarizeDeliveryBacklog, type LiveDeliveryRow, type DeliveryBacklogRow } from "@/lib/dashboard/operations-overview";

export async function GET() {
  const db = await createClient();
  const context = await getCurrentUserContext();
  if (!context) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  // Use the caller's session and existing RLS, as on the source pages.
  const [live, backlog] = await Promise.allSettled([
    (async () => {
      const [head, profiles] = await Promise.all([
        db.from("realtime_delivery_riders").select("snapshot_id,snapshot_at,work_date").order("snapshot_at", { ascending: false }).limit(1).maybeSingle(),
        readAllPages<{ rider_code: string; kv: string | null }>((from,to) => db.from("riders").select("rider_code,kv").in("kv", OPERATING_AREAS).eq("status", "active").order("id").range(from,to)),
      ]);
      if (head.error) throw new Error(head.error.message);
      if (!head.data) return { data: null, snapshotAt: null, workDate: null, error: null };
      const snapshot = head.data;
      const rows = await readAllPages<LiveDeliveryRow>((from,to) => db.from("realtime_delivery_riders")
        .select("driver_id,total_assigned,delivered,delivering,failed,idle_delivery_seconds")
        .eq("snapshot_id", snapshot.snapshot_id).eq("work_date", snapshot.work_date).order("driver_id").range(from,to));
      return { data: summarizeLiveDelivery(rows, profiles), snapshotAt: head.data.snapshot_at, workDate: head.data.work_date, error: null };
    })(),
    (async () => {
      if (!canAccessPickupManagement(context.profile.role, context.profile.permissions)) throw new Error("Bạn không có quyền xem tồn delivery");
      const head = await db.from("lmhub_inventory_rows").select("snapshot_id,snapshot_at").in("area", OPERATING_AREAS).order("snapshot_at", { ascending: false }).limit(1).maybeSingle();
      if (head.error) throw new Error(head.error.message);
      if (!head.data) return { data: null, snapshotAt: null, error: null };
      const snapshot = head.data;
      const rows = await readAllPages<DeliveryBacklogRow>((from,to) => db.from("lmhub_inventory_rows")
        .select("shipment_id,area,district,ward,cot_group,received_time").in("area", OPERATING_AREAS)
        .eq("snapshot_id", snapshot.snapshot_id).order("shipment_id").range(from,to));
      return { data: summarizeDeliveryBacklog(rows, Date.now()), snapshotAt: head.data.snapshot_at, error: null };
    })(),
  ]);
  const message = (error: unknown) => error instanceof Error ? error.message : "Không tải được dữ liệu";
  return NextResponse.json({
    live: live.status === "fulfilled" ? live.value : { data: null, snapshotAt: null, workDate: null, error: message(live.reason) },
    backlog: backlog.status === "fulfilled" ? backlog.value : { data: null, snapshotAt: null, error: message(backlog.reason) },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
