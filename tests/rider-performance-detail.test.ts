import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { buildRiderDaily,readDetailRange,riderPerformanceLookup,detailToday,detailShift,summarizeRiderDaily } from "../lib/performance/rider-detail.ts";
import { riderPerformanceWorkbook } from "../lib/performance/rider-export.ts";
test("detail opens at seven inclusive days and still respects explicit ranges",()=>{
  const to=detailToday();assert.deepEqual(readDetailRange(new URLSearchParams()),{from:detailShift(to,-6),to});
  assert.deepEqual(readDetailRange(new URLSearchParams({from:"2026-10-01",to:"2026-10-26"})),{from:"2026-10-01",to:"2026-10-26"});
});
test("rider switching supports exact driver codes and existing UUID links",()=>{
  assert.deepEqual(riderPerformanceLookup(" 158197 "),{column:"rider_code",value:"158197"});
  const id="12345678-1234-4234-8234-123456789012";assert.deepEqual(riderPerformanceLookup(id),{column:"id",value:id});
  for(const value of ["","id.eq.x,kv.eq.KV6","../123","a".repeat(41)])assert.throws(()=>riderPerformanceLookup(value));
});

test("validates inclusive date ranges including leap days",()=>{
  assert.deepEqual(readDetailRange(new URLSearchParams({from:"2024-02-29",to:"2024-03-01"})),{from:"2024-02-29",to:"2024-03-01"});
  for(const values of ([{from:"2026-02-30",to:"2026-03-01"},{from:"2026-10-26",to:"2026-10-25"},{from:"2026-10-25"}] as Record<string,string>[]))assert.throws(()=>readDetailRange(new URLSearchParams(values)));
});
const source=[{report_date:"2026-10-25",delivery_assigned:20,delivery_delivered:10,pickup_assigned:2,pickup_picked:1},{report_date:"2026-10-26",delivery_assigned:20,delivery_delivered:10,pickup_assigned:2,pickup_picked:1}];
test("stale historical pickup splits do not contradict totals or inflate exported production",()=>{
  const rows=buildRiderDaily([{report_date:"2026-10-24",delivery_assigned:57,delivery_delivered:56,pickup_assigned:0,pickup_picked:0,pickup_assigned_cot2:36,pickup_picked_cot2:36}],"COT 1");
  assert.equal(rows[0].pickup_picked_cot2,0);assert.equal(rows[0].pickup_assigned_cot2,0);
  assert.equal(rows[0].convertedPickup,0);assert.equal(rows[0].total,56);
  const workbook=riderPerformanceWorkbook({rider_code:"158197",full_name:"Test",kv:"KV1",cot:"COT 1"},{from:"2026-10-24",to:"2026-10-24"},rows);
  assert.equal(workbook.Sheets.Performance.O7.v,56);
});
test("daily allocation and totals preserve period rounding and do not invent missing days",()=>{
  const rows=buildRiderDaily(source,"COT 2");
  assert.equal(rows.length,2);assert.equal(rows[0].pickup_picked_cot2,1);assert.equal(rows[0].delivery_delivered_cot2,10);
  assert.equal(rows[0].total,11);
  const summary=summarizeRiderDaily(rows);assert.equal(summary.convertedPickup,1);assert.equal(summary.total,21);assert.equal(summary.activeDays,2);
  assert.equal(summarizeRiderDaily([]).deliveryShare,null);
});
test("Excel includes every day, cached formulas, correct period totals and safe name strings",()=>{
  const rows=buildRiderDaily(source,"COT 2");const range={from:"2026-10-25",to:"2026-10-26"};
  const workbook=riderPerformanceWorkbook({rider_code:"123",full_name:"=SUM(A1:A2)",kv:"KV1",cot:"COT 2"},range,rows);
  const roundtrip=XLSX.read(XLSX.write(workbook,{type:"buffer",bookType:"xlsx"}),{type:"buffer"});const sheet=roundtrip.Sheets.Performance;
  assert.equal(sheet.A7.v,"2026-10-25");assert.equal(sheet.A8.v,"2026-10-26");assert.equal(sheet.A9.v,"Tổng kỳ");
  assert.equal(sheet.N7.v,1);assert.equal(sheet.N8.v,1);assert.equal(sheet.N9.v,1);assert.equal(sheet.O9.v,21);
  assert.equal(sheet.N9.f,"ROUNDUP(H9/3,0)");assert.equal(sheet.D2.t,"s");assert.equal(sheet.D2.f,undefined);
  assert.equal(sheet["!autofilter"]?.ref,"A6:Q8");
});
