import { OPERATING_AREAS, normalizeOperatingArea } from "../locations/operating-areas.ts";
import type { Rider } from "../../types.ts";

export function buildDirectoryAnalysis(riders: Pick<Rider, "kv" | "status" | "cot" | "zone_id" | "delivery_district" | "current_shift">[]) {
  return OPERATING_AREAS.map(area => {
    const rows = riders.filter(rider => normalizeOperatingArea(rider.kv) === area);
    const districts = new Map<string, { name: string; total: number; active: number }>();
    const cots = { cot1: 0, cot2: 0, other: 0 };
    let active = 0, onShift = 0, unassigned = 0;
    for (const rider of rows) {
      const isActive = rider.status !== "inactive";
      if (isActive) active++;
      if (rider.current_shift) onShift++;
      if (!rider.zone_id && !rider.delivery_district?.trim()) unassigned++;
      const cot = rider.cot?.trim().toUpperCase().replace(/\s+/g, "") ?? "";
      if (/^COT1(?:\.[12])?$/.test(cot)) cots.cot1++;
      else if (cot === "COT2") cots.cot2++;
      else cots.other++;
      const name = rider.delivery_district?.trim() || "Chưa có quận giao";
      const district = districts.get(name) ?? { name, total: 0, active: 0 };
      district.total++;
      if (isActive) district.active++;
      districts.set(name, district);
    }
    return { area, total: rows.length, active, inactive: rows.length - active, onShift, unassigned, cots,
      districts: [...districts.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "vi")) };
  });
}

export type DirectoryAnalysis = ReturnType<typeof buildDirectoryAnalysis>;
