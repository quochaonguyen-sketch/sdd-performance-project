import test from "node:test";
import assert from "node:assert/strict";
import { assertEtaSnapshot, baselineEta, etaUnavailableReason, linehaulEtaKey } from "../lib/linehaul/traffic-eta.ts";
import type { LinehaulTrip } from "../lib/linehaul/model.ts";

const now = Date.parse("2026-11-02T08:00:00Z");
const trip = (): LinehaulTrip => ({ trip_id: "trip-1", phase: "en_route", direction: "inbound", source: "active", gps_at: new Date(now - 30_000).toISOString(), lat: 10.9, lng: 106.6, hub_lat: 10.819469, hub_lng: 106.672067, hub_sta: "2026-11-02T15:25:00+07:00", hub_eta: "2026-11-02T15:27:00+07:00", hub_ata: null, hub_atd: null, location_error: null } as LinehaulTrip);
test("only outbound-free en-route trips with valid fresh GPS and no arrival milestones qualify", () => {
  assert.equal(etaUnavailableReason(trip(), now), null);
  for (const change of [{ phase: "waiting" }, { phase: "at_hub" }, { phase: "departed" }, { direction: "outbound" }, { hub_ata: "2026-11-02T07:59:00Z" }, { source: "dashboard" }, { lat: null }, { hub_lng: null }, { lat: 91 }, { gps_at: null }, { gps_at: new Date(now - 16 * 60_000).toISOString() }, { gps_at: new Date(now + 61_000).toISOString() }, { location_error: "source unavailable" }]) {
    assert.ok(etaUnavailableReason({ ...trip(), ...change } as LinehaulTrip, now));
  }
});
test("missing, stale and future snapshots never support live predictions", () => {
  assert.doesNotThrow(() => assertEtaSnapshot(new Date(now - 60_000).toISOString(), now));
  for (const value of [null, "invalid", new Date(now - 11 * 60_000).toISOString(), new Date(now + 61_000).toISOString()]) assert.throws(() => assertEtaSnapshot(value, now));
});
test("GPS, phase or hub milestone changes invalidate a prior prediction", () => {
  for (const change of [{ gps_at: "new" }, { lng: 106.7 }, { phase: "at_hub" }, { hub_ata: "now" }, { hub_sta: "changed" }]) assert.notEqual(linehaulEtaKey(trip()), linehaulEtaKey({ ...trip(), ...change } as LinehaulTrip));
});

test("table ETA uses future SPX ETA or an OSRM duration anchored to the GPS fix", () => {
  assert.deepEqual(baselineEta(trip(), now, 600), { arrivalAt: trip().hub_eta, source: "SPX" });
  const withoutSpx = { ...trip(), hub_eta: null };
  const estimate = baselineEta(withoutSpx, now, 600);
  assert.equal(estimate?.source, "OSRM");
  assert.equal(estimate?.arrivalAt, new Date(now + 570_000).toISOString());
  assert.deepEqual(baselineEta(withoutSpx, now + 120_000, 600), estimate);
  assert.equal(baselineEta(withoutSpx, now, 20), null);
  assert.equal(baselineEta(withoutSpx, now, Infinity), null);
  assert.deepEqual(baselineEta({ ...trip(), hub_eta: new Date(now - 1000).toISOString() }, now, 600), estimate);
});

test("unavailable trips do not display even a supplied future ETA", () => {
  for (const change of [{ gps_at: null }, { gps_at: new Date(now - 16 * 60_000).toISOString() }, { direction: "outbound" }, { phase: "waiting" }, { hub_ata: new Date(now).toISOString() }]) {
    assert.equal(baselineEta({ ...trip(), ...change } as LinehaulTrip, now, 600), null);
  }
});
