import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OPERATING_AREAS } from "@/lib/locations/operating-areas";

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

export function fold(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim();
}

export function findMatchingRiders<T extends { rider_code: string; full_name: string }>(
  question: string,
  riders: T[]
): T[] {
  const qFolded = fold(question);
  const qClean = ` ${qFolded} `;

  // 1. Check for numeric codes in question (e.g. 132420)
  const codeMatches = question.match(/\b\d{5,7}\b/g) || [];
  const codeSet = new Set(codeMatches);

  const matched: Array<{ rider: T; score: number }> = [];

  for (const r of riders) {
    if (codeSet.has(r.rider_code)) {
      matched.push({ rider: r, score: 100 });
      continue;
    }
    const nameFolded = fold(r.full_name);
    if (!nameFolded) continue;

    // Full name match
    if (qFolded.includes(nameFolded)) {
      matched.push({ rider: r, score: 90 });
      continue;
    }

    // Last 2 words (e.g. "hai tram", "thanh son", "tuan kiet")
    const words = nameFolded.split(/\s+/);
    if (words.length >= 2) {
      const last2 = `${words[words.length - 2]} ${words[words.length - 1]}`;
      if (last2.length >= 4 && qClean.includes(` ${last2} `)) {
        matched.push({ rider: r, score: 80 });
        continue;
      }
    }

    // Last 3 words if available
    if (words.length >= 3) {
      const last3 = `${words[words.length - 3]} ${words[words.length - 2]} ${words[words.length - 1]}`;
      if (qClean.includes(` ${last3} `)) {
        matched.push({ rider: r, score: 85 });
        continue;
      }
    }
  }

  return matched
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((m) => m.rider);
}

export async function lookupRidersContext(
  admin: SupabaseClient,
  question: string,
  day: string
): Promise<RiderDetailResult[] | null> {
  const now = Date.now();
  if (!cachedRosters || now - cachedRosterTime > ROSTER_TTL) {
    const { data: rosterData } = await admin
      .from("riders")
      .select("rider_code, full_name, kv, cot, status, delivery_district, delivery_ward, pickup_district, pickup_ward")
      .in("kv", OPERATING_AREAS);
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
