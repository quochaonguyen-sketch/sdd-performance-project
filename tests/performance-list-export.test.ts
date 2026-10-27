import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { performanceListWorkbook } from "../lib/performance/list-export.ts";
import { parsePerformanceFilters } from "../lib/performance/filters.ts";
import type { PerformanceRow } from "../lib/performance/driver-performance.ts";
const row:PerformanceRow={report_date:"2026-10-26",driver_id:"00123",driver_name:"Rider",rider_name:"=SUM(A1:A2)",kv:"KV1",cot:"COT 2",pickup_district:"Quận 5",delivery_district:"Quận 8",delivery_ward:"Phường 1",delivery_assigned:20,delivery_delivered:10,delivery_assigned_cot1:0,delivery_delivered_cot1:0,delivery_assigned_cot2:0,delivery_delivered_cot2:0,pickup_assigned:1,pickup_picked:1,pickup_assigned_cot1:0,pickup_picked_cot1:0,pickup_assigned_cot2:0,pickup_picked_cot2:0,delivery_rate:50,pickup_rate:100};
const filters=parsePerformanceFilters({period:"range",start:"2026-10-23",end:"2026-10-26",kv:"KV1",district:"Quận 8",ward:"Phường 1",cot:"COT 2",q:"Rider",sort:"total",dir:"desc"});
function sheet(rows:PerformanceRow[]){return XLSX.read(XLSX.write(performanceListWorkbook(filters,rows),{type:"buffer",bookType:"xlsx"}),{type:"buffer",cellNF:true}).Sheets.Performance;}
test("exports every supplied rider, selected filters, exact IDs and safe text",()=>{
  const rows=Array.from({length:251},(_,i)=>({...row,driver_id:`00${i}`}));const ws=sheet(rows);
  assert.equal(ws.A258.v,"00250");assert.equal(ws.A259.v,"Tổng cộng");assert.equal(ws.A8.t,"s");
  assert.equal(ws.B8.v,row.rider_name);assert.equal(ws.B8.t,"s");assert.equal(ws.B8.f,undefined);
  assert.equal(ws.B2.v,filters.start);assert.equal(ws.D2.v,filters.end);assert.equal(ws.F2.v,251);
  assert.equal(ws.B3.v,filters.kv);assert.equal(ws.D3.v,filters.district);assert.equal(ws.F3.v,filters.ward);assert.equal(ws.H3.v,filters.cot);assert.equal(ws.B4.v,filters.q);assert.equal(ws.D4.v,filters.sort);
  assert.equal(ws["!autofilter"]?.ref,"A7:W258");
});
test("total sums rider conversions, COT fallback and percentages match the table",()=>{
  const ws=sheet([row,{...row,driver_id:"456"}]);
  assert.equal(ws.T8.f,"ROUNDUP(N8/3,0)");assert.equal(ws.T8.v,1);assert.equal(ws.U8.v,11);
  assert.equal(ws.R8.v,1);assert.equal(ws.S8.v,1);assert.equal(ws.L8.v,10);
  assert.equal(ws.T10.v,2);assert.equal(ws.T10.f,"SUM(T8:T9)");assert.equal(ws.U10.v,22);
  assert.equal(ws.V10.v,20/22);assert.equal(ws.W10.v,2/22);assert.equal(ws.W10.z,"0.0%");
});
test("an empty export has headings and numeric zeros without invalid formulas",()=>{
  const ws=sheet([]);assert.equal(ws.F2.v,0);assert.equal(ws.A8.v,"Tổng cộng");assert.equal(ws.U8.v,0);assert.equal(ws.U8.f,undefined);assert.equal(ws.V8,undefined);
});

test("daily export keeps dates, safe IDs and shifted Excel formulas for each rider/day",()=>{
 const daily=[{...row,report_date:'2026-10-25'},{...row,report_date:'2026-10-26',pickup_picked:4}];
 const wb=performanceListWorkbook(filters,daily,'daily');
 const ws=XLSX.read(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),{type:'buffer',cellNF:true}).Sheets['Theo ngay'];
 assert.equal(ws.A7.v,'Ngày');assert.equal(ws.A8.v,'2026-10-25');assert.equal(ws.A9.v,'2026-10-26');
 assert.equal(ws.B8.v,'00123');assert.equal(ws.C8.f,undefined);assert.equal(ws.C8.t,'s');
 assert.equal(ws.U8.f,'ROUNDUP(O8/3,0)');assert.equal(ws.U9.v,2);assert.equal(ws.V8.f,'I8+U8');
 assert.equal(ws.U10.f,'SUM(U8:U9)');assert.equal(ws.U10.v,3);assert.equal(ws.V10.v,23);
 assert.equal(ws.W10.f,'I10/V10');assert.equal(ws.X10.f,'U10/V10');
 assert.equal(ws['!autofilter']?.ref,'A7:X9');assert.equal(ws.C2.v,filters.start);assert.equal(ws.E2.v,filters.end);
});

test("daily empty export retains headings without inventing zero-production days",()=>{
 const wb=performanceListWorkbook(filters,[],'daily'),ws=wb.Sheets['Theo ngay'];
 assert.equal(ws.A7.v,'Ngày');assert.equal(ws.B8.v,'Tổng cộng');assert.equal(ws.U8.v,0);assert.equal(ws.U8.f,undefined);
});
