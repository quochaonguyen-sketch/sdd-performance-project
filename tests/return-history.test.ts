import test from "node:test";
import assert from "node:assert/strict";
import { summarizeReturnHistory, type ReturnHistoryData, type ReturnHistoryGroup, type ReturnHistoryDay } from "../lib/return-orders/history.ts";
import { isReturnOnlyAnalysis } from "../lib/ai/operations-analysis.ts";

const today = "2026-11-02", before = "2026-10-31", day = "2026-11-01";
const header = (report_date: string): ReturnHistoryDay => ({ report_date, snapshot_id: report_date, captured_at: `${report_date}T15:00:00Z`, total_orders: 999, unknown_area_orders: 3, station_id: 4232, capture_count: 2 });
const group = (report_date: string, area: string, total: number, district = "Quận 1"): ReturnHistoryGroup => ({ report_date, area, district, ward: "Phường 1", total, waiting: total, returning_count: 0, over5_days: 0, returning_over48h: 0, unknown_hub_age: 0, unknown_returning_start: 0 });
const scope = { from: day, to: today, area: "all" };

test("only questions about Return bypass unrelated operational sources", () => {
  assert.equal(isReturnOnlyAnalysis("Phân tích tồn Return theo ngày, KV nào tồn nhiều?"), true);
  assert.equal(isReturnOnlyAnalysis("Hàng trả hôm qua tăng giảm thế nào?"), true);
  assert.equal(isReturnOnlyAnalysis("Backlog, OH và Return theo ngày"), false);
  assert.equal(isReturnOnlyAnalysis("OH hôm nay"), false);
});

test("Return stock changes use adjacent dates, scope, both absolute delta and percentage", () => {
  const data: ReturnHistoryData = { days: [header(before), header(day), header(today)], groups: [group(before, "KV1", 100), group(day, "KV1", 120), group(today, "KV1", 90), group(day, "KV2", 1000)] };
  const result = summarizeReturnHistory(data, { ...scope, area: "KV1" }, today);
  assert.deepEqual(result.daily[0].change, { delta: 20, percent: 20 });
  assert.equal(result.daily[1].change, null); assert.deepEqual(result.daily[1].provisionalChange, { delta: -30, percent: -25 });
  assert.equal(result.daily[1].partial, true); assert.equal(result.areas[0].total, 90); assert.equal(result.areas[0].area, "KV1");
});
test("missing dates remain unknown, never zero or a comparison across a missing day", () => {
  const result = summarizeReturnHistory({ days: [header(before), header(today)], groups: [group(before, "KV1", 10), group(today, "KV1", 20)] }, scope, today);
  assert.equal(result.daily[0].counts, null); assert.equal(result.daily[1].provisionalChange, null); assert.equal(result.daily[1].counts?.total, 20);
  assert.equal(result.focusDate, today);
});
test("complete empty publication and absent groups in a captured KV are true zeros", () => {
  const data: ReturnHistoryData = { days: [header(before), { ...header(day), total_orders: 0 }], groups: [group(before, "KV1", 10)] };
  const result = summarizeReturnHistory(data, { from: day, to: day, area: "all" }, today);
  assert.equal(result.latest?.counts?.total, 0); assert.deepEqual(result.latest?.change, { delta: -10, percent: -100 });
  assert.equal(result.areas[0].sharePct, null); assert.equal(result.hotspots[0].total, 0);
  const newlyGrowing = summarizeReturnHistory({ days: [header(before), header(day)], groups: [group(day, "KV1", 5)] }, { from: day, to: day, area: "KV1" }, today);
  assert.equal(newlyGrowing.latest?.change?.delta, 5); assert.equal(newlyGrowing.latest?.change?.percent, null);
});
test("KV ranking uses total stock, separates overdue stock and excludes unknown area from shares", () => {
  const data: ReturnHistoryData = { days: [header(day)], groups: [group(day, "KV3", 170), { ...group(day, "KV5", 118), over5_days: 2 }, group(day, "unknown", 5000)] };
  const result = summarizeReturnHistory(data, { from: day, to: day, area: "all" }, today);
  assert.equal(result.latest?.counts?.total, 288); assert.equal(result.areas[0].area, "KV3"); assert.equal(result.areas[1].over5Days, 2);
  assert.equal(result.latest?.unknownAreaOrders, 3); assert.equal(result.hotspots.length, 2);
  assert.equal(result.areas[0].sharePct, 170 / 288 * 100);
});
test("historical ages and timestamps stay frozen; missing source days do not become healthy data", () => {
  const data: ReturnHistoryData = { days: [header(day)], groups: [{ ...group(day, "KV1", 20), over5_days: 2, returning_over48h: 1, returning_count: 5, waiting: 15 }] };
  const a = summarizeReturnHistory(data, { from: day, to: day, area: "all" }, today);
  const b = summarizeReturnHistory(data, { from: day, to: day, area: "all" }, "2026-12-01");
  assert.deepEqual(a.latest?.counts, b.latest?.counts); assert.equal(a.latest?.capturedAt, header(day).captured_at);
  const missing = summarizeReturnHistory({ days: [], groups: [] }, scope, today);
  assert.equal(missing.latest, null); assert.deepEqual(missing.areas, []); assert.deepEqual(missing.hotspots, []);
});
test("top districts are bounded after full totals, identical names in two KVs stay separate", () => {
  const groups = Array.from({ length: 20 }, (_, i) => group(day, "KV1", i + 1, `Quận ${i}`));
  groups.push(group(day, "KV3", 30, "Quận 1"));
  const result = summarizeReturnHistory({ days: [header(day)], groups }, { from: day, to: day, area: "all" }, today);
  assert.equal(result.latest?.counts?.total, 240); assert.equal(result.hotspots.length, 15); assert.equal(result.hotspots[0].area, "KV3");
  assert.equal(result.areas.find(row => row.area === "KV1")?.total, 210);
});
