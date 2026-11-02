import { OPERATING_AREAS, type OperatingArea } from "../locations/operating-areas.ts";

export function assistantHref(path: string, area: OperatingArea, date?: string) {
  const query = new URLSearchParams({ ai_area: area });
  if (date) query.set("ai_day", date);
  return `${path}?${query}`;
}

export function assistantScope(params: { get(key: string): string | null }) {
  const rawArea = params.get("ai_area"), rawDate = params.get("ai_day");
  const area = OPERATING_AREAS.includes(rawArea as OperatingArea) ? rawArea as OperatingArea : null;
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && Number.isFinite(Date.parse(rawDate)) && new Date(rawDate).toISOString().slice(0, 10) === rawDate ? rawDate : null;
  return { area, date };
}
