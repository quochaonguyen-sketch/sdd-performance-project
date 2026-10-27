import test from "node:test";
import assert from "node:assert/strict";
import { buildDeliveryReport, reportHeat } from "../components/lmhub-inventory/delivery-backlog-report-model.ts";

const districts = [
  { area: "KV2" as const, district: "Quận 1", wards: [], totals: { cot1: 4, cot2: 6, total: 10 } },
  { area: "KV1" as const, district: "Quận 5", wards: [], totals: { cot1: 1, cot2: 9, total: 10 } },
  { area: "KV1" as const, district: "Quận 1", wards: [], totals: { cot1: 2, cot2: 3, total: 5 } },
];

test("report preserves the same district in different areas and totals each level exactly once", () => {
  const rows = buildDeliveryReport(districts, "all");
  assert.deepEqual(rows.filter((r) => r.kind === "district").map((r) => [r.area, r.district]), [
    ["KV1", "Quận 1"], ["KV1", "Quận 5"], ["KV2", "Quận 1"],
  ]);
  assert.deepEqual(rows.filter((r) => r.kind === "subtotal").map((r) => [r.cot1, r.cot2, r.total]), [[3, 12, 15], [4, 6, 10]]);
  assert.deepEqual(rows.at(-1), { kind: "total", area: "TỔNG CỘNG", district: "", cot1: 7, cot2: 18, total: 25 });
  assert.equal(districts[0].area, "KV2");
});

test("selected COT applies to districts, subtotals and grand total", () => {
  for (const cot of ["cot1", "cot2"] as const) {
    const rows = buildDeliveryReport(districts, cot);
    const hidden = cot === "cot1" ? "cot2" : "cot1";
    assert.ok(rows.every((r) => r[hidden] === 0 && r.total === r[cot]));
    assert.equal(rows.at(-1)!.total, cot === "cot1" ? 7 : 18);
  }
});

test("empty report has zero totals and no fabricated areas; heat supports zero", () => {
  assert.deepEqual(buildDeliveryReport([], "all").map((r) => r.total), [0]);
  assert.equal(reportHeat(0, 0), "#ffffff");
  assert.notEqual(reportHeat(1, 100), reportHeat(100, 100));
});
