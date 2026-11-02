import test from "node:test";
import assert from "node:assert/strict";
import { analysisScopeForQuestion, buildOperationsAnalysis, metricChange, validateAnalysisScope, type AnalysisInput } from "../lib/ai/operations-analysis.ts";
import type { BacklogHourlyDay } from "../lib/dashboard/backlog-history.ts";
import type { OHCell, OHReport } from "../lib/onhold/model.ts";
import type { ReturnWorkspaceRow } from "../lib/return-orders/workspace.ts";

const before = "2026-10-31", day = "2026-11-01", today = "2026-11-02";
function fixture(): AnalysisInput {
  return { scope: { from: day, to: day, area: "KV1", hour: 23 }, today, now: `${today}T10:00:00Z`,
    sources: ["backlog_delivery", "backlog_pickup", "oh", "volume", "overnight", "fc", "return"].map(id => ({ id: `analysis_${id}`, label: id, state: "ready", at: null, href: "/", note: "" })),
    backlog: null, oh: { reports: [before, day].map(report), cells: [cell(before, 10), cell(day, 15)] },
    volume: [before, day].map(report_date => ({ report_date, area: "KV1", total_orders: 100 })), overnight: null, hub: null, returns: null };
}
function report(report_date: string): OHReport { return { report_date, fetched_at: `${report_date}T16:00:00Z`, total_orders: 100, input_count: 100, excluded_count: 0, collection_mode: "cumulative", finalized_at: `${report_date}T17:00:00Z` }; }
function cell(report_date: string, orders: number, area = "KV1"): OHCell { return { report_date, orders, area, district: "Quận 1", ward: "Phường 1", reason: "169", status: 5, hour: 20 }; }
function backlog(date: string, value: number, final = true, hour = 23): BacklogHourlyDay {
  return { source: "delivery", day: date, checkpoints: [], hours: [{ hour, scheduled_for: `${date}T16:50:00Z`, status: "captured", is_final: final, snapshot_id: date, source_started_at: null, source_snapshot_at: `${date}T16:49:00Z`, total_orders: value, areas: [{ area: "KV1", orders: value, cot1: value, cot2: 0, other: 0 }] }] };
}

test("OH uses same-day same-KV Delivery Volume and distinguishes count % from percentage points", () => {
  const f = fixture(); f.oh!.cells.push(cell(day, 999, "KV2"));
  const data = buildOperationsAnalysis(f), oh = data.daily[0].oh;
  assert.equal(oh.orders, 15); assert.equal(oh.rate, 15); assert.equal(oh.denominator, 100);
  assert.equal(oh.change?.percent, 50); assert.equal(oh.rateChangePp, 5);
  assert.equal(data.ohHotspots[0].orders, 15); assert.equal(data.ohHotspots[0].sharePct, 100);
  f.volume![1].total_orders = 300;
  assert.equal(buildOperationsAnalysis(f).daily[0].oh.rateChangePp, -5);
});

test("OH denominator absent/zero and incomplete day never become false zero rates or finalized changes", () => {
  const f = fixture(); f.volume![1].total_orders = 0;
  assert.equal(buildOperationsAnalysis(f).daily[0].oh.rate, null);
  f.volume = []; assert.equal(buildOperationsAnalysis(f).daily[0].volume, null);
  f.oh!.reports[1].finalized_at = null;
  const result = buildOperationsAnalysis(f).daily[0].oh;
  assert.equal(result.orders, 15); assert.equal(result.partial, true); assert.equal(result.change, null); assert.equal(result.rateChangePp, null);
  f.oh!.reports = []; assert.equal(buildOperationsAnalysis(f).daily[0].oh.orders, null);
});

test("all-KV OH ratio requires all five Volume areas and keeps identical ward names scoped to KV", () => {
  const f = fixture(); f.scope.area = "all";
  assert.equal(buildOperationsAnalysis(f).daily[0].oh.rate, null);
  for (const area of ["KV2", "KV3", "KV4", "KV5"]) f.volume!.push({ report_date: day, area, total_orders: 100 });
  f.oh!.cells.push(cell(day, 5, "KV2"));
  const data = buildOperationsAnalysis(f);
  assert.equal(data.daily[0].oh.rate, 4); assert.equal(data.ohHotspots.length, 2);
  assert.equal(data.ohAreas[1].rate, 5); assert.equal(data.ohHotspots[0].sharePct, 75);
});

test("backlog compares only same clock hour and two official snapshots, retaining missing and provisional values", () => {
  const f = fixture(); f.backlog = [backlog(before, 20), backlog(day, 30)];
  assert.deepEqual(buildOperationsAnalysis(f).daily[0].deliveryBacklog.change, { delta: 10, percent: 50 });
  f.backlog[1].hours[0].is_final = false;
  const provisional = buildOperationsAnalysis(f).daily[0].deliveryBacklog;
  assert.equal(provisional.value, 30); assert.equal(provisional.change, null);
  f.backlog[1] = backlog(day, 30, true, 22);
  assert.equal(buildOperationsAnalysis(f).daily[0].deliveryBacklog.value, null);
  assert.equal(metricChange(10, 0)?.percent, null); assert.deepEqual(metricChange(0, 0), { delta: 0, percent: 0 });
});

test("overnight totals compare locked cutoff cohorts, remaining reflects current status and excludes other KVs", () => {
  const f = fixture();
  f.overnight = { snapshots: [before, day].map(cutoff_date => ({ cutoff_date, captured_at: `${cutoff_date}T16:00:00Z`, status: "locked", status_synced_at: f.now })), rows: [
    { cutoff_date: before, area: "KV1", current_status: "Delivered" },
    { cutoff_date: day, area: "KV1", current_status: "Returned" }, { cutoff_date: day, area: "KV1", current_status: "Delivering" },
    { cutoff_date: day, area: "KV2", current_status: "Delivering" },
  ] };
  const row = buildOperationsAnalysis(f).daily[0].overnight!;
  assert.equal(row.total, 2); assert.equal(row.remaining, 1); assert.equal(row.change?.delta, 1);
  assert.equal(buildOperationsAnalysis(f).overnightFocus?.date, day); assert.equal(buildOperationsAnalysis(f).overnightFocus?.total, 2);
  f.overnight.snapshots[1].status = "collecting";
  assert.equal(buildOperationsAnalysis(f).daily[0].overnight, null);
});

test("FC compares HCM Inbound rather than Delivery Volume, only same date and complete scope", () => {
  const f = fixture(); f.scope.area = "all";
  f.hub = { date: day, totals: { lm_hub_inbounded_order_qty_eod: 1200 }, stations: [], fc: { data: { checkedAt: f.now, rows: [{ date: day, total: 1000, mismatch: false }] }, error: null } };
  const fc = buildOperationsAnalysis(f).forecast!;
  assert.equal(fc.actual, 1200); assert.equal(fc.change?.delta, 200); assert.equal(fc.change?.percent, 20); assert.equal(fc.attainmentPct, 120);
  f.scope.area = "KV1"; assert.equal(buildOperationsAnalysis(f).forecast?.change, null);
  f.scope.area = "all"; f.scope.from = before; f.scope.to = before;
  assert.equal(buildOperationsAnalysis(f).forecast?.actual, null); assert.equal(buildOperationsAnalysis(f).forecast?.fc, null);
  f.scope.to = today; f.hub.date = today; assert.equal(buildOperationsAnalysis(f).forecast?.partial, true);
});

test("Return distinguishes hub age from returning SLA and never fabricates historical flow", () => {
  const f = fixture();
  const row = (status: number, age: number | null, deliveringHours: number | null): ReturnWorkspaceRow => ({ seller_area: "KV1", seller_district: "Quận 1", order_status: status, current_station_received_time: age === null ? null : new Date(Date.parse(f.now) - age * 86400000).toISOString(), receive_time: null, delivering_time: deliveringHours === null ? null : new Date(Date.parse(f.now) - deliveringHours * 3600000).toISOString() } as ReturnWorkspaceRow);
  f.returns = { snapshotAt: `${today}T09:00:00Z`, rows: [row(10, 6, null), row(72, 2, 49), row(72, null, null), row(67, 1, null)] };
  const returns = buildOperationsAnalysis(f).returns!;
  assert.equal(returns.total, 4); assert.equal(returns.waiting, 2); assert.equal(returns.returning, 2);
  assert.equal(returns.over5Days, 1); assert.equal(returns.returningOver48h, 1); assert.equal(returns.unknownHubAge, 1); assert.equal(returns.unknownReturningStart, 1);
  assert.equal(returns.historyAvailable, false); assert.equal(returns.ageEvaluatedAt, f.now);
  f.sources.find(source => source.id === "analysis_return")!.state = "error";
  assert.equal(buildOperationsAnalysis(f).returns, null);
});

test("question scope resolves bounded day ranges, KV and clock consistently with filters", () => {
  assert.deepEqual(analysisScopeForQuestion("OH từ 26/10/2026 đến 01/11/2026 KV3 mốc 13h", today), { from: "2026-10-26", to: day, area: "KV3", hour: 13 });
  assert.equal(analysisScopeForQuestion("Backlog 7 ngày", today).from, "2026-10-27");
  assert.equal(analysisScopeForQuestion("OH hôm qua", today).to, day);
  assert.equal(analysisScopeForQuestion("OH toàn bộ KV1–KV5", today).area, "all");
  assert.equal(analysisScopeForQuestion("Backlog checkpoint 13:50", today).hour, 13);
  for (const scope of [{ from: "2026-09-01" }, { to: "2026-11-03" }, { hour: 24 }, { area: "KV6" }, { from: "2026-02-30" }]) assert.throws(() => validateAnalysisScope({ ...fixture().scope, ...scope }, today));
});

test("OH hotspots prefer latest finalized day with Volume while retaining provisional today in daily series", () => {
  const f = fixture(); f.scope.to = today; f.oh!.reports.push({ ...report(today), finalized_at: null }); f.oh!.cells.push(cell(today, 3));
  const data = buildOperationsAnalysis(f);
  assert.equal(data.ohFocusDate, day); assert.equal(data.ohHotspots[0].orders, 15);
  assert.equal(data.daily[1].oh.orders, 3); assert.equal(data.daily[1].oh.partial, true);
});
