import test from "node:test";
import assert from "node:assert/strict";
import { summarizeLiveDelivery, summarizeDeliveryBacklog, completionRate, type DeliveryBacklogRow } from "../lib/dashboard/operations-overview.ts";

test("live totals use scoped roster and weighted completion, preserving separate statuses", () => {
  const result = summarizeLiveDelivery([
    {driver_id:"a",total_assigned:100,delivered:80,delivering:12,failed:8,idle_delivery_seconds:3600},
    {driver_id:"b",total_assigned:1,delivered:1,delivering:0,failed:0,idle_delivery_seconds:5000},
    {driver_id:"outside",total_assigned:999,delivered:999,delivering:0,failed:0,idle_delivery_seconds:0},
  ], [{rider_code:"a",kv:"KV1"},{rider_code:"b",kv:"KV5"},{rider_code:"outside",kv:"KV6"}]);
  assert.equal(result.assigned,101);
  assert.equal(result.delivered,81);
  assert.equal(completionRate(result.delivered,result.assigned),81/101*100);
  assert.equal(result.idleRiders,1);
  assert.equal(result.completedRiders,1);
  assert.equal(result.areas.reduce((n,r)=>n+r.assigned,0),result.assigned);
});

test("backlog deduplicates shipments, scopes areas and retains unknown COT", () => {
  const base: DeliveryBacklogRow = {shipment_id:"a",area:"KV1",district:"D",ward:"W",cot_group:"COT1.1",received_time:null};
  const now=Date.parse("2026-10-25T10:00:00Z");
  const result=summarizeDeliveryBacklog([base,base,{...base,shipment_id:"b",cot_group:"2026-10-25 COT 1.2"},{...base,shipment_id:"c",area:"KV5",cot_group:"2026-10-25 COT 2",received_time:"2026-10-23T10:00:00Z"},{...base,shipment_id:"d",cot_group:"UNKNOWN",received_time:"invalid"},{...base,shipment_id:"e",area:"KV6"}],now);
  assert.equal(result.total,4);
  assert.equal(result.cot1,2);
  assert.equal(result.cot2,1);
  assert.equal(result.unknownCot,1);
  assert.equal(result.aged48h,1);
  assert.equal(result.missingReceived,3);
  assert.equal(result.areas.reduce((n,r)=>n+r.orders,0),4);
  assert.equal(result.topWards[0].orders,3);
});

test("no denominator is missing, real zero completion remains zero, anomalies retain actual rate", () => {
  assert.equal(completionRate(0,0),null);
  assert.equal(completionRate(0,10),0);
  assert.equal(completionRate(12,10),120);
  assert.equal(summarizeDeliveryBacklog([],Date.now()).total,0);
});
