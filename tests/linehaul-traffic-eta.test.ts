import test from "node:test";
import assert from "node:assert/strict";
import { assertEtaSnapshot, etaUnavailableReason, parseTomTomEta, trafficEtaKey } from "../lib/linehaul/traffic-eta.ts";
import type { LinehaulTrip } from "../lib/linehaul/model.ts";

const now = Date.parse("2026-11-02T08:00:00Z");
const trip = (): LinehaulTrip => ({ trip_id: "trip-1", phase: "en_route", direction: "inbound", source: "active", gps_at: new Date(now - 30_000).toISOString(), lat: 10.9, lng: 106.6, hub_lat: 10.819469, hub_lng: 106.672067, hub_sta: "2026-11-02T15:25:00+07:00", hub_eta: "2026-11-02T15:27:00+07:00", hub_ata: null, hub_atd: null, location_error: null } as LinehaulTrip);
const response = () => ({ routes: [{ summary: { lengthInMeters: 12_000, travelTimeInSeconds: 1800, trafficDelayInSeconds: 600, departureTime: "2026-11-02T15:00:00+07:00", arrivalTime: "2026-11-02T15:30:00+07:00", noTrafficTravelTimeInSeconds: 1200 } }] });

test("traffic ETA preserves provider arrival, delay, source ETA and correct minutes versus STA", () => {
  const t = trip(), eta = parseTomTomEta(response(), t, now);
  assert.equal(eta.arrivalAt, "2026-11-02T15:30:00+07:00"); assert.equal(eta.travelSeconds, 1800);
  assert.equal(eta.trafficDelaySeconds, 600); assert.equal(eta.distanceMeters, 12_000); assert.equal(eta.staDifferenceMinutes, 5);
  assert.equal(eta.spxEtaAt, t.hub_eta); assert.equal(eta.truckDimensionsApplied, false); assert.equal(t.hub_eta, "2026-11-02T15:27:00+07:00");
});
test("arrival crosses Vietnam midnight without being relabeled as the previous work date", () => {
  const body = response(); body.routes[0].summary.departureTime = "2026-11-02T23:50:00+07:00"; body.routes[0].summary.arrivalTime = "2026-11-03T00:20:00+07:00";
  const result = parseTomTomEta(body, trip(), Date.parse(body.routes[0].summary.departureTime));
  assert.equal(new Date(Date.parse(result.arrivalAt) + 7 * 3600000).toISOString().slice(0, 10), "2026-11-03");
});
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
test("malformed routes and inconsistent provider clocks are rejected; unknown delays stay unknown", () => {
  for (const body of [null, {}, { routes: [] }, { routes: [{ summary: { ...response().routes[0].summary, lengthInMeters: -1 } }] }, { routes: [{ summary: { ...response().routes[0].summary, travelTimeInSeconds: NaN } }] }, { routes: [{ summary: { ...response().routes[0].summary, arrivalTime: "not-a-time" } }] }, { routes: [{ summary: { ...response().routes[0].summary, arrivalTime: "2026-11-02T15:40:00+07:00" } }] }]) assert.throws(() => parseTomTomEta(body, trip(), now));
  assert.throws(() => parseTomTomEta(response(), trip(), now + 3 * 60_000));
  const body = response(); body.routes[0].summary.trafficDelayInSeconds = -1;
  assert.equal(parseTomTomEta(body, trip(), now).trafficDelaySeconds, null);
  body.routes[0].summary.trafficDelayInSeconds = 0; assert.equal(parseTomTomEta(body, trip(), now).trafficDelaySeconds, 0);
});
test("GPS, phase or hub milestone changes invalidate a prior prediction", () => {
  for (const change of [{ gps_at: "new" }, { lng: 106.7 }, { phase: "at_hub" }, { hub_ata: "now" }, { hub_sta: "changed" }]) assert.notEqual(trafficEtaKey(trip()), trafficEtaKey({ ...trip(), ...change } as LinehaulTrip));
});
