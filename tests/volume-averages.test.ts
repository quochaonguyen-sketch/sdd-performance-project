import test from "node:test";
import assert from "node:assert/strict";
import { averageChartRows, buildDistrictAverages } from "../lib/dashboard/volume-averages.ts";

test("monthly averages keep districts in their source areas and reconcile both levels", () => {
  const data = buildDistrictAverages([
    { report_date: "2026-10-01", area: "KV1", district: "Quận 1", total_orders: 100 },
    { report_date: "2026-10-02", area: "KV1", district: "Quận 1", total_orders: 200 },
    { report_date: "2026-10-02", area: "KV1", district: "Quận 5", total_orders: 100 },
    { report_date: "2026-10-02", area: "Khu vực 2", district: "Quận 1", total_orders: 80 },
    { report_date: "2026-09-30", area: "KV1", district: "Quận 1", total_orders: 999 },
    { report_date: "2026-10-24", area: "KV1", district: "Quận 1", total_orders: 999 },
    { report_date: "2026-10-01", area: "KV6", district: "Quận 1", total_orders: 999 },
  ], "2026-10-23");
  assert.equal(data.dayCount, 2);
  const overview = averageChartRows(data, "all");
  assert.deepEqual(overview.map((row) => row.average), [200, 40, 0, 0, 0]);
  assert.deepEqual(averageChartRows(data, "KV1").map((row) => [row.label, row.average]), [["Quận 1", 150], ["Quận 5", 50]]);
  assert.deepEqual(averageChartRows(data, "KV2").map((row) => [row.label, row.average]), [["Quận 1", 40]]);
  for (const row of overview) assert.equal(row.average, averageChartRows(data, row.area).reduce((sum, district) => sum + district.average, 0));
  assert.deepEqual(averageChartRows(data, "KV5"), []);
});

test("empty months have finite zero area totals and no district rows", () => {
  const data = buildDistrictAverages([], "2026-10-23");
  assert.equal(data.dayCount, 0);
  assert.ok(averageChartRows(data, "all").every((row) => row.average === 0));
  assert.deepEqual(averageChartRows(data, "KV1"), []);
});
