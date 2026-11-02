import { districtDefinitionFor, splitLocationParts, wardDefinitionFor } from "../../lib/locations/hcm.ts";
import { ZONE_KV_DISTRICTS } from "../../lib/locations/zone-plan.ts";
import { OPERATING_AREAS, normalizeOperatingArea } from "../../lib/locations/operating-areas.ts";
import { AREA_COLORS, MAP_DISTRICTS, ZONE_COLORS, compactZoneName, wardLabel, zoneId, type LocationMode, type ZoneFilters, type ZoneRider, type OperationalZone, type ZoneMapLevel } from "./zone-map-types.ts";

export const INITIAL_ZONE_FILTERS: ZoneFilters = { query: "", area: "all", districtId: "all", wardId: "all", status: "all" };
export type BinhChanhPlan = Record<string, "KV1" | "KV3">;

export function zoneWardParts(district: string | null, value: string | null) {
  return splitLocationParts(value?.replace(/\s+-\s+(?=(?:xã|phường|ward|p\.)\s*)/gi, ",")).map((part) => wardDefinitionFor(district, part)?.name ?? part)
    .filter((part) => !["bk", "backup", "duphong"].includes(compactZoneName(part)));
}

export function buildBinhChanhPlan(rows: Array<Pick<ZoneRider, "kv" | "delivery_district" | "delivery_ward">>): BinhChanhPlan {
  const result: BinhChanhPlan = {};
  const district = MAP_DISTRICTS.find((candidate) => candidate.id === "binh-chanh")!;
  for (const row of rows) {
    const area = normalizeOperatingArea(row.kv);
    if ((area !== "KV1" && area !== "KV3") || districtDefinitionFor(row.delivery_district)?.id !== district.id) continue;
    for (const part of zoneWardParts(row.delivery_district, row.delivery_ward)) {
      const key = compactZoneName(part);
      if (!district.wards.some((ward) => compactZoneName(ward) === key)) continue;
      if (result[key] && result[key] !== area) throw new Error(`Plan gán phường ${part} của Bình Chánh cho cả KV1 và KV3; cần sửa nguồn trước khi cập nhật bản đồ.`);
      result[key] = area;
    }
  }
  return result;
}

export function zoneMapLevel(filters: ZoneFilters, hasSelection = false): ZoneMapLevel {
  if (hasSelection || filters.query.trim() || filters.wardId !== "all") return "ward";
  return filters.area === "all" ? "area" : filters.districtId === "all" ? "district" : "ward";
}

export function zoneDistrictsForArea(area: ZoneFilters["area"]) {
  const names = new Set((area === "all" ? OPERATING_AREAS : [area]).flatMap((kv) => ZONE_KV_DISTRICTS[kv]));
  return MAP_DISTRICTS.filter((district) => names.has(district.name));
}

export function zoneDistrictForLocation(rawDistrict: string | null, ward: string | null) {
  const district = districtDefinitionFor(rawDistrict);
  if (district?.id !== "thu-duc") return MAP_DISTRICTS.find((candidate) => candidate.id === district?.id);
  if (ward) {
    const key = compactZoneName(ward);
    const former = MAP_DISTRICTS.find((candidate) => ["quan-2", "quan-9", "thu-duc"].includes(candidate.id) && candidate.wards.some((name) => compactZoneName(name) === key));
    if (former) return former;
  }
  return MAP_DISTRICTS.find((candidate) => candidate.id === "thu-duc");
}

export function buildZoneModel(riders: ZoneRider[], mode: LocationMode, area: ZoneFilters["area"], binhChanhPlan?: BinhChanhPlan) {
  const scopedRiders = riders.filter((rider) => {
    const kv = normalizeOperatingArea(rider.kv);
    return kv && (area === "all" || kv === area);
  });
  const ridersByZone = new Map<string, ZoneRider[]>();
  const districts = zoneDistrictsForArea(area);
  const wardsByDistrict = new Map(districts.map((district) => [district.id, new Map(district.wards.map((ward) => [zoneId(district.id, ward), ward]))]));
  const locatedRiders = new Set<string>();
  const districtRiders = new Map<string, Set<string>>();
  for (const rider of scopedRiders) {
    const rawDistrict = mode === "pickup" ? rider.pickup_district : mode === "delivery" ? rider.delivery_district : rider.home_district;
    const rawWard = mode === "pickup" ? rider.pickup_ward : rider.delivery_ward;
    const parts = mode === "home" ? ["Theo quận / huyện"] : zoneWardParts(rawDistrict, rawWard);
    // Resolve each part separately so one known ward cannot hide another source ward.
    const canonical = parts.map((part) => wardDefinitionFor(rawDistrict, part)?.name ?? part);
    const districtGroups = canonical.length ? canonical : [null];
    for (const sourceWard of new Set(districtGroups)) {
      const district = zoneDistrictForLocation(rawDistrict, sourceWard);
      const wards = district && wardsByDistrict.get(district.id);
      if (!district || !wards) continue;
      const districtIds = districtRiders.get(district.id) ?? new Set<string>();
      districtIds.add(rider.id);
      districtRiders.set(district.id, districtIds);
      if (!sourceWard) continue;
      const ward = wardDefinitionFor(district.name, sourceWard)?.name ?? district.wards.find((name) => compactZoneName(name) === compactZoneName(sourceWard)) ?? sourceWard;
      if (district.id === "binh-chanh" && mode !== "home" && binhChanhPlan) {
        const owner = binhChanhPlan[compactZoneName(ward)];
        if (!owner || normalizeOperatingArea(rider.kv) !== owner) continue;
      }
      const id = zoneId(district.id, ward);
      wards.set(id, ward);
      const assigned = ridersByZone.get(id) ?? [];
      if (!assigned.some((existing) => existing.id === rider.id)) assigned.push(rider);
      ridersByZone.set(id, assigned);
      locatedRiders.add(rider.id);
    }
  }
  const zones: OperationalZone[] = districts.flatMap((district) => {
    const wards = wardsByDistrict.get(district.id)!;
    return [...wards.entries()].filter(([, ward]) => mode !== "home" || ward === "Theo quận / huyện").map(([id, ward]) => {
      const assigned = ridersByZone.get(id) ?? [];
      const activeRiderCount = assigned.filter((rider) => rider.status !== "inactive").length;
      const coverage = [...new Set(assigned.filter((rider) => rider.status !== "inactive").map((rider) => normalizeOperatingArea(rider.kv)).filter((kv): kv is NonNullable<typeof kv> => !!kv))];
      return {
        id, ward, districtId: district.id, districtName: district.name,
        name: `${wardLabel(ward)} · ${district.shortName}`,
        code: `${district.code}-${compactZoneName(ward).toUpperCase()}`,
        area: coverage.join(" / "), areas: coverage,
        color: district.id === "binh-chanh" && coverage.length === 1 ? AREA_COLORS[coverage[0]] : ZONE_COLORS[MAP_DISTRICTS.findIndex((item) => item.id === district.id) % ZONE_COLORS.length],
        status: activeRiderCount > 0 ? "active" : "inactive",
        riderCount: assigned.length, activeRiderCount, capacity: null,
      } satisfies OperationalZone;
    });
  }).filter((zone) => zone.activeRiderCount > 0);
  return { zones, ridersByZone, scopedRiders, districtRiderCounts: new Map([...districtRiders].map(([id, ids]) => [id, ids.size])), unlocatedCount: scopedRiders.filter((rider) => !locatedRiders.has(rider.id)).length };
}

export function matchesZoneFilters(zone: OperationalZone, filters: ZoneFilters) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[.,/_-]+/g, " ").replace(/\s+/g, " ").trim();
  const query = normalize(filters.query);
  return (!query || normalize(`${zone.name} ${zone.code} ${zone.area}`).includes(query)) &&
    (filters.area === "all" || zone.areas.includes(filters.area)) &&
    (filters.districtId === "all" || zone.districtId === filters.districtId) &&
    (filters.wardId === "all" || zone.id === filters.wardId) &&
    (filters.status === "all" || zone.status === filters.status);
}
