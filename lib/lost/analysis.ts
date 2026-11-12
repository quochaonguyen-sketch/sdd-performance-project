import { shiftCalendarDay } from "../performance/calendar.ts";
import { lostNameKey, matchesLostGroup, type LostRow } from "./model.ts";

type LostCase = "pickup" | "notReceived";
export type LostRank = "total" | LostCase;
export type LostAnalysisFilters = { from: string; to: string; rank: LostRank };

const dayMs = 86_400_000;
const validDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) &&
  new Date(day).toISOString().slice(0, 10) === day;

export function recentLostDays(today: string) {
  return { from: shiftCalendarDay(today, -29), to: today };
}

export function parseLostAnalysisFilters(params: URLSearchParams, today: string): LostAnalysisFilters | null {
  const defaults = recentLostDays(today);
  const from = params.get("from") ?? defaults.from;
  const to = params.get("to") ?? defaults.to;
  const rank = params.get("rank");
  if (!validDay(from) || !validDay(to) || from > to || to > today) return null;
  return { from, to, rank: rank === "pickup" || rank === "notReceived" ? rank : "total" };
}

export function buildLostAnalysis(rows: Iterable<LostRow>, filters: LostAnalysisFilters, today: string) {
  const { from, to, rank } = filters;
  const unique = new Map<string, { row: LostRow; kind: LostCase }>();
  for (const row of rows) {
    if (row.date < from || row.date > to || !validDay(row.date)) continue;
    const kind = matchesLostGroup(row, "not-received") ? "notReceived" : matchesLostGroup(row, "pickup") ? "pickup" : null;
    if (!kind) continue;
    const previous = unique.get(row.shipment);
    if (!previous || row.date > previous.row.date || (row.date === previous.row.date && kind === "notReceived" && previous.kind === "pickup")) {
      unique.set(row.shipment, { row, kind });
    }
  }

  const start = Date.parse(from);
  const days = (Date.parse(to) - start) / dayMs + 1;
  const step = days <= 31 ? 1 : 7 * Math.ceil(days / (31 * 7));
  const points = Array.from({ length: Math.ceil(days / step) }, (_, index) => ({
    from: shiftCalendarDay(from, index * step), to: shiftCalendarDay(from, Math.min(days, (index + 1) * step) - 1),
    pickup: 0, notReceived: 0,
  }));
  const totals = { pickup: 0, notReceived: 0 };
  const verified: { kind: LostCase; rider: string; code: string }[] = [];
  const codeByName = new Map<string, string | null>();
  for (const { row, kind } of unique.values()) {
    const index = Math.floor((Date.parse(row.date) - start) / (dayMs * step));
    points[index][kind]++;
    totals[kind]++;
    const event = row.event;
    const rider = event?.rider?.trim();
    if (!rider || event?.status !== (kind === "pickup" ? 39 : 4)) continue;
    const code = event.code?.trim() ?? "";
    verified.push({ kind, rider, code });
    if (code) {
      const key = lostNameKey(rider);
      const existing = codeByName.get(key);
      codeByName.set(key, existing === undefined || existing === code ? code : null);
    }
  }

  const counts = new Map<string, { key: string; rider: string; code: string; pickup: number; notReceived: number; total: number }>();
  for (const entry of verified) {
    const name = lostNameKey(entry.rider);
    const code = entry.code || codeByName.get(name) || "";
    const key = code ? `code:${code}` : `name:${name}`;
    const rider = counts.get(key) ?? { key, rider: entry.rider, code, pickup: 0, notReceived: 0, total: 0 };
    rider[entry.kind]++;
    rider.total++;
    counts.set(key, rider);
  }
  const riders = [...counts.values()].filter(rider => rider[rank] > 0)
    .sort((a, b) => b[rank] - a[rank] || b.total - a.total || a.rider.localeCompare(b.rider, "vi") || a.key.localeCompare(b.key))
    .slice(0, 10);
  return { filters, today, points, step, totals, riders, withoutRider: unique.size - verified.length };
}

export type LostAnalysisData = ReturnType<typeof buildLostAnalysis>;
