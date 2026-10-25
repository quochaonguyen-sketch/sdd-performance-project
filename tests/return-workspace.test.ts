import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_RETURN_FILTERS, filterReturnRows, returnAge, returnCsv, summarizeReturns, type ReturnWorkspaceRow } from "../lib/return-orders/workspace.ts";

const now=Date.parse("2026-10-25T08:00:00Z");
function row(id:string,extra:Partial<ReturnWorkspaceRow>={}):ReturnWorkspaceRow {
  return {shipment_id:id,sls_tracking_number:id,shopee_order_sn:"",order_status:67,seller_area:"Khu vực 3",seller_district:"Quận Bình Tân",seller_ward:"Phường Bình Hưng Hòa",seller_new_ward:"Phường Bình Hưng Hòa",return_zone:"BT_BHHA1_SDD",pickup_point_id:"P1",return_driver_id:"",return_driver_name:"",current_station_name:"Hub",create_time:"2026-01-01T00:00:00Z",receive_time:null,current_station_received_time:"2026-10-24T08:00:00Z",delivering_time:null,...extra};
}
test("one set of rows drives geographic counts and current SPX riders",()=>{
  const data=[row("A"),row("B",{seller_area:"Khu vực 1",order_status:72,return_driver_id:"SPX-1",return_driver_name:"Lâm Tấn Đạt"}),row("C",{seller_area:"Chưa rõ KV"})];
  const summary=summarizeReturns(data,now);
  assert.equal(summary.total,3);assert.equal(summary.waiting,2);assert.equal(summary.returning,1);
  assert.equal(summary.areas.KV3.waiting,1);assert.equal(summary.areas.KV1.returning,1);assert.equal(summary.unknown,1);
  assert.deepEqual(summary.riders,[{id:"SPX-1",name:"Lâm Tấn Đạt",total:1}]);
});
test("combined filters, unaccented search and rider filter cannot expose waiting rider plans",()=>{
  const data=[row("A",{return_driver_id:"SPX-1"}),row("B",{order_status:72,return_driver_id:"SPX-1",return_driver_name:"Lâm Tấn Đạt"}),row("C",{seller_area:"Khu vực 2"})];
  assert.deepEqual(filterReturnRows(data,{...EMPTY_RETURN_FILTERS,area:"KV3",status:"returning",query:"lam tan dat"},now).map(r=>r.shipment_id),["B"]);
  assert.deepEqual(filterReturnRows(data,{...EMPTY_RETURN_FILTERS,rider:"SPX-1"},now).map(r=>r.shipment_id),["B"]);
  assert.equal(filterReturnRows(data,{...EMPTY_RETURN_FILTERS,district:"Quận 1"},now).length,0);
});
test("inventory age is based on hub receipt, with unknown times sorted last",()=>{
  const data=[row("A"),row("B",{current_station_received_time:"2026-10-17T08:00:00Z"}),row("C",{current_station_received_time:null})];
  assert.equal(returnAge(data[0],now),1);assert.equal(returnAge(data[2],now),null);
  assert.deepEqual(filterReturnRows(data,EMPTY_RETURN_FILTERS,now).map(r=>r.shipment_id),["B","A","C"]);
  assert.deepEqual(filterReturnRows(data,{...EMPTY_RETURN_FILTERS,overdue:true},now).map(r=>r.shipment_id),["B"]);
});
test("CSV escapes spreadsheet formulas and includes only actual returning rider identities",()=>{
  const csv=returnCsv([row('=UNTRUSTED',{return_driver_id:"not-returning"}),row('B',{order_status:72,return_driver_id:"SPX-1"})]);
  assert.ok(csv.includes("'=UNTRUSTED"));assert.ok(!csv.includes("not-returning"));assert.ok(csv.includes("SPX-1"));
});
