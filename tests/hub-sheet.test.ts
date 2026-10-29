import test from "node:test";
import assert from "node:assert/strict";
import { HUB_METRICS, parseHubSheet } from "../lib/dashboard/hub-sheet.ts";
const header = ["station_id", "station_name", "snapshot_date", ...HUB_METRICS.map(m => m[0])];
const row = (day: string, id = "4232") => [id, "SDD Hub", day, ...HUB_METRICS.map(() => "10")];
test("only latest day is totaled; different metrics remain separate", () => {
  const data = parseHubSheet([header, row("2026-10-28"), row("2026-10-29")]);
  assert.equal(data.stations.length, 1);
  assert.equal(data.totals.Picked, 10);
  assert.equal(data.totals.lm_hub_total_driver_qty_eod, 10);
});
test("blank is unavailable, zero is valid, duplicates and invalid counts are rejected", () => {
  const r = row("2026-10-29"); r[3] = ""; r[4] = "0";
  const data = parseHubSheet([header, r]);
  assert.equal(data.totals[HUB_METRICS[0][0]], null);
  assert.equal(data.totals.Picked, 0);
  assert.throws(() => parseHubSheet([header, r, r]), /Trùng/);
  r[3] = "-1";
  assert.throws(() => parseHubSheet([header, r]), /không hợp lệ/);
  assert.throws(() => parseHubSheet([]));
});
