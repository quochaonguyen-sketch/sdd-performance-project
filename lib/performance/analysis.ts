export type PerformanceTotals = {
  delivery_assigned: number; delivery_delivered: number; pickup_assigned: number; pickup_picked: number;
};
export type CotTotals = PerformanceTotals & {
  delivery_assigned_cot1: number; delivery_delivered_cot1: number; delivery_assigned_cot2: number; delivery_delivered_cot2: number;
  pickup_assigned_cot1: number; pickup_picked_cot1: number; pickup_assigned_cot2: number; pickup_picked_cot2: number;
};
export type DailyPerformance = PerformanceTotals & { date: string; riders: number };
export type AreaPerformance = CotTotals & { kv: string };
export type PerformanceBin = { label: string; min: number; max: number | null; count: number };
export type PerformanceAnalysis = {
  start: string; end: string; daily: (DailyPerformance | { date: string; missing: true })[];
  areas: AreaPerformance[]; distribution: PerformanceBin[]; withoutDelivery: number; riderCount: number;
  totals: PerformanceTotals; anomalyCount: number;
};
export type PerformanceAnalysisInput = {
  daily: DailyPerformance[] | null; areas: AreaPerformance[] | null;
  riders: PerformanceTotals[] | null;
};
export function performanceRate(completed: number, assigned: number): number | null {
  return assigned > 0 ? completed / assigned * 100 : null;
}
export function shiftPerformanceDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function buildPerformanceAnalysis(input: PerformanceAnalysisInput, start: string, end: string): PerformanceAnalysis {
  const byDay = new Map((input.daily ?? []).map(row => [row.date, row]));
  const daily: PerformanceAnalysis["daily"] = [];
  for (let date = start; date <= end; date = shiftPerformanceDate(date, 1)) daily.push(byDay.get(date) ?? { date, missing: true });
  const distribution: PerformanceBin[] = [
    { label: "<60%", min: 0, max: 60, count: 0 }, { label: "60–<70%", min: 60, max: 70, count: 0 },
    { label: "70–<80%", min: 70, max: 80, count: 0 }, { label: "80–<90%", min: 80, max: 90, count: 0 },
    { label: "90–100%", min: 90, max: 100, count: 0 }, { label: ">100%", min: 100, max: null, count: 0 },
  ];
  const totals: PerformanceTotals = { delivery_assigned: 0, delivery_delivered: 0, pickup_assigned: 0, pickup_picked: 0 };
  let withoutDelivery = 0, anomalyCount = 0;
  for (const row of input.riders ?? []) {
    for (const key of Object.keys(totals) as (keyof PerformanceTotals)[]) totals[key] += row[key];
    const rate = performanceRate(row.delivery_delivered, row.delivery_assigned);
    if (rate === null) { withoutDelivery++; continue; }
    if (rate < 0 || rate > 100) anomalyCount++;
    const bin = rate > 100 ? 5 : rate >= 90 ? 4 : rate >= 80 ? 3 : rate >= 70 ? 2 : rate >= 60 ? 1 : 0;
    distribution[bin].count++;
  }
  return { start, end, daily, areas: input.areas ?? [], distribution, withoutDelivery, riderCount: input.riders?.length ?? 0, totals, anomalyCount };
}
