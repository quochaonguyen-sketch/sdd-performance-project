import test from "node:test";
import assert from "node:assert/strict";
import { parseHireDate, summarizeRiderHiring } from "../lib/dashboard/rider-hiring.ts";

const header=["Driver ID","Tên tài xế","Khu vực","COT","Quận lấy","Phường lấy","Quận giao","Phường giao","Ngày nhận việc"];
const row=(id:string,area:string,date:string)=>[id,"Rider test",area,"COT1","","","","",date];

test("hire dates use explicit US/ISO formats and reject impossible dates",()=>{
 assert.equal(parseHireDate("10/03/2026"),"2026-10-03");
 assert.equal(parseHireDate("2026-10-03"),"2026-10-03");
 assert.equal(parseHireDate("2/29/2024"),"2024-02-29");
 for(const value of ["02/29/2026","04/31/2026","29/10/2026","2026-02-30","",null])assert.equal(parseHireDate(value),null);
});

test("current MTD and previous MTD reconcile by KV; invalid dates and duplicate IDs are excluded",()=>{
 const summary=summarizeRiderHiring([header,
  row("101","KV1","10/01/2026"),row("102","KV2","10/29/2026"),
  row("103","KV2","09/29/2026"),row("104","KV3","09/30/2026"),
  row("105","KV4","10/30/2026"),row("106","KV5",""),row("107","KV5","02/30/2026"),
  row("108","KV1","10/10/2026"),row("108","KV2","10/10/2026"),row("109","KV6","10/10/2026"),
 ],new Date("2026-10-29T10:00:00Z"));
 assert.equal(summary.current,2);assert.equal(summary.previous,1);
 assert.deepEqual(summary.areas.map(a=>[a.current,a.previous]),[[1,0],[1,1],[0,0],[0,0],[0,0]]);
 assert.equal(summary.current,summary.areas.reduce((n,a)=>n+a.current,0));
 assert.equal(summary.missingDates,1);assert.equal(summary.invalidDates,1);assert.equal(summary.futureDates,1);
 assert.equal(summary.skippedRows,3);assert.equal(summary.validRiders,7);
});

test("Vietnam midnight and short previous month cap the comparison window",()=>{
 const summary=summarizeRiderHiring([header,row("101","KV1","02/28/2026"),row("102","KV1","03/31/2026")],new Date("2026-03-30T17:00:00Z"));
 assert.equal(summary.today,"2026-03-31");assert.equal(summary.previousEnd,"2026-02-28");
 assert.equal(summary.current,1);assert.equal(summary.previous,1);
 const january=summarizeRiderHiring([header,row("101","KV1","12/01/2025")],new Date("2026-01-01T05:00:00Z"));
 assert.equal(january.previousStart,"2025-12-01");assert.equal(january.previousEnd,"2025-12-01");assert.equal(january.current,0);
});

test("no usable dates is distinguishable from a real zero this month",()=>{
 const empty=summarizeRiderHiring([header,row("101","KV1","")],new Date("2026-10-29T10:00:00Z"));
 assert.equal(empty.validDates,0);assert.equal(empty.missingDates,1);
 const zero=summarizeRiderHiring([header,row("101","KV1","08/01/2026")],new Date("2026-10-29T10:00:00Z"));
 assert.equal(zero.validDates,1);assert.equal(zero.current,0);assert.equal(zero.previous,0);
});
