import test from "node:test";
import assert from "node:assert/strict";
import { allocateCotRemainder } from "../lib/performance/cot-allocation.ts";

const values={assigned:100,completed:80,a1:40,c1:35,a2:20,c2:15};
test("historical COT counts cannot turn an official zero pickup total into production",()=>{
  const stale={assigned:0,completed:0,a1:0,c1:0,a2:36,c2:36};
  assert.deepEqual(allocateCotRemainder(stale,"COT 1"),{assigned:0,completed:0,a1:0,c1:0,a2:0,c2:0});
  assert.deepEqual(allocateCotRemainder(stale,null),{assigned:0,completed:0,a1:0,c1:0,a2:0,c2:0});
  assert.equal(stale.c2,36);
  assert.deepEqual(allocateCotRemainder({...stale,assigned:20,completed:12},"COT 2"),{assigned:20,completed:12,a1:0,c1:0,a2:20,c2:12});
});
test("adds only unclassified assigned/completed to the rider's main COT",()=>{
  assert.deepEqual(allocateCotRemainder(values,"COT 2"),{...values,a2:60,c2:45});
  assert.deepEqual(allocateCotRemainder(values,"COT 1"),{...values,a1:80,c1:65});
  assert.deepEqual(values,{assigned:100,completed:80,a1:40,c1:35,a2:20,c2:15});
});
test("handles wholly missing splits, COT1 subgroups and absent rider COT",()=>{
  const empty={assigned:12,completed:9,a1:0,c1:0,a2:0,c2:0};
  assert.deepEqual(allocateCotRemainder(empty,"cot2"),{...empty,a2:12,c2:9});
  assert.deepEqual(allocateCotRemainder(empty,"COT 1.2"),{...empty,a1:12,c1:9});
  assert.deepEqual(allocateCotRemainder(empty,null),empty);
  const complete={...values,a2:60,c2:45};
  assert.deepEqual(allocateCotRemainder(complete,"COT 2"),complete);
});
