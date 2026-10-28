import test from "node:test";
import assert from "node:assert/strict";
import type {LinehaulTrip} from "../lib/linehaul/model.ts";
import {fullyUnloaded,loadStage,stageOrders,linehaulSummary} from "../lib/linehaul/summary.ts";
const day="2026-10-28";
const trip={trip_id:"1",lt_code:"LT1",trip_day:day,direction:"inbound",phase:"at_hub",orders:71,load_total:12,expected_unload:12,unloaded_units:12,hub_ata:"2026-10-28T08:00:00+07:00",hub_unloaded_at:null,hub_sta:"2026-10-28T08:00:00+07:00"} as LinehaulTrip;
test("order total is confirmed only after full hub unloading; arrival and TO counts are distinct",()=>{
 assert.equal(fullyUnloaded(trip),true);assert.equal(stageOrders(trip,"unloaded"),71);
 assert.equal(loadStage({...trip,unloaded_units:0}),"at_hub");
 assert.equal(loadStage({...trip,unloaded_units:6}),"at_hub");
 assert.equal(stageOrders({...trip,phase:"unloaded",unloaded_units:6},"unloaded"),null);
 assert.equal(stageOrders({...trip,direction:"stopover"},"unloaded"),null);
 assert.equal(loadStage({...trip,direction:"outbound"}),null);
 assert.equal(fullyUnloaded({...trip,hub_ata:null}),false);
});
test("totals preserve missing order reports, zero, stage boundaries and reporting day",()=>{
 const result=linehaulSummary([trip,{...trip,trip_id:"2",phase:"en_route",hub_ata:null,orders:648,direction:"stopover"},
  {...trip,trip_id:"3",phase:"waiting",hub_ata:null,orders:null},{...trip,trip_id:"4",phase:"waiting",hub_ata:null,orders:0},
  {...trip,trip_id:"5",trip_day:"2026-10-27",orders:9999}],day);
 assert.equal(result.groups.unloaded.knownOrders,71);assert.equal(result.groups.incoming.knownOrders,648);
 assert.equal(result.groups.loading.trips.length,2);assert.equal(result.groups.loading.knownOrders,0);assert.equal(result.groups.loading.missing,1);
 assert.equal(result.hourly[8].missing.loading,1);assert.equal(result.unplaced.unloaded,1);
 assert.equal(result.hourly[8].orders.unloaded,0,"Arrival time must not stand in for unloading time");
});
test("hour buckets use Vietnamese actual unloading time and planned arrival, never ETA",()=>{
 const result=linehaulSummary([{...trip,hub_unloaded_at:"2026-10-27T18:20:00Z"},
  {...trip,trip_id:"2",phase:"en_route",hub_ata:null,hub_sta:"2026-10-28T04:00:00Z",hub_eta:"2026-10-28T05:00:00Z"}],day);
 assert.equal(result.hourly[1].orders.unloaded,71);assert.equal(result.hourly[11].orders.incoming,71);assert.equal(result.hourly[12].orders.incoming,0);
 assert.equal(result.unplaced.unloaded,0);
 assert.equal(linehaulSummary([{...trip,hub_unloaded_at:"2026-10-27T12:00:00+07:00"}],day).groups.unloaded.trips.length,0,"Previous-day unloading is not today's throughput");
});
