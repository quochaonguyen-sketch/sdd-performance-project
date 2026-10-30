import test from "node:test";
import assert from "node:assert/strict";
import { compareBacklog, sortBacklogRows, hourlyValue, hourlyChanges, niceBacklogMax, validHistoryDay, vietnamDay, type BacklogHourlyPoint, type BacklogPivotRow } from "../lib/dashboard/backlog-history.ts";

const row = (ward: string, cot1: number, cot2: number, district = "Quận 4", area = "KV1"): BacklogPivotRow => ({ area, district, ward, cot1, cot2, other: 0, orders: cot1+cot2 });
const point = (hour: number, value: number | null): BacklogHourlyPoint => ({ hour, scheduled_for:"", status:value===null?"MISSED":"CAPTURED", is_final:value!==null, snapshot_id:value===null?null:`snapshot-${hour}`, source_started_at:null, source_snapshot_at:null, total_orders:value, areas:value===null?[]:[row("A",value,0)] });

test("comparison priority sorts rising and falling backlogs without changing totals or source order", () => {
  const rows = compareBacklog([row("A",100,0),row("B",100,0),row("C",100,0)],[row("A",140,0),row("B",20,0),row("C",100,0)],"ward","orders");
  assert.deepEqual(sortBacklogRows(rows,"change").map(r=>r.ward),["B","A","C"]);
  assert.deepEqual(sortBacklogRows(rows,"rising").map(r=>r.ward),["A","C","B"]);
  assert.deepEqual(sortBacklogRows(rows,"falling").map(r=>r.ward),["B","C","A"]);
  assert.deepEqual(sortBacklogRows(rows,"area").map(r=>r.ward),["A","B","C"]);
  assert.deepEqual(rows.map(r=>r.ward),["A","B","C"]);
  assert.equal(sortBacklogRows(rows,"change").reduce((sum,r)=>sum+r.delta,0),-40);
});
test("hourly charts preserve real zeros and never treat missing hours as zero", () => {
  assert.equal(hourlyValue(point(10,null)),null);
  assert.equal(hourlyValue(point(10,0)),0);
  assert.equal(hourlyValue(point(10,7),"orders","KV2"),0);
  assert.equal(hourlyValue(point(10,7),"cot2"),0);
  const changes=hourlyChanges([point(9,10),point(10,null),point(11,4),point(12,0),point(13,7)]);
  assert.deepEqual(changes.map(p=>p.delta),[null,null,null,-4,7]);
  assert.equal(changes[4].percent,null);
  assert.equal(hourlyChanges([point(9,10),point(11,4)])[1].delta,null);
  assert.equal(niceBacklogMax([null,0]),5);
  assert.ok(niceBacklogMax([12431])>=12431);
});
test("compares union of wards, distinguishing cleared/new orders and zero baseline", () => {
  const result = compareBacklog([row("A",10,5),row("B",2,0)],[row("A",3,2),row("C",4,1)],"ward","orders");
  assert.deepEqual(result.map(r=>[r.ward,r.before,r.after,r.delta]),[["A",15,5,-10],["B",2,0,-2],["C",0,5,5]]);
  assert.equal(result[2].percent,null);
  assert.deepEqual(compareBacklog([],[],"ward","orders"),[]);
});
test("rolls up by area/district and COT without merging same-name wards across districts", () => {
  const rows = [row("A",2,1),row("A",4,2,"Quận 5"),row("A",7,1,"Quận 7","KV2")];
  assert.equal(compareBacklog(rows,[],"ward","orders").length,3);
  assert.deepEqual(compareBacklog(rows,[],"area","cot1","KV1").map(r=>r.before),[6]);
  assert.equal(compareBacklog(rows,[],"district","orders").length,3);
});
test("validates real calendar dates and uses Vietnam date across UTC midnight", () => {
  assert.equal(validHistoryDay("2026-02-30"),false);
  assert.equal(validHistoryDay("2026-10-26"),true);
  assert.equal(vietnamDay(new Date("2026-10-25T18:00:00Z")),"2026-10-26");
});
