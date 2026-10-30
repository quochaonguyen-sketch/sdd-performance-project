import test from "node:test";
import assert from "node:assert/strict";
import { buildDirectoryAnalysis } from "../lib/riders/directory-analysis.ts";

const rider = (extra = {}) => ({ kv: "KV1", status: "active", cot: "COT 1", zone_id: null, delivery_district: "Gò Vấp", current_shift: null, ...extra });

test("directory analysis reconciles the entire roster by area, status, COT and district", () => {
  const rows = [rider(), rider({ kv: "Khu vực 1", cot: "COT 1.2", status: "inactive" }), rider({ kv: "KV2", cot: "COT2", current_shift: "AM" }), rider({ kv: "KV2", cot: null, delivery_district: null }), rider({ kv: "KV6" })];
  const result = buildDirectoryAnalysis(rows);
  assert.equal(result.reduce((n, a) => n + a.total, 0), 4);
  assert.deepEqual([result[0].total, result[0].active, result[0].inactive, result[0].cots.cot1], [2, 1, 1, 2]);
  assert.deepEqual([result[1].onShift, result[1].unassigned, result[1].cots.cot2, result[1].cots.other], [1, 1, 1, 1]);
  for (const area of result) {
    assert.equal(area.total, area.active + area.inactive);
    assert.equal(area.total, area.cots.cot1 + area.cots.cot2 + area.cots.other);
    assert.equal(area.total, area.districts.reduce((n, d) => n + d.total, 0));
  }
});

test("counts include riders beyond the first page and retain empty areas", () => {
  const result = buildDirectoryAnalysis(Array.from({ length: 45 }, () => rider()));
  assert.equal(result.length, 5);
  assert.equal(result[0].total, 45);
  assert.equal(result[0].districts[0].total, 45);
  assert.equal(result[4].total, 0);
  assert.deepEqual(result[4].districts, []);
});

test("missing geography is distinct from a rider assigned only a zone", () => {
  const result = buildDirectoryAnalysis([rider({ delivery_district: "   ", cot: "COT 1.1" }), rider({ delivery_district: null, zone_id: "zone-1", cot: "new format", status: null })]);
  assert.equal(result[0].unassigned, 1);
  assert.equal(result[0].active, 2);
  assert.equal(result[0].districts[0].name, "Chưa có quận giao");
  assert.equal(result[0].cots.other, 1);
  assert.equal(buildDirectoryAnalysis([]).reduce((n, a) => n + a.total, 0), 0);
});
