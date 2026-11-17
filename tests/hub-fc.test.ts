import test from "node:test";
import assert from "node:assert/strict";
import { compareHubInbound, parseHubFc } from "../lib/dashboard/hub-fc.ts";
const header=["Date","Day","HCM MP","HCM WH","HCM Total"];
test("FC reads formatted dates and comma counts after blank/title rows; retains future dates",()=>{
  const result=parseHubFc([[],header,["2026/10/29","Thu","44,219","14,853","59,072"],["2026/11/01","Sun",0,"","10"]]);
  assert.deepEqual(result.months,["2026-10","2026-11"]);
  assert.equal(result.rows[0].total,59072);assert.equal(result.rows[0].mismatch,false);
  assert.equal(result.rows[1].mp,0);assert.equal(result.rows[1].wh,null);
});
test("FC flags mismatched source total without replacing it and rejects duplicates/bad dates/counts",()=>{
  const row=["2026/10/29","Thu","1","2","9"];
  assert.equal(parseHubFc([header,row]).rows[0].mismatch,true);
  assert.equal(parseHubFc([header,row]).rows[0].total,9);
  assert.throws(()=>parseHubFc([header,row,row]),/trùng/);
  assert.throws(()=>parseHubFc([header,["2026/02/30","Mon",1,2,3]]),/Ngày/);
  assert.throws(()=>parseHubFc([header,["2026/10/29","Thu","1,2",2,3]]),/không hợp lệ/);
  assert.throws(()=>parseHubFc([]));
});

test("compares HCM forecast to Hub Inbound for the same date and marks today's result partial", () => {
  const date = "2026-11-17";
  const hub = { date, totals: { lm_hub_inbounded_order_qty_eod: 44179, Picked: 25000, Outbound: 90000 } };
  const result = compareHubInbound({ date, total: 65632 }, hub, date);
  assert.equal(result.actual, 44179);
  assert.equal(result.delta, -21453);
  assert.equal(result.ratio, -21453 / 65632);
  assert.equal(result.partial, true);

  const past = compareHubInbound({ date, total: 40000 }, hub, "2026-11-18");
  assert.equal(past.delta, 4179);
  assert.equal(past.partial, false);
});

test("does not carry actual inbound to other dates or treat missing values as zero", () => {
  const date = "2026-11-17";
  const fc = { date, total: 700 };
  const hub = { date, totals: { lm_hub_inbounded_order_qty_eod: 0 } };
  const missing = { actual: null, delta: null, ratio: null, partial: false };
  assert.deepEqual(compareHubInbound({ ...fc, date: "2026-11-16" }, hub, date), missing);
  assert.deepEqual(compareHubInbound(fc, hub, "2026-11-16"), missing);
  assert.deepEqual(compareHubInbound(fc, { ...hub, totals: { lm_hub_inbounded_order_qty_eod: null } }, date), missing);
  assert.deepEqual(compareHubInbound({ ...fc, total: null }, hub, date), { actual: 0, delta: null, ratio: null, partial: true });
  assert.deepEqual(compareHubInbound({ ...fc, total: 0 }, hub, date), { actual: 0, delta: 0, ratio: null, partial: true });
  assert.equal(compareHubInbound(fc, hub, date).ratio, -1);
});
