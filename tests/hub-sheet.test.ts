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
  assert.deepEqual(data.inboundByDate, { "2026-10-28": 10, "2026-10-29": 10 });
});

test("past inbound requires the same station coverage and one valid count per station", () => {
  const missingInbound = row("2026-10-26", "b");
  missingInbound[3] = "";
  const zero = row("2026-10-28", "a");
  zero[3] = "0";
  const { inboundByDate } = parseHubSheet([header,
    row("2026-10-25", "a"), row("2026-10-25", "a"),
    row("2026-10-26", "a"), missingInbound,
    row("2026-10-27", "a"), row("2026-10-27", "different-station"),
    zero, row("2026-10-28", "b"),
    row("2026-10-29", "a"), row("2026-10-29", "b"),
  ]);
  assert.deepEqual(inboundByDate, {
    "2026-10-25": null, "2026-10-26": null, "2026-10-27": null, "2026-10-28": 10, "2026-10-29": 20,
  });
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

test("Google date serials preserve the local day and fetched time after Sheet formatting changes", () => {
  const values: unknown[] = [...row("2026-10-29"), 46324.5];
  values[2] = 46324;
  const result = parseHubSheet([[...header,"fetched_at"],values]);
  assert.equal(result.date,"2026-10-29");
  assert.equal(result.stations[0].fetchedAt,"2026-10-29 12:00:00");
  assert.equal(result.totals.Picked,10);
  for (const invalid of [-1,Infinity,2958466]) {
    assert.throws(()=>parseHubSheet([[...header,"fetched_at"],values.map((v,i)=>i===2?invalid:v)]), /không hợp lệ/);
  }
});
