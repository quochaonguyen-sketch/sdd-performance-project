import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { TtlCache } from "../lib/cache/ttl-cache.ts";
import * as eta from "../lib/linehaul/traffic-eta.ts";
import type { LinehaulTrip } from "../lib/linehaul/model.ts";

function fixture() {
  let now = Date.now(), configured = true, fail = false, calls = 0;
  const t = { trip_id: "PRIVATE_TRIP", driver_name: "PRIVATE_DRIVER", plate_number: "PRIVATE_PLATE", phase: "en_route", direction: "inbound", source: "active", lat: 10.9, lng: 106.6, hub_lat: 10.819469, hub_lng: 106.672067, gps_at: new Date(now - 30_000).toISOString(), hub_ata: null, hub_atd: null, location_error: null } as LinehaulTrip;
  const exports: { getTrafficEta?: (trip: LinehaulTrip) => Promise<eta.TrafficEta> } = {};
  const code = ts.transpileModule(readFileSync("lib/linehaul/traffic-server.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  class ClockDate extends Date { static now() { return now; } }
  runInNewContext(code, { exports, URL, URLSearchParams, AbortSignal, Date: ClockDate,
    process: { env: { get TOMTOM_API_KEY() { return configured ? "test-server-key" : ""; } } },
    fetch: async (input: URL) => {
      calls++; const url = new URL(String(input));
      assert.equal(url.origin, "https://api.tomtom.com"); assert.equal(url.searchParams.get("key"), "test-server-key");
      assert.equal(url.searchParams.get("travelMode"), "truck"); assert.equal(url.searchParams.get("traffic"), "true"); assert.equal(url.searchParams.get("departAt"), "now");
      assert.ok(!url.href.includes("PRIVATE_")); assert.equal(url.searchParams.has("vehicleWeight"), false);
      if (fail) throw Error("upstream URL contains test-server-key");
      return Response.json({ routes: [{ summary: { lengthInMeters: 12_000, travelTimeInSeconds: 1800, departureTime: new Date(now).toISOString(), arrivalTime: new Date(now + 1800_000).toISOString(), trafficDelayInSeconds: 300 } }] });
    }, require(name: string) {
      if (name === "server-only") return {};
      if (name === "@/lib/cache/ttl-cache") return { TtlCache };
      if (name === "./traffic-eta") return eta;
      throw Error(name);
    },
  });
  return { t, run: () => exports.getTrafficEta!(t), calls: () => calls, noKey: () => { configured = false; }, fail: (value: boolean) => { fail = value; }, advance: () => { now += 1000; } };
}
test("traffic requests use truck/current traffic and only coordinates; cache never slides the arrival clock", async () => {
  const f = fixture(), [first, same] = await Promise.all([f.run(), f.run()]);
  assert.equal(f.calls(), 1); assert.equal(first.arrivalAt, same.arrivalAt);
  f.advance(); assert.equal((await f.run()).arrivalAt, first.arrivalAt); assert.equal(f.calls(), 1);
  f.t.gps_at = new Date().toISOString(); await f.run(); assert.equal(f.calls(), 2);
});
test("no provider call without key or fresh eligible GPS, even when older cached result exists", async () => {
  const f = fixture(); f.noKey(); await assert.rejects(f.run(), /Chưa kết nối/); assert.equal(f.calls(), 0);
  const cached = fixture(); await cached.run(); cached.t.phase = "at_hub"; await assert.rejects(cached.run()); assert.equal(cached.calls(), 1);
  const stale = fixture(); stale.t.gps_at = "2000-01-01T00:00:00Z"; await assert.rejects(stale.run()); assert.equal(stale.calls(), 0);
});
test("provider failures are sanitized and retryable without inventing an OSRM or SPX fallback ETA", async () => {
  const f = fixture(); f.fail(true);
  await assert.rejects(f.run(), error => error instanceof Error && !error.message.includes("test-server-key") && error.message.includes("Chưa có ETA"));
  f.fail(false); assert.ok((await f.run()).arrivalAt); assert.equal(f.calls(), 2);
});
