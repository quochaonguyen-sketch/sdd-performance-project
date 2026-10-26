import test from "node:test";
import assert from "node:assert/strict";
import { parsePerformanceFilters } from "../lib/performance/filters.ts";

test("client and server share normalized performance filter values",()=>{
  const values={date:"2026-10-26",q:"  Rider A  ",kv:"KV2",district:"Quận 4",sort:"total",dir:"desc",page:"2",pageSize:"200"};
  assert.deepEqual(parsePerformanceFilters(new URLSearchParams(values)),parsePerformanceFilters(values));
  const filters=parsePerformanceFilters(values);assert.equal(filters.q,"Rider A");assert.equal(filters.page,2);assert.equal(filters.sort,"total");
});
test("invalid controls cannot become raw SQL sorting or unbounded page sizes",()=>{
  const filters=parsePerformanceFilters({sort:"invalid",dir:"invalid",page:"-5",pageSize:"999999",q:"a".repeat(100)});
  assert.equal(filters.sort,"area");assert.equal(filters.dir,"asc");assert.equal(filters.page,1);assert.equal(filters.pageSize,200);assert.equal(filters.q.length,80);
});
