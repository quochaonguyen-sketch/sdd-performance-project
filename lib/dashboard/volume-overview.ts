import { OPERATING_AREAS, normalizeOperatingArea } from "../locations/operating-areas.ts";

export type DashboardVolumeRow = { report_date: string | null; area: string | null; total_orders: number | null };
export type VolumeSeries = ReturnType<typeof summarizeDashboardVolume>;
export type DashboardVolumeData = {
  today: string;
  delivery: { data: VolumeSeries | null; error: string | null };
  pickup: { data: VolumeSeries | null; error: string | null };
};
export function shiftVolumeDay(day: string, offset: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0,10);
}
export function summarizeDashboardVolume(rows: DashboardVolumeRow[], today: string) {
  const byDay = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const date = row.report_date?.slice(0,10), area = normalizeOperatingArea(row.area);
    // Match Volume reporting: a legacy detail row with no aggregate counts as one order.
    const count = row.total_orders == null ? 1 : Number(row.total_orders);
    if (!date || date > today || !area || !Number.isFinite(count) || count < 0) continue;
    const values = byDay.get(date) ?? new Map<string, number>();
    values.set(area, (values.get(area) ?? 0) + count); byDay.set(date,values);
  }
  const total = (date: string) => byDay.has(date) ? [...byDay.get(date)!.values()].reduce((n,v)=>n+v,0) : null;
  const latestDate = [...byDay.keys()].sort().at(-1) ?? null;
  return {
    latest: latestDate ? { date: latestDate, total: total(latestDate)!, areas: OPERATING_AREAS.map(area=>({area,orders:byDay.get(latestDate)!.get(area) ?? null})) } : null,
    daily: Array.from({length:14},(_,i)=>{const date=shiftVolumeDay(today,i-13);return {date,total:total(date)};}),
  };
}
