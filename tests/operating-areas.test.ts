import test from "node:test";
import assert from "node:assert/strict";
import { OPERATING_AREAS, normalizeOperatingArea } from "../lib/locations/operating-areas.ts";
import { buildAnalytics, buildDeliveryDistrictBoards, deliveryInventoryRows, type InventoryRow } from "../components/lmhub-inventory/lmhub-inventory-model.ts";
import { parsePlanSheets, PLAN_TABS } from "../lib/operations-sheet/schema.ts";

test("the five operating areas accept normalized labels but never KV6 or BK", () => {
  assert.deepEqual(OPERATING_AREAS, ["KV1", "KV2", "KV3", "KV4", "KV5"]);
  for (const area of OPERATING_AREAS) {
    assert.equal(normalizeOperatingArea(area), area);
    assert.equal(normalizeOperatingArea(` Khu vực ${area.slice(-1)} `), area);
  }
  for (const value of ["KV6", "6", "KV0", "KV15", "BK", "BK5", null]) assert.equal(normalizeOperatingArea(value), null);
});

test("inventory preserves all five KV assignments even when districts and wards overlap", () => {
  const rows = [...OPERATING_AREAS, "KV6"].map((area, index) => ({ shipment_id: String(index), area, district: "Quận 1", ward: "Phường 1", cot_group: "COT1" } as InventoryRow));
  const scoped = deliveryInventoryRows(rows);
  assert.deepEqual(scoped.map((row) => row.area), [...OPERATING_AREAS]);
  const boards = buildDeliveryDistrictBoards(rows);
  assert.deepEqual(boards.map((board) => board.area), [...OPERATING_AREAS]);
  assert.equal(buildAnalytics(boards, [], "all").visible, 5);
  assert.equal(rows[5].area, "KV6", "historical input must stay unchanged");
});

test("Excel import accepts KV1–5 and rejects KV6", () => {
  const sheet = (area: string) => ({ TUYEN_RIDER: [[...PLAN_TABS.TUYEN_RIDER.headers], ["R001", "Rider", area]] });
  for (const area of OPERATING_AREAS) assert.equal(parsePlanSheets(sheet(area)).issues.length, 0);
  assert.match(parsePlanSheets(sheet("KV6")).issues[0].message, /KV1.*KV5/);
});
