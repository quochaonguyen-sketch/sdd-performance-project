import { ohRankings, reasonName, type OHData, type OHRank } from "../onhold/model.ts";
import { normalizeOperatingArea } from "../locations/operating-areas.ts";

export function shiftOHDay(day: string, offset: number) {
  return new Date(Date.parse(day) + offset * 86400000).toISOString().slice(0, 10);
}

export function ohChange(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  const delta = current - previous;
  return { delta, percent: previous > 0 ? delta / previous * 100 : current === 0 ? 0 : null };
}

export function buildOHOverview(data: OHData, end: string, days: number, area = "all", selected?: string) {
  const reports = new Map(data.reports.map(r => [r.report_date, r]));
  const cells = data.cells.filter(c => {
    const normalized = normalizeOperatingArea(c.area);
    return normalized && (area === "all" || normalized === area);
  });
  const totals = new Map<string, number>();
  for (const cell of cells) totals.set(cell.report_date, (totals.get(cell.report_date) ?? 0) + cell.orders);
  const totalAt = (day: string) => reports.has(day) ? totals.get(day) ?? 0 : null;
  const partialAt = (day: string) => {
    const report = reports.get(day);
    return !!report && !report.finalized_at && (report.collection_mode === "cumulative" || day === end);
  };
  const daily = Array.from({ length: days }, (_, i) => {
    const date = shiftOHDay(end, i - days + 1);
    const orders = totalAt(date);
    return { date, orders, partial: partialAt(date), comparable: !partialAt(date) && !partialAt(shiftOHDay(date, -1)), change: ohChange(orders, totalAt(shiftOHDay(date, -1))) };
  });
  const day = daily.find(r => r.date === selected)?.date ?? daily.findLast(r => r.orders !== null)?.date ?? end;
  const orders = totalAt(day);
  const dayCells = cells.filter(c => c.report_date === day && reports.has(day) && c.orders > 0);
  const reasons = new Map<string, number>();
  for (const cell of dayCells) reasons.set(cell.reason, (reasons.get(cell.reason) ?? 0) + cell.orders);
  const previousDay = shiftOHDay(day, -1);
  const previousCells = cells.filter(c => c.report_date === previousDay && reports.has(previousDay) && c.orders > 0);
  const comparable = orders !== null && reports.has(previousDay) && !partialAt(day) && !partialAt(previousDay);
  function rankings(kind: "rider" | "ward") {
    const previous = new Map(ohRankings(previousCells, kind).map(r => [r.key, r.orders]));
    return ohRankings(dayCells, kind).map(r => ({ ...r, change: comparable ? ohChange(r.orders, previous.get(r.key) ?? 0) : null }));
  }
  const weekStart = shiftOHDay(day, -6);
  const previousWeekEnd = shiftOHDay(day, -7);
  const previousWeekStart = shiftOHDay(day, -13);
  const weekDates = Array.from({ length: 7 }, (_, i) => shiftOHDay(weekStart, i));
  const previousWeekDates = Array.from({ length: 7 }, (_, i) => shiftOHDay(previousWeekStart, i));
  const coverage = weekDates.filter(date => reports.has(date)).length;
  const previousCoverage = previousWeekDates.filter(date => reports.has(date)).length;
  const weekPartial = weekDates.some(partialAt);
  const weekComparable = coverage === 7 && previousCoverage === 7 && !weekPartial && !previousWeekDates.some(partialAt);
  const weekCells = cells.filter(c => c.report_date >= weekStart && c.report_date <= day && reports.has(c.report_date) && c.orders > 0);
  const previousWeekCells = cells.filter(c => c.report_date >= previousWeekStart && c.report_date <= previousWeekEnd && reports.has(c.report_date) && c.orders > 0);
  function weeklyRankings(kind: "rider" | "ward") {
    const previous = new Map(ohRankings(previousWeekCells, kind).map(r => [r.key, r.orders]));
    return ohRankings(weekCells, kind).map(r => ({ ...r, change: weekComparable ? ohChange(r.orders, previous.get(r.key) ?? 0) : null }));
  }
  return {
    daily, day, orders, report: reports.get(day), partial: partialAt(day), comparable, previousDay, previousOrders: totalAt(previousDay), change: ohChange(orders, totalAt(previousDay)),
    riders: rankings("rider"), wards: rankings("ward"),
    week: { start: weekStart, end: day, previousStart: previousWeekStart, previousEnd: previousWeekEnd, coverage, previousCoverage, partial: weekPartial, comparable: weekComparable, total: coverage ? weekCells.reduce((n, c) => n + c.orders, 0) : null, riders: weeklyRankings("rider"), wards: weeklyRankings("ward") },
    reasons: [...reasons].map(([reason, orders]) => ({ reason, label: reasonName(reason), orders })).sort((a, b) => b.orders - a.orders || a.reason.localeCompare(b.reason)),
  };
}

export type OHOverviewRank = OHRank & { change: ReturnType<typeof ohChange> };
