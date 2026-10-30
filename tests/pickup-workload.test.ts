import test from "node:test";
import assert from "node:assert/strict";
import { pendingPickup, pickupWorkload } from "../lib/pickup/workload.ts";
import type { PickupRider } from "../lib/pickup/realtime.ts";

const rider = (id: string, assigned: number | null, picked = 0, onhold = 0): PickupRider => ({ id, name: id, area: "KV1", cot: "COT1", routes: [], metrics: assigned === null ? null : { assigned, picked, onhold }, groups: [], assignments: [], routeSource: "none" });
test("focus keeps missing data distinct from real zero and excludes finished riders", () => {
  const rows = [rider("missing", null), rider("finished", 10, 10), rider("pending", 10, 2, 3), rider("held", 5, 0, 5)];
  assert.equal(pendingPickup(rows[2].metrics!), 5);
  assert.deepEqual(pickupWorkload(rows, "pending", "assigned").map(r => r.id), ["pending"]);
  assert.deepEqual(pickupWorkload(rows, "onhold", "onhold").map(r => r.id), ["held", "pending"]);
  assert.equal(pickupWorkload(rows, "all", "assigned").length, 4);
  assert.equal(rows[0].id, "missing");
});
test("priority sorting is deterministic, zero denominators and missing data sort last", () => {
  const rows = [rider("missing", null), rider("empty", 0), rider("high", 100, 80), rider("low", 10, 1), rider("anomaly", 5, 6)];
  assert.deepEqual(pickupWorkload(rows, "all", "rate").map(r => r.id), ["low", "high", "anomaly", "empty", "missing"]);
  assert.equal(pendingPickup({ assigned: 5, picked: 6, onhold: 1 }), 0);
  assert.deepEqual(pickupWorkload(rows, "all", "pending").slice(0, 2).map(r => r.id), ["high", "low"]);
});
