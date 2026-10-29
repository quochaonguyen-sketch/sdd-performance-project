import test from "node:test";
import assert from "node:assert/strict";
import { parseRiderPlan } from "../lib/google/rider-plan.ts";
const header = ["Driver ID", "Tên tài xế", "Khu vực", "COT", "Quận lấy", "Phường lấy", "Quận giao", "Phường giao", "Trạng thái tuyến", "BSX RD"];
const row = (id = "12345", area = "KV1") => [id, "Rider test", area, "COT 1", "", "", "Quận 5", "12-14", "Backup", "59A-12345"];
test("rider plan locates headers below summary, normalizes COT, preserves blank fields and source metadata", () => {
  const result = parseRiderPlan([["Summary"], header, row()]);
  assert.equal(result.rows[0].cot, "COT1");
  assert.equal(result.rows[0].pickup_district, null);
  assert.equal(result.rows[0].status, undefined);
  assert.deepEqual(result.rows[0].metadata && (result.rows[0].metadata as Record<string, unknown>)["Trạng thái tuyến"], "Backup");
});
test("all duplicate IDs and invalid areas are skipped, with source row numbers", () => {
  const result = parseRiderPlan([header, row(), row(), row("23456", ""), row("34567")]);
  assert.deepEqual(result.rows.map(r => r.rider_code), ["34567"]);
  assert.equal(result.issues.length, 3);
  assert.equal(result.issues[0].row, 2);
});
test("empty or malformed snapshots never clear the web", () => {
  assert.throws(() => parseRiderPlan([]));
  assert.throws(() => parseRiderPlan([header]));
  assert.throws(() => parseRiderPlan([header, row("bad")]));
});
