import test from "node:test";
import assert from "node:assert/strict";
import { buildPerformanceAnalysis, performanceRate, shiftPerformanceDate } from "../lib/performance/analysis.ts";

const rider = (done: number, assigned: number) => ({ delivery_delivered: done, delivery_assigned: assigned, pickup_assigned: 0, pickup_picked: 0 });

test("weighted totals retain every rider including zero-denominator pickup-only riders", () => {
  const result = buildPerformanceAnalysis({ riders: [rider(90,100), rider(1,1), { ...rider(0,0), pickup_assigned: 10, pickup_picked: 8 }], daily: [], areas: [] }, "2026-10-25", "2026-10-25");
  assert.equal(result.riderCount,3);
  assert.equal(result.withoutDelivery,1);
  assert.equal(result.totals.delivery_delivered,91);
  assert.equal(performanceRate(result.totals.delivery_delivered,result.totals.delivery_assigned),91/101*100);
  assert.equal(performanceRate(result.totals.pickup_picked,result.totals.pickup_assigned),80);
  assert.equal(performanceRate(0,0),null);
});

test("missing days remain missing; real zero completion remains zero", () => {
  const result = buildPerformanceAnalysis({ riders: [], areas: [], daily: [{ date:"2026-10-25",riders:1,...rider(0,10) }] },"2026-10-23","2026-10-25");
  assert.deepEqual(result.daily.slice(0,2),[{date:"2026-10-23",missing:true},{date:"2026-10-24",missing:true}]);
  assert.equal("missing" in result.daily[2],false);
  assert.equal(shiftPerformanceDate("2026-01-01",-1),"2025-12-31");
});

test("histogram has non-overlapping boundaries and preserves values above 100%", () => {
  const result = buildPerformanceAnalysis({ daily:null, areas:null, riders:[0,59,60,69,70,79,80,89,90,100,101].map(n=>rider(n,100)).concat([rider(0,0)]) },"2026-10-25","2026-10-25");
  assert.deepEqual(result.distribution.map(bin=>bin.count),[2,2,2,2,2,1]);
  assert.equal(result.anomalyCount,1);
  assert.equal(result.withoutDelivery,1);
  assert.equal(result.distribution.reduce((s,b)=>s+b.count,0)+result.withoutDelivery,result.riderCount);
});
