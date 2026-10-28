import test from "node:test";
import assert from "node:assert/strict";
import type {LinehaulTrip} from "../lib/linehaul/model.ts";
import {fullyUnloaded,isTripUnloaded,loadStage,stageOrders,linehaulSummary} from "../lib/linehaul/summary.ts";
const day="2026-10-28";
const trip={trip_id:"1",lt_code:"LT1",trip_day:day,direction:"inbound",phase:"unloaded",orders:71,load_total:12,expected_unload:12,unloaded_units:12,hub_ata:"2026-10-28T08:00:00+07:00",hub_unloaded_at:"2026-10-28T08:20:00+07:00",hub_sta:"2026-10-28T08:00:00+07:00"} as LinehaulTrip;
test("order total is confirmed only after full hub unloading; arrival and TO counts are distinct",()=>{
 assert.equal(fullyUnloaded(trip),true);assert.equal(stageOrders(trip,"unloaded"),71);
 assert.equal(loadStage({...trip,phase:"at_hub",hub_unloaded_at:null,unloaded_units:0}),"at_hub");
 assert.equal(loadStage({...trip,phase:"at_hub",hub_unloaded_at:null,unloaded_units:6}),"at_hub");
 assert.equal(loadStage({...trip,phase:"unloading",unloaded_units:6}),"unloading");
 assert.equal(stageOrders({...trip,phase:"unloaded",unloaded_units:6},"unloaded"),null);
 assert.equal(stageOrders({...trip,direction:"stopover"},"unloaded"),71);
 assert.equal(loadStage({...trip,direction:"outbound"}),null);
 assert.equal(fullyUnloaded({...trip,hub_unloaded_at:null}),false);
});
test("totals preserve missing order reports, zero, stage boundaries and reporting day",()=>{
 const result=linehaulSummary([trip,{...trip,trip_id:"2",phase:"en_route",hub_ata:null,orders:648,direction:"stopover"},
  {...trip,trip_id:"3",phase:"waiting",hub_ata:null,orders:null},{...trip,trip_id:"4",phase:"waiting",hub_ata:null,orders:0},
  {...trip,trip_id:"5",trip_day:"2026-10-27",orders:9999}],day);
 assert.equal(result.groups.unloaded.knownOrders,71);assert.equal(result.groups.incoming.knownOrders,648);
 assert.equal(result.groups.loading.trips.length,2);assert.equal(result.groups.loading.knownOrders,0);assert.equal(result.groups.loading.missing,1);
 assert.equal(result.hourly[8].missing.loading,1);assert.equal(result.unplaced.unloaded,0);
 assert.equal(result.hourly[8].orders.unloaded,71);
});
test("hour buckets use Vietnamese actual unloading time and planned arrival, never ETA",()=>{
 const result=linehaulSummary([{...trip,hub_unloaded_at:"2026-10-27T18:20:00Z"},
  {...trip,trip_id:"2",phase:"en_route",hub_ata:null,hub_sta:"2026-10-28T04:00:00Z",hub_eta:"2026-10-28T05:00:00Z"}],day);
 assert.equal(result.hourly[1].orders.unloaded,71);assert.equal(result.hourly[11].orders.incoming,71);assert.equal(result.hourly[12].orders.incoming,0);
 assert.equal(result.unplaced.unloaded,0);
 assert.equal(linehaulSummary([{...trip,hub_unloaded_at:"2026-10-27T12:00:00+07:00"}],day).groups.unloaded.trips.length,0,"Previous-day unloading is not today's throughput");
});
test("dashboard unloaded trips without scan units contribute orders to unloaded throughput",()=>{
 const dashTrip={...trip,trip_id:"dash1",source:"dashboard",phase:"unloaded",expected_unload:null,unloaded_units:null,hub_unloaded_at:"2026-10-28T10:00:00+07:00",orders:500} as LinehaulTrip;
 const res=linehaulSummary([dashTrip],day);
 assert.equal(res.groups.unloaded.knownOrders,500);
 assert.equal(res.hourly[10].orders.unloaded,500);
});
test("dashboard Arrived stays waiting to unload regardless of scan totals",()=>{
 const oldDashTrip={...trip,trip_id:"dash2",source:"dashboard",phase:"at_hub",hub_ata:"2026-10-28T11:30:00+07:00",hub_unloaded_at:null,orders:1200} as LinehaulTrip;
 assert.equal(loadStage(oldDashTrip),"at_hub");
 assert.equal(isTripUnloaded(oldDashTrip),false);
 assert.equal(fullyUnloaded(oldDashTrip),false);
 assert.equal(stageOrders(oldDashTrip,"at_hub"),1200);
 const res=linehaulSummary([oldDashTrip],day);
 assert.equal(res.groups.unloaded.knownOrders,0);
 assert.equal(res.groups.at_hub.knownOrders,1200);
 assert.equal(res.hourly[11].orders.at_hub,1200);
});
test("active trip currently in unloading phase remains unloading even if all units are scanned",()=>{
 const activeUnloadingTrip={...trip,trip_id:"active1",source:"active",phase:"unloading",orders:71,load_total:12,expected_unload:12,unloaded_units:12,hub_unseal_at:"2026-10-28T07:28:00+07:00"} as LinehaulTrip;
 assert.equal(loadStage(activeUnloadingTrip),"unloading");
 const res=linehaulSummary([activeUnloadingTrip],day);
 assert.equal(res.groups.unloading.knownOrders,71);
 assert.equal(res.groups.unloaded.knownOrders,0);
 assert.equal(res.hourly[7].orders.unloading,71);
});

test("completion by absence contributes orders without inventing an unload hour",()=>{
 const row={...trip,source:"dashboard",phase:"unloaded",hub_unloaded_at:null,unload_confirmation:"active_list_absence",expected_unload:12,unloaded_units:0} as LinehaulTrip;
 const result=linehaulSummary([row],day);
 assert.equal(loadStage(row),"unloaded");assert.equal(fullyUnloaded(row),false);
 assert.equal(result.groups.unloaded.knownOrders,71);assert.equal(result.groups.at_hub.knownOrders,0);
 assert.equal(result.unplaced.unloaded,1);assert.ok(result.hourly.every(h=>h.orders.unloaded===0));
});
