import test from "node:test";
import assert from "node:assert/strict";
import { buildOHOverview, ohChange, shiftOHDay } from "../lib/dashboard/onhold-overview.ts";
import type { OHCell, OHData, OHReport } from "../lib/onhold/model.ts";

const report = (day: string): OHReport => ({ report_date: day, fetched_at: `${day}T10:00:00Z`, input_count: 0, excluded_count: 0, total_orders: 0 });
const cell = (orders: number, fields: Partial<OHCell> = {}): OHCell => ({ report_date: "2026-10-29", area: "Khu vực 1", reason: "169", hour: 12, status: 5, orders, district: "Quận A", ward: "Phường 1", rider_code: "R1", rider_name: "Rider 1", ...fields });

test("OH daily totals match rankings, include both recorded statuses and scope KV1–KV5", () => {
  const data: OHData = { reports: [report("2026-10-28"), report("2026-10-29")], cells: [
    cell(4, { report_date: "2026-10-28" }), cell(3), cell(2, { status: 1 }),
    cell(5, { area: "KV2", district: "Quận B", rider_code: "R2", rider_name: "Rider 2", reason: "170" }),
    cell(900, { area: "KV6" }), cell(600, { area: "Chưa rõ KV" }),
  ] };
  const view = buildOHOverview(data, "2026-10-29", 7);
  assert.equal(view.orders, 10);
  assert.deepEqual(view.change, { delta: 6, percent: 150 });
  assert.equal(view.riders.reduce((n, r) => n + r.orders, 0), 10);
  assert.equal(view.wards.length, 2); // Same ward label in different districts stays separate.
  assert.equal(view.reasons.reduce((n, r) => n + r.orders, 0), 10);
  assert.equal(buildOHOverview(data, "2026-10-29", 7, "KV1").orders, 5);
  assert.equal(buildOHOverview(data, "2026-10-29", 7, "all", "2026-10-28").orders, 4);
});

test("OH missing dates remain unknown, real zero remains zero, fallback uses actual date", () => {
  const data = { reports: [report("2026-10-27"), report("2026-10-28")], cells: [cell(6, { report_date: "2026-10-27" })] };
  const view = buildOHOverview(data, "2026-10-29", 7);
  assert.equal(view.day, "2026-10-28");
  assert.equal(view.orders, 0);
  assert.deepEqual(view.change, { delta: -6, percent: -100 });
  assert.equal(view.daily.at(-1)?.orders, null);
  assert.equal(view.daily.at(-1)?.change, null);
  const missing = buildOHOverview(data, "2026-10-29", 7, "all", "2026-10-29");
  assert.equal(missing.orders, null);
  assert.deepEqual(missing.riders, []);
  assert.equal(buildOHOverview({ reports: [], cells: [] }, "2026-10-29", 14).orders, null);
});

test("OH compares with the day just outside the visible range and avoids division by zero", () => {
  const data = { reports: [report("2026-10-22"), report("2026-10-23")], cells: [cell(4, { report_date: "2026-10-22" }), cell(6, { report_date: "2026-10-23" })] };
  assert.deepEqual(buildOHOverview(data, "2026-10-29", 7).daily[0].change, { delta: 2, percent: 50 });
  assert.deepEqual(ohChange(8, 0), { delta: 8, percent: null });
  assert.deepEqual(ohChange(0, 0), { delta: 0, percent: 0 });
  assert.equal(ohChange(8, null), null);
  assert.equal(shiftOHDay("2026-01-01", -1), "2025-12-31");
});

test("unfinished days do not produce ranking deltas or comparable daily changes", () => {
  const previous = { ...report("2026-10-28"), collection_mode: "cumulative" as const, finalized_at: "2026-10-28T17:00:00Z" };
  const today = { ...report("2026-10-29"), collection_mode: "cumulative" as const, finalized_at: null };
  const data = { reports: [previous, today], cells: [cell(500, { report_date: previous.report_date }), cell(5)] };
  const view = buildOHOverview(data, "2026-10-29", 7);
  assert.equal(view.partial, true);
  assert.equal(view.comparable, false);
  assert.equal(view.riders[0].change, null);
  assert.equal(view.daily.at(-1)?.comparable, false);
  assert.equal(view.previousOrders, 500);
  assert.equal(view.reasons[0].label, "Recipient unavailable for parcel");
  const finalized = buildOHOverview({ ...data, reports: [previous, { ...today, finalized_at: "2026-10-29T17:00:00Z" }] }, "2026-10-29", 7);
  assert.equal(finalized.comparable, true);
  assert.deepEqual(finalized.riders[0].change, { delta: -495, percent: -99 });
});

test("ranking comparisons keep geography scope, real zero and missing baselines distinct", () => {
  const data = { reports: [report("2026-10-26"), report("2026-10-27")], cells: [cell(7, { report_date: "2026-10-27" }), cell(12, { report_date: "2026-10-26", area: "KV2" })] };
  const view = buildOHOverview(data, "2026-10-29", 7, "KV1");
  assert.equal(view.comparable, true);
  assert.deepEqual(view.riders[0].change, { delta: 7, percent: null });
  assert.equal(buildOHOverview({ ...data, reports: [report("2026-10-27")] }, "2026-10-29", 7).riders[0].change, null);
});

test("weekly rankings sum seven days and compare with the preceding seven days", () => {
  const dates = Array.from({ length: 14 }, (_, i) => shiftOHDay("2026-10-28", i - 13));
  const reports = dates.map(report);
  const cells = dates.map((date, i) => cell(i < 7 ? 2 : 3, { report_date: date }));
  cells.push(cell(999, { report_date: "2026-10-14" }), cell(500, { area: "KV6", report_date: "2026-10-28" }));
  const week = buildOHOverview({ reports, cells }, "2026-10-29", 7, "all", "2026-10-28").week;
  assert.equal(week.start, "2026-10-22");
  assert.equal(week.end, "2026-10-28");
  assert.equal(week.previousStart, "2026-10-15");
  assert.equal(week.previousEnd, "2026-10-21");
  assert.equal(week.total, 21);
  assert.equal(week.coverage, 7);
  assert.equal(week.comparable, true);
  assert.equal(week.riders[0].orders, 21);
  assert.deepEqual(week.riders[0].change, { delta: 7, percent: 50 });
  assert.deepEqual(week.wards[0].change, { delta: 7, percent: 50 });
});

test("weekly coverage preserves missing days and suppresses incomplete-week comparisons", () => {
  const data = { reports: [report("2026-10-28"), { ...report("2026-10-29"), collection_mode: "cumulative" as const }], cells: [cell(5), cell(10, { report_date: "2026-10-28" })] };
  const week = buildOHOverview(data, "2026-10-29", 14).week;
  assert.equal(week.total, 15);
  assert.equal(week.coverage, 2);
  assert.equal(week.partial, true);
  assert.equal(week.comparable, false);
  assert.equal(week.riders[0].change, null);
  assert.equal(buildOHOverview({ reports: [], cells: [] }, "2026-10-29", 7).week.total, null);
  assert.equal(buildOHOverview({ reports: [report("2026-10-28")], cells: [] }, "2026-10-29", 7).week.total, 0);
});
