import { OPERATING_AREAS, normalizeOperatingArea, type OperatingArea } from "../locations/operating-areas.ts";

export function normalizeRiderEditAreas(value: unknown): OperatingArea[] {
  if (!Array.isArray(value)) return [];
  const areas = new Set(value.map((item) => typeof item === "string" ? normalizeOperatingArea(item) : null));
  return OPERATING_AREAS.filter((area) => areas.has(area));
}

export function canEditRiderArea(role: string, permission: boolean, areas: readonly string[], area: unknown) {
  if (role === "admin") return true;
  const normalized = typeof area === "string" ? normalizeOperatingArea(area) : null;
  return permission && !!normalized && areas.includes(normalized);
}
