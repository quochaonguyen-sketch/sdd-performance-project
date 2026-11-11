import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as eta from "../lib/linehaul/traffic-eta.ts";
import type { LinehaulTrip } from "../lib/linehaul/model.ts";

function fixture() {
  let now = Date.parse("2026-11-02T16:55:00Z"), fail = false, calls = 0;
  const trip = {
    trip_id: "fixture", phase: "en_route", direction: "inbound", source: "active",
    lat: 10.9, lng: 106.6, hub_lat: 10.819469, hub_lng: 106.672067,
    gps_at: new Date(now - 30_000).toISOString(), hub_sta: new Date(now + 10 * 60_000).toISOString(),
    hub_eta: null, hub_ata: null, hub_atd: null, location_error: null,
  } as LinehaulTrip;
  const exports: { getLinehaulEta?: (trip: LinehaulTrip) => Promise<eta.LinehaulEta> } = {};
  const code = ts.transpileModule(readFileSync("lib/linehaul/traffic-server.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;

  class ClockDate extends Date { static now() { return now; } }
  runInNewContext(code, {
    exports,
    Date: ClockDate,
    require(name: string) {
      if (name === "server-only") return {};
      if (name === "./traffic-eta") return eta;
      if (name === "./routing-server") return {
        getRoadRoute: async (selected: LinehaulTrip) => {
          calls++;
          assert.equal(selected, trip);
          if (fail) throw new Error("internal provider detail");
          return { distanceMeters: 12_000, durationSeconds: 930 };
        },
      };
      throw new Error(name);
    },
  });
  return {
    trip, run: () => exports.getLinehaulEta!(trip), calls: () => calls,
    fail: (value: boolean) => { fail = value; },
    advance: (ms: number) => { now += ms; },
  };
}

test("OSRM ETA stays tied to GPS time and preserves the date across Vietnam midnight", async () => {
  const f = fixture();
  const first = await f.run();
  assert.equal(first.source, "OSRM");
  assert.equal(first.arrivalAt, "2026-11-02T17:10:00.000Z");
  assert.equal(first.distanceMeters, 12_000);
  assert.equal(first.staDifferenceMinutes, 5);
  f.advance(60_000);
  assert.equal((await f.run()).arrivalAt, first.arrivalAt);
  f.advance(15 * 60_000);
  await assert.rejects(f.run(), { code: "trip_not_ready" });
  assert.equal(f.calls(), 2);
});

test("a current SPX ETA skips route lookup", async () => {
  const f = fixture();
  f.trip.hub_eta = "2026-11-03T00:05:00+07:00";
  const result = await f.run();
  assert.equal(result.source, "SPX");
  assert.equal(result.arrivalAt, f.trip.hub_eta);
  assert.equal(f.calls(), 0);
});

test("routing errors return a safe message and allow retry", async () => {
  const f = fixture();
  f.fail(true);
  await assert.rejects(f.run(), { code: "route_unavailable", message: "Chưa lấy được tuyến đường để tính ETA. Vui lòng thử lại." });
  f.fail(false);
  assert.equal((await f.run()).source, "OSRM");
  assert.equal(f.calls(), 2);
});
