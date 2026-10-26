export type BacklogSource = "pickup" | "delivery";
export type BacklogPivotRow = { area: string; district: string; ward: string; cot1: number; cot2: number; other: number; orders: number };
export type BacklogSnapshot = {
  id: string; source: BacklogSource; source_snapshot_id: string; source_started_at: string | null;
  source_snapshot_at: string; captured_at: string; work_date: string; slot_at: string; total_orders: number;
};
export type BacklogCheckpoint = { source: BacklogSource; scheduled_for: string; status: string; snapshot_id: string | null; message: string };
export type BacklogDetail = { snapshot: BacklogSnapshot; rows: BacklogPivotRow[] };
export type BacklogLevel = "area" | "district" | "ward";
export type BacklogCot = "orders" | "cot1" | "cot2" | "other";
export type BacklogHourlyPoint = {
  hour: number; scheduled_for: string; status: string; is_final: boolean; snapshot_id: string | null;
  source_started_at: string | null; source_snapshot_at: string | null; total_orders: number | null;
  areas: Array<Pick<BacklogPivotRow, "area" | "cot1" | "cot2" | "other" | "orders">>;
};
export type BacklogHourlyDay = { source: BacklogSource; day: string; hours: BacklogHourlyPoint[]; checkpoints: BacklogCheckpoint[] };

export function hourlyValue(point: BacklogHourlyPoint | undefined, cot: BacklogCot = "orders", area = ""): number | null {
  if (!point?.snapshot_id) return null;
  return point.areas.filter(row => !area || row.area === area).reduce((total, row) => total + Number(row[cot]), 0);
}
export function hourlyChanges(points: BacklogHourlyPoint[], cot: BacklogCot = "orders", area = "") {
  return points.map((point, index) => {
    const value = hourlyValue(point, cot, area);
    const previous = points[index-1]?.hour === point.hour-1 ? hourlyValue(points[index-1], cot, area) : null;
    return { ...point, value, delta: value !== null && previous !== null ? value-previous : null,
      percent: value !== null && previous !== null && previous !== 0 ? (value-previous)/previous*100 : null };
  });
}
export function niceBacklogMax(values: Array<number | null>) {
  const max = Math.max(0, ...values.filter((value): value is number => value !== null));
  if (!max) return 5;
  const raw = max/5, power = 10 ** Math.floor(Math.log10(raw));
  const step = [1,2,5,10].find(value => value*power >= raw)!*power;
  return Math.max(5, step*5);
}

export function vietnamDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(now);
}
export function validHistoryDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function compareBacklog(before: BacklogPivotRow[], after: BacklogPivotRow[], level: BacklogLevel, cot: BacklogCot, area = "") {
  const groups = new Map<string, { area: string; district: string; ward: string; before: number; after: number }>();
  for (const [side, rows] of [["before", before], ["after", after]] as const) {
    for (const row of rows) {
      if (area && row.area !== area) continue;
      const district = level === "area" ? "" : row.district;
      const ward = level === "ward" ? row.ward : "";
      const key = JSON.stringify([row.area, district, ward]);
      const group = groups.get(key) ?? { area: row.area, district, ward, before: 0, after: 0 };
      group[side] += Number(row[cot]);
      groups.set(key, group);
    }
  }
  return [...groups.values()].map(row => ({ ...row, delta: row.after - row.before,
    percent: row.before ? (row.after - row.before) / row.before * 100 : null,
  })).sort((a, b) => a.area.localeCompare(b.area, "vi") || a.district.localeCompare(b.district, "vi") || a.ward.localeCompare(b.ward, "vi"));
}
