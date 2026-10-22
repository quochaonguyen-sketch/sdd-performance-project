/** Shared reporting and input scope. Historical rows outside this scope are retained. */
export const OPERATING_AREAS = ["KV1", "KV2", "KV3", "KV4", "KV5"] as const;
export type OperatingArea = (typeof OPERATING_AREAS)[number];
export const OPERATING_SCOPE_LABEL = "KV1–KV5";

export function normalizeOperatingArea(value: string | null | undefined): OperatingArea | null {
  const normalized = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
  const match = normalized.match(/^(?:(?:KV|KHU\s*VUC|KHU|AREA)\s*)?([1-5])$/);
  return match ? `KV${match[1]}` as OperatingArea : null;
}
export function isOperatingArea(value: string | null | undefined) {
  return normalizeOperatingArea(value) !== null;
}
