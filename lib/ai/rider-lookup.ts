import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { getActiveVolumeMaskMap } from "@/lib/rider-volume-mask/service";

export type RiderDetailResult = {
  profile: {
    rider_code: string;
    full_name: string;
    kv: string;
    cot: string | null;
    status: string;
    delivery_district: string | null;
    delivery_ward: string | null;
    pickup_district: string | null;
    pickup_ward: string | null;
  };
  attendance: string;
  delivery: {
    snapshot_at: string | null;
    total_assigned: number;
    delivered: number;
    delivering: number;
    failed: number;
    idle_minutes: number;
    rate_percent: number;
  } | null;
  pickup: {
    snapshot_at: string | null;
    assigned: number;
    picked: number;
    pending: number;
    onhold: number;
    rate_percent: number;
    zones: string | null;
  } | null;
  wh_orders: Array<{
    shipment_id: string;
    raw_status: string;
    attempt: number | null;
    onhold_reason: string;
    created_at: string | null;
  }>;
};

// In-memory cache for the ~1,186 rider roster to avoid repeated DB scans
let cachedRosters: Array<{
  rider_code: string;
  full_name: string;
  kv: string;
  cot: string | null;
  status: string;
  delivery_district: string | null;
  delivery_ward: string | null;
  pickup_district: string | null;
  pickup_ward: string | null;
}> | null = null;
let cachedRosterTime = 0;
const ROSTER_TTL = 300_000; // 5 minutes

import { fold, findMatchingRiders } from "./rider-matcher";
export { fold, findMatchingRiders };

export async function lookupRidersContext(
  admin: SupabaseClient,
  question: string,
  day: string,
  isSuperAdmin: boolean = false
): Promise<RiderDetailResult[] | null> {
  const now = Date.now();
  if (!cachedRosters || now - cachedRosterTime > ROSTER_TTL) {
    const { data: rosterData } = await admin
      .from("riders")
      .select("rider_code, full_name, kv, cot, status, delivery_district, delivery_ward, pickup_district, pickup_ward")
      .in("kv", OPERATING_AREAS)
      .range(0, 2500);
    if (rosterData) {
      cachedRosters = rosterData;
      cachedRosterTime = now;
    }
  }

  const matches = findMatchingRiders(question, cachedRosters || []);
  if (!matches.length) return null;

  const codes = matches.map((m) => m.rider_code);

  const [delHeadRes, pickupCurrentRes, whSnapshotRes, attRes] = await Promise.all([
    admin
      .from("realtime_delivery_riders")
      .select("snapshot_id, snapshot_at")
      .eq("work_date", day)
      .order("snapshot_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("pickup_realtime_current")
      .select("snapshot_at, riders")
      .eq("id", 1)
      .maybeSingle(),
    admin
      .from("wh_tracking_snapshots")
      .select("orders")
      .eq("station_id", "4232")
      .eq("report_date", day)
      .maybeSingle(),
    admin
      .from("attendance_logs")
      .select("rider_code, status, work_date")
      .in("rider_code", codes)
      .eq("work_date", day),
  ]);

  const deliveryRows = delHeadRes.data
    ? (
        await admin
          .from("realtime_delivery_riders")
          .select("driver_id, total_assigned, delivered, delivering, failed, idle_delivery_seconds")
          .eq("work_date", day)
          .eq("snapshot_id", delHeadRes.data.snapshot_id)
          .in("driver_id", codes)
      ).data || []
    : [];

  const delMap = new Map(deliveryRows.map((r) => [r.driver_id, r]));
  const attMap = new Map((attRes.data || []).map((r) => [r.rider_code, r.status]));
  const pickupRiders =
    (pickupCurrentRes.data?.riders as Array<{
      driver_id: string;
      assigned_orders?: number;
      total_pickup_quantity?: number;
      onhold_orders?: number;
      zones?: string;
    }>) || [];
  const pickupMap = new Map(
    pickupRiders.filter((r) => codes.includes(r.driver_id)).map((r) => [r.driver_id, r])
  );
  const whOrders =
    (whSnapshotRes.data?.orders as Array<{
      driver_id: string;
      driver_name?: string;
      shipment_id: string;
      raw_status: string;
      attempt: number | null;
      onhold_reason: string;
      created_at: string | null;
    }>) || [];

  const masks = !isSuperAdmin ? await getActiveVolumeMaskMap().catch(() => new Map()) : new Map();

  return matches.map((profile) => {
    const d = delMap.get(profile.rider_code);
    const p = pickupMap.get(profile.rider_code);
    const myWh = whOrders.filter(
      (o) =>
        o.driver_id === profile.rider_code ||
        (o.driver_name && fold(o.driver_name).includes(fold(profile.full_name)))
    );

    let delivery = null;
    if (d) {
      delivery = {
        snapshot_at: delHeadRes.data?.snapshot_at ?? null,
        total_assigned: d.total_assigned,
        delivered: d.delivered,
        delivering: d.delivering,
        failed: d.failed,
        idle_minutes: Math.round(d.idle_delivery_seconds / 60),
        rate_percent:
          d.total_assigned > 0 ? Math.round((d.delivered / d.total_assigned) * 1000) / 10 : 0,
      };
      const mask = masks.get(profile.rider_code.toLowerCase());
      if (mask && (mask.scope === "all" || mask.scope === "delivery")) {
        delivery.delivered = Math.round(delivery.delivered * mask.factor);
        delivery.delivering = Math.round(delivery.delivering * mask.factor);
        delivery.failed = Math.round(delivery.failed * mask.factor);
        delivery.total_assigned = Math.max(
          delivery.delivered + delivery.delivering + delivery.failed,
          Math.round(delivery.total_assigned * mask.factor)
        );
        delivery.rate_percent =
          delivery.total_assigned > 0
            ? Math.round((delivery.delivered / delivery.total_assigned) * 1000) / 10
            : 0;
      }
    }

    let pickup = null;
    if (p) {
      const assigned = Number(p.assigned_orders || 0);
      const picked = Number(p.total_pickup_quantity || 0);
      const onhold = Number(p.onhold_orders || 0);
      pickup = {
        snapshot_at: pickupCurrentRes.data?.snapshot_at ?? null,
        assigned,
        picked,
        onhold,
        pending: Math.max(0, assigned - picked - onhold),
        rate_percent: assigned > 0 ? Math.round((picked / assigned) * 1000) / 10 : 0,
        zones: p.zones ?? null,
      };
      const mask = masks.get(profile.rider_code.toLowerCase());
      if (mask && (mask.scope === "all" || mask.scope === "pickup")) {
        pickup.assigned = Math.round(pickup.assigned * mask.factor);
        pickup.picked = Math.round(pickup.picked * mask.factor);
        pickup.onhold = Math.round(pickup.onhold * mask.factor);
        pickup.pending = Math.max(0, pickup.assigned - pickup.picked - pickup.onhold);
        pickup.rate_percent =
          pickup.assigned > 0 ? Math.round((pickup.picked / pickup.assigned) * 1000) / 10 : 0;
      }
    }

    return {
      profile,
      attendance: attMap.get(profile.rider_code) || "Đi làm bình thường",
      delivery,
      pickup,
      wh_orders: myWh.map((o) => ({
        shipment_id: o.shipment_id,
        raw_status: o.raw_status,
        attempt: o.attempt,
        onhold_reason: o.onhold_reason,
        created_at: o.created_at,
      })),
    };
  });
}
