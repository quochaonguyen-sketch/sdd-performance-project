import type { SupabaseClient } from "@supabase/supabase-js";
import { MAP_DISTRICTS, compactZoneName } from "../../components/zones/zone-map-types.ts";
import { normalizeLocation } from "../locations/hcm.ts";
import { resolveWorkDateScope } from "./work-date.ts";
import { OPERATING_AREAS } from "../locations/operating-areas.ts";

export type WardDailyVolume = {
  date: string;
  delivery: number;
  pickup: number;
  delivery_cots?: Record<string, number>;
  pickup_cots?: Record<string, number>;
};

export type WardVolumeContext = {
  is_target_ward: boolean;
  district?: string;
  ward?: string;
  date_range: { start: string; end: string; label: string };
  totals: {
    delivery: number;
    pickup: number;
  };
  daily_breakdown?: WardDailyVolume[];
  top_delivery_wards?: Array<{ district: string; ward: string; total_orders: number }>;
  top_pickup_wards?: Array<{ district: string; ward: string; total_orders: number }>;
  by_district?: Array<{ district: string; delivery_orders: number; pickup_orders: number }>;
  note?: string;
};

export function isVolumeQuery(question: string): boolean {
  if (!question) return false;
  return /(?:volume|sản\s*lượng|san\s*luong|đơn\s*giao|don\s*giao|đơn\s*pick|don\s*pick|lượng\s*giao|luong\s*giao|lượng\s*lấy|luong\s*lay|giao.*phường|pick.*phường|phường.*giao|phường.*pick|phường.*lấy|lấy.*phường|phường|phuong|quận.*giao|quận.*pick)/i.test(
    question
  );
}

export function extractDistrictAndWard(text: string): { district: string; districtId: string; ward: string | null } | null {
  const norm = normalizeLocation(text);
  for (const district of MAP_DISTRICTS) {
    const dMatches = [district.name, district.shortName, ...(district.aliases || [])].some((alias) => {
      const aNorm = normalizeLocation(alias);
      return aNorm.length >= 2 && norm.includes(aNorm);
    });
    if (dMatches) {
      for (const ward of district.wards) {
        const cw = compactZoneName(ward);
        const nw = normalizeLocation(ward);
        if (cw && (norm.includes(nw) || new RegExp(`(?:phuong|xa|p|ward)\\s*${cw}(?:\\b|$)`, "i").test(norm))) {
          return { district: district.name, districtId: district.id, ward };
        }
      }
      return { district: district.name, districtId: district.id, ward: null };
    }
  }

  // Also check if question mentions "phuong X" without district
  for (const district of MAP_DISTRICTS) {
    for (const ward of district.wards) {
      const cw = compactZoneName(ward);
      const nw = normalizeLocation(ward);
      if (cw && cw.length >= 4 && (norm.includes(nw) || new RegExp(`(?:phuong|xa|p|ward)\\s*${cw}(?:\\b|$)`, "i").test(norm))) {
        return { district: district.name, districtId: district.id, ward };
      }
    }
  }

  return null;
}

export async function lookupWardVolumeContext(
  admin: SupabaseClient,
  question: string,
  today: string
): Promise<WardVolumeContext | null> {
  if (!isVolumeQuery(question)) return null;

  const loc = extractDistrictAndWard(question);
  const scope = resolveWorkDateScope(question);

  // If question is looking for a specific ward
  if (loc && loc.ward) {
    const endDate = scope.end <= today ? scope.end : today;
    const startDate = scope.start !== scope.end
      ? scope.start
      : new Date(new Date(endDate).getTime() - 7 * 86400000).toISOString().slice(0, 10);

    const [dRes, pRes] = await Promise.all([
      admin
        .from("delivery_order")
        .select("report_date,district,old_ward,area,cot,total_orders")
        .ilike("district", `%${loc.district.replace(/^Quận |^Huyện |^Thành phố /, "")}%`)
        .gte("report_date", startDate)
        .lte("report_date", endDate)
        .order("report_date", { ascending: false })
        .limit(2000),
      admin
        .from("pickup_volume")
        .select("report_date,district,new_ward,area,cot,total_orders")
        .ilike("district", `%${loc.district.replace(/^Quận |^Huyện |^Thành phố /, "")}%`)
        .gte("report_date", startDate)
        .lte("report_date", endDate)
        .order("report_date", { ascending: false })
        .limit(2000),
    ]);

    const targetCompact = compactZoneName(loc.ward);
    const deliveryRows = (dRes.data ?? []).filter((r) => compactZoneName(r.old_ward) === targetCompact);
    const pickupRows = (pRes.data ?? []).filter((r) => compactZoneName(r.new_ward) === targetCompact);

    const byDate = new Map<string, WardDailyVolume>();

    let totalDelivery = 0;
    for (const row of deliveryRows) {
      const orders = Number(row.total_orders ?? 0);
      totalDelivery += orders;
      const date = String(row.report_date);
      let entry = byDate.get(date);
      if (!entry) {
        entry = { date, delivery: 0, pickup: 0, delivery_cots: {}, pickup_cots: {} };
        byDate.set(date, entry);
      }
      entry.delivery += orders;
      if (row.cot) {
        const cotKey = String(row.cot);
        const cots: Record<string, number> = entry.delivery_cots || (entry.delivery_cots = {});
        cots[cotKey] = (cots[cotKey] ?? 0) + orders;
      }
    }

    let totalPickup = 0;
    for (const row of pickupRows) {
      const orders = Number(row.total_orders ?? 0);
      totalPickup += orders;
      const date = String(row.report_date);
      let entry = byDate.get(date);
      if (!entry) {
        entry = { date, delivery: 0, pickup: 0, delivery_cots: {}, pickup_cots: {} };
        byDate.set(date, entry);
      }
      entry.pickup += orders;
      if (row.cot) {
        const cotKey = String(row.cot);
        const cots: Record<string, number> = entry.pickup_cots || (entry.pickup_cots = {});
        cots[cotKey] = (cots[cotKey] ?? 0) + orders;
      }
    }

    const dailyBreakdown = Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));

    return {
      is_target_ward: true,
      district: loc.district,
      ward: loc.ward,
      date_range: { start: startDate, end: endDate, label: `${startDate}..${endDate}` },
      totals: {
        delivery: totalDelivery,
        pickup: totalPickup,
      },
      daily_breakdown: dailyBreakdown,
      note: `Số liệu thực tế từ database delivery_order và pickup_volume cho ${loc.ward}, ${loc.district} từ ${startDate} đến ${endDate}.`,
    };
  }

  // If question is looking for a whole district (no specific ward)
  if (loc && !loc.ward) {
    const endDate = scope.end <= today ? scope.end : today;
    const startDate = scope.start !== scope.end
      ? scope.start
      : new Date(new Date(endDate).getTime() - 7 * 86400000).toISOString().slice(0, 10);

    const [dRes, pRes] = await Promise.all([
      admin
        .from("delivery_order")
        .select("report_date,district,old_ward,area,total_orders")
        .ilike("district", `%${loc.district.replace(/^Quận |^Huyện |^Thành phố /, "")}%`)
        .gte("report_date", startDate)
        .lte("report_date", endDate)
        .limit(3000),
      admin
        .from("pickup_volume")
        .select("report_date,district,new_ward,area,total_orders")
        .ilike("district", `%${loc.district.replace(/^Quận |^Huyện |^Thành phố /, "")}%`)
        .gte("report_date", startDate)
        .lte("report_date", endDate)
        .limit(3000),
    ]);

    const wardDeliveryMap = new Map<string, number>();
    const wardPickupMap = new Map<string, number>();
    let totalDelivery = 0;
    let totalPickup = 0;

    for (const row of dRes.data ?? []) {
      const orders = Number(row.total_orders ?? 0);
      totalDelivery += orders;
      const ward = row.old_ward?.trim() || "Chưa xác định";
      wardDeliveryMap.set(ward, (wardDeliveryMap.get(ward) ?? 0) + orders);
    }

    for (const row of pRes.data ?? []) {
      const orders = Number(row.total_orders ?? 0);
      totalPickup += orders;
      const ward = row.new_ward?.trim() || "Chưa xác định";
      wardPickupMap.set(ward, (wardPickupMap.get(ward) ?? 0) + orders);
    }

    const topDelivery = Array.from(wardDeliveryMap, ([ward, total_orders]) => ({ district: loc.district, ward, total_orders }))
      .sort((a, b) => b.total_orders - a.total_orders);

    const topPickup = Array.from(wardPickupMap, ([ward, total_orders]) => ({ district: loc.district, ward, total_orders }))
      .sort((a, b) => b.total_orders - a.total_orders);

    return {
      is_target_ward: false,
      district: loc.district,
      date_range: { start: startDate, end: endDate, label: `${startDate}..${endDate}` },
      totals: {
        delivery: totalDelivery,
        pickup: totalPickup,
      },
      top_delivery_wards: topDelivery,
      top_pickup_wards: topPickup,
      note: `Tổng sản lượng toàn ${loc.district} từ ${startDate} đến ${endDate}.`,
    };
  }

  // General volume question
  const endDate = scope.end <= today ? scope.end : today;
  const [dRes, pRes] = await Promise.all([
    admin
      .from("delivery_order")
      .select("report_date,district,old_ward,area,total_orders")
      .in("area", OPERATING_AREAS)
      .eq("report_date", endDate)
      .limit(3000),
    admin
      .from("pickup_volume")
      .select("report_date,district,new_ward,area,total_orders")
      .in("area", [...OPERATING_AREAS, "UNRESOLVED"])
      .eq("report_date", endDate)
      .limit(3000),
  ]);

  const wardDeliveryMap = new Map<string, { district: string; ward: string; total_orders: number }>();
  const wardPickupMap = new Map<string, { district: string; ward: string; total_orders: number }>();
  let totalDelivery = 0;
  let totalPickup = 0;

  for (const row of dRes.data ?? []) {
    const orders = Number(row.total_orders ?? 0);
    totalDelivery += orders;
    const district = row.district?.trim() || "Chưa xác định";
    const ward = row.old_ward?.trim() || "Chưa xác định";
    const key = `${district}::${ward}`;
    const curr = wardDeliveryMap.get(key) ?? { district, ward, total_orders: 0 };
    curr.total_orders += orders;
    wardDeliveryMap.set(key, curr);
  }

  for (const row of pRes.data ?? []) {
    const orders = Number(row.total_orders ?? 0);
    totalPickup += orders;
    const district = row.district?.trim() || "Chưa xác định";
    const ward = row.new_ward?.trim() || "Chưa xác định";
    const key = `${district}::${ward}`;
    const curr = wardPickupMap.get(key) ?? { district, ward, total_orders: 0 };
    curr.total_orders += orders;
    wardPickupMap.set(key, curr);
  }

  return {
    is_target_ward: false,
    date_range: { start: endDate, end: endDate, label: endDate },
    totals: { delivery: totalDelivery, pickup: totalPickup },
    top_delivery_wards: Array.from(wardDeliveryMap.values()).sort((a, b) => b.total_orders - a.total_orders).slice(0, 15),
    top_pickup_wards: Array.from(wardPickupMap.values()).sort((a, b) => b.total_orders - a.total_orders).slice(0, 15),
  };
}
