import test from "node:test";
import assert from "node:assert/strict";
import { performanceConversion } from "../lib/performance/conversion.ts";

test("Pick rounds up only when division by three has a remainder", () => {
  for (const [picked,converted] of [[0,0],[1,1],[2,1],[3,1],[4,2],[100,34]]) {
    const result=performanceConversion(20,picked);
    assert.equal(result.convertedPickup,converted);
    assert.equal(result.total,20+converted);
    assert.equal(result.deliveryShare!+result.pickupShare!,100);
  }
});
test("shares use converted pickup and handle an empty or single-sided total", () => {
  assert.deepEqual(performanceConversion(0,0),{convertedPickup:0,total:0,deliveryShare:null,pickupShare:null});
  assert.equal(performanceConversion(20,4).deliveryShare,20/22*100);
  assert.equal(performanceConversion(0,4).pickupShare,100);
  assert.equal(performanceConversion(20,0).deliveryShare,100);
});
