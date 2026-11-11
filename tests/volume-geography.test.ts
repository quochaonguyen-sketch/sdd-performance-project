import test from "node:test";
import assert from "node:assert/strict";
import { buildVolumeGeography, volumeDates, volumeTrail } from "../lib/dashboard/volume-geography.ts";

const dates = ["2026-11-01", "2026-11-02", "2026-11-03"];

test("daily geography keeps same-name wards separate across districts and areas", () => {
  const row = { report_date: dates[0], area: "KV1", district: "Quận A", old_ward: "Phường 1", total_orders: 10 };
  const root = buildVolumeGeography([
    row,
    { ...row, report_date: dates[1], total_orders: 0 },
    { ...row, total_orders: 4 },
    { ...row, district: "Quận B", total_orders: 8 },
    { ...row, area: "KV2", total_orders: 2 },
    { ...row, area: "KV6", total_orders: 99 },
    { ...row, report_date: "2026-10-31", total_orders: 99 },
  ], "delivery", dates);

  assert.equal(root.total, 24);
  assert.deepEqual([...root.children.keys()], ["KV1", "KV2"]);
  const trail = volumeTrail(root, ["KV1", "Quận A", "Phường 1"]);
  assert.deepEqual(trail.map(node => node.total), [24, 22, 14, 14]);
  assert.equal(trail[3].days.get(dates[1]), 0);
  assert.equal(trail[3].days.get(dates[2]), undefined);
  assert.equal(volumeTrail(root, ["KV1", "Quận B", "Phường 1"]).at(-1)?.total, 8);
  assert.equal(volumeTrail(root, ["KV2", "Quận B"]).at(-1)?.label, "KV2");
});

test("Pickup uses new wards and includes unresolved area and missing geography", () => {
  const row = { report_date: dates[0], area: "UNRESOLVED", district: null, old_ward: "Phường cũ", new_ward: "Phường mới", total_orders: null };
  const pickup = buildVolumeGeography([row], "pickup", dates);
  const trail = volumeTrail(pickup, ["Chưa rõ khu vực", "Chưa xác định quận/huyện", "Phường mới"]);
  assert.equal(trail.length, 4);
  assert.equal(trail.at(-1)?.total, 1);
  assert.equal(buildVolumeGeography([row], "delivery", dates).total, 0);
});

test("Volume period includes both ends and rejects invalid, future, or overlong ranges", () => {
  assert.deepEqual(volumeDates({ start: dates[0], end: dates[2] }, "2026-11-11"), dates);
  assert.equal(volumeDates({ start: "2026-10-12", end: "2026-11-11" }, "2026-11-11").length, 31);
  for (const [start, end] of [["2026-10-11", "2026-11-11"], ["2026-11-03", "2026-11-01"], ["2026-11-01", "2026-11-12"], ["2026-02-30", "2026-03-04"], ["", "2026-11-01"]]) {
    assert.deepEqual(volumeDates({ start, end }, "2026-11-11"), []);
  }
});
