import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyReport, type ReportHub } from "../lib/dashboard/daily-report.ts";
import { summarizeLiveDelivery, summarizeDeliveryBacklog, type OperationsOverview } from "../lib/dashboard/operations-overview.ts";
import type { LinehaulData, LinehaulTrip } from "../lib/linehaul/model.ts";
import type { OHData } from "../lib/onhold/model.ts";
const day="2026-10-29",stamp=day+"T08:00:00Z";
const operations:OperationsOverview={live:{workDate:day,snapshotAt:stamp,error:null,data:summarizeLiveDelivery([{driver_id:"1",total_assigned:100,delivered:70,delivering:20,failed:10,idle_delivery_seconds:0}],[{rider_code:"1",kv:"KV1",cot:"COT 1"}])},backlog:{snapshotAt:stamp,error:null,data:summarizeDeliveryBacklog([{shipment_id:"s1",area:"KV1",district:"Quận 1",ward:"W",cot_group:"COT2",received_time:null}],Date.parse(stamp))}};
const hub={date:day,stations:[],totals:{lm_hub_inbounded_order_qty_eod:500,lm_hub_total_driver_qty_eod:1055},fc:{data:{rows:[{date:day,mp:300,wh:100,total:400}],months:[],checkedAt:stamp},error:null},roster:{data:{date:day,today:day,daily:{actual_people:57,actual_fte:31,actual_os:14,actual_bpo:12},active:{actual_people:7,actual_fte:4,actual_os:2,actual_bpo:1},fetchedAt:stamp},error:null}} as unknown as ReportHub;
const lh:LinehaulData={day,snapshotAt:stamp,canRefresh:false,trips:[{trip_id:"t",trip_day:day,direction:"inbound",phase:"unloaded",hub_unloaded_at:stamp,expected_unload:null,orders:150} as LinehaulTrip]};
const oh:OHData={reports:[{report_date:day,fetched_at:stamp,total_orders:9,input_count:9,excluded_count:0}],cells:[]};
test("daily report follows formulas and uses today's OH report rather than live failed",()=>{
 const r=buildDailyReport(day,hub,operations,lh,oh);
 assert.deepEqual(r.metrics.map(m=>m.actual),[150,350,500,100,10,9,1]);
 assert.equal(r.metrics[0].rate,150);assert.equal(r.metrics[2].rate,125);
 assert.equal(r.staff.find(s=>s.label==="Tổng HC")?.value,1102);
 assert.deepEqual(r.staff.slice(0,3).map(s=>s.value),[21,12,14]);
 assert.equal(r.districts[0].cot2,1);
 assert.equal(r.staff.find(s=>s.label==="COT 1")?.value,1);
});
test("daily HC is available without an active shift, but never falls back to another day",()=>{
 const roster=hub.roster!.data!;
 const noActive=buildDailyReport(day,{...hub,roster:{data:{...roster,active:null},error:null}},operations,lh,oh);
 assert.equal(noActive.staff[0].value,21);
 const stale=buildDailyReport(day,{...hub,roster:{data:{...roster,date:"2026-10-28"},error:null}},operations,lh,oh);
 assert.equal(stale.staff[0].value,null);
 assert.equal(stale.staff.find(s=>s.label==="Tổng HC")?.value,null);
});
test("old snapshots, missing OH and negative MP are unavailable rather than invented zero",()=>{
 const r=buildDailyReport("2026-10-30",hub,operations,lh,oh);
 assert.ok(r.metrics.every(m=>m.actual===null));
 const negative=buildDailyReport(day,{...hub,totals:{lm_hub_inbounded_order_qty_eod:50}},operations,lh,oh);
 assert.equal(negative.metrics[1].actual,null);assert.ok(negative.issues.some(s=>s.includes("lớn hơn")));
 const missingOh=buildDailyReport(day,hub,operations,lh,null);
 assert.equal(missingOh.metrics[4].actual,null);
});

test("FTE excludes ten supervisors once, preserves OS/BPO and never becomes negative",()=>{
 const roster=hub.roster!.data!;
 for(const [raw,expected] of [[31,21],[10,0],[8,0],[0,0]]){
  const adjusted={...hub,roster:{data:{...roster,daily:{...roster.daily,actual_people:raw+26,actual_fte:raw}},error:null}};
  const report=buildDailyReport(day,adjusted,operations,lh,oh);
  assert.deepEqual(report.staff.slice(0,3).map(s=>s.value),[expected,12,14]);
  assert.equal(report.staff.find(s=>s.label==="Tổng HC")?.value,expected+26+1055);
 }
 const missing=buildDailyReport(day,{...hub,roster:{data:{...roster,daily:{...roster.daily,actual_fte:null}},error:null}},operations,lh,oh);
 assert.equal(missing.staff[0].value,null);
 assert.equal(missing.staff.find(s=>s.label==="Tổng HC")?.value,null);
});

test("report Rider and total HC use today's Hub Total Driver, never Assigned or active rider counts",()=>{
 const report=buildDailyReport(day,hub,operations,lh,oh);
 assert.equal(report.staff.find(s=>s.label==="Rider")?.value,1055);
 assert.equal(report.staff.find(s=>s.label==="Tổng HC")?.value,1102);
 const withoutLive=buildDailyReport(day,hub,null,lh,oh);
 assert.equal(withoutLive.staff.find(s=>s.label==="Rider")?.value,1055);
 assert.equal(withoutLive.staff.find(s=>s.label==="Tổng HC")?.value,1102);
 const zero=buildDailyReport(day,{...hub,totals:{...hub.totals,lm_hub_total_driver_qty_eod:0}},operations,lh,oh);
 assert.equal(zero.staff.find(s=>s.label==="Rider")?.value,0);
 for(const source of [null,{...hub,date:"2026-10-28"},{...hub,totals:{...hub.totals,lm_hub_total_driver_qty_eod:null}}]){
  const missing=buildDailyReport(day,source,operations,lh,oh);
  assert.equal(missing.staff.find(s=>s.label==="Rider")?.value,null);
  assert.equal(missing.staff.find(s=>s.label==="Tổng HC")?.value,null);
 }
});

test("report outbound includes riders previously excluded by registry/KV matching",()=>{
 const live=summarizeLiveDelivery([
  {driver_id:"1",total_assigned:100,delivered:70,delivering:20,failed:10,idle_delivery_seconds:0},
  {driver_id:"unregistered",total_assigned:371,delivered:64,delivering:287,failed:20,idle_delivery_seconds:0},
 ],[{rider_code:"1",kv:"KV1"}]);
 const report=buildDailyReport(day,hub,{...operations,live:{...operations.live,data:live}},lh,oh);
 assert.equal(report.metrics.find(m=>m.label==="Outbound Volume")?.actual,471);
 assert.equal(report.staff.find(s=>s.label==="Rider")?.value,1055);
});
