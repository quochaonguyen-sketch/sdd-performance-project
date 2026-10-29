import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canAccessPickupManagement } from "@/lib/auth/permissions";
import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { readAllPages } from "@/lib/pickup/realtime";
import { summarizeLiveDelivery, summarizeDeliveryBacklog, type LiveDeliveryRow, type DeliveryBacklogRow } from "@/lib/dashboard/operations-overview";
import { TtlCache } from "@/lib/cache/ttl-cache";

type RiderProfile = { rider_code: string; kv: string | null; cot: string | null };
const profileCache = new TtlCache<RiderProfile[]>(300_000, 24);

export async function GET(request: Request) {
  const db = await createClient();
  const context = await getCurrentUserContext();
  if (!context) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const profileKey = JSON.stringify([context.user.id, context.profile]);
  if (request.headers.get("x-dashboard-refresh") === "1") profileCache.delete(profileKey);
  // Use the caller's session and existing RLS, as on the source pages.
  const [live, backlog] = await Promise.allSettled([
    (async () => {
      const [head, profiles] = await Promise.all([
        db.from("realtime_delivery_riders").select("snapshot_id,snapshot_at,work_date").order("snapshot_at", { ascending: false }).limit(1).maybeSingle(),
        profileCache.load(profileKey, () => readAllPages<RiderProfile>((from,to) => db.from("riders").select("rider_code,kv,cot").in("kv", OPERATING_AREAS).order("id").range(from,to))).then(result => result.value),
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
      const check = await db.from("lmhub_inventory_rows").select("snapshot_id").in("area", OPERATING_AREAS).order("snapshot_at", { ascending: false }).limit(1).maybeSingle();
      if (check.error || check.data?.snapshot_id !== snapshot.snapshot_id) throw new Error("Snapshot tồn delivery thay đổi khi tải; hãy thử lại.");
      return { data: summarizeDeliveryBacklog(rows, Date.now()), snapshotAt: head.data.snapshot_at, error: null };
    })(),
  ]);
  const message = (error: unknown) => error instanceof Error ? error.message : "Không tải được dữ liệu";
  return NextResponse.json({
    live: live.status === "fulfilled" ? live.value : { data: null, snapshotAt: null, workDate: null, error: message(live.reason) },
    backlog: backlog.status === "fulfilled" ? backlog.value : { data: null, snapshotAt: null, error: message(backlog.reason) },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
