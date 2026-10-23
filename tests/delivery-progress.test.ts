import test from "node:test";
import assert from "node:assert/strict";
import { summarizeDeliveryProgress } from "../lib/dashboard/delivery-progress.ts";

test("area progress uses total delivered over total assigned instead of a zero placeholder", () => {
  assert.deepEqual(summarizeDeliveryProgress([{ total_assigned: 100, delivered: 76 }]),
    { totalAssigned: 100, delivered: 76, rate: 76, avgProgress: 76 });
  const result = summarizeDeliveryProgress([{ total_assigned: 20, delivered: 10 }, { total_assigned: 80, delivered: 0 }]);
  assert.equal(result.rate, 10, "progress must be weighted by assigned orders, not averaged per rider");
  assert.equal(result.totalAssigned, 100);
  assert.equal(result.delivered, 10);
});

test("empty, unassigned and fully completed areas produce valid percentages", () => {
  for (const riders of [[], [{ total_assigned: 0, delivered: 0 }]]) assert.equal(summarizeDeliveryProgress(riders).rate, 0);
  assert.equal(summarizeDeliveryProgress([{ total_assigned: 42, delivered: 42 }]).rate, 100);
});
