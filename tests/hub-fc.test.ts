import test from "node:test";
import assert from "node:assert/strict";
import { parseHubFc } from "../lib/dashboard/hub-fc.ts";
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
