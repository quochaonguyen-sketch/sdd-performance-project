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
  assert.equal(parsePerformanceFilters({page:"1e100"}).page,100000);
  assert.equal(parsePerformanceFilters({page:"Infinity"}).page,1);
});
test("custom inclusive ranges preserve both endpoints and reject malformed dates",()=>{
  const filters=parsePerformanceFilters({period:"range",start:"2026-10-23",end:"2026-10-26"});
  assert.equal(filters.start,"2026-10-23");assert.equal(filters.end,"2026-10-26");assert.equal(filters.date,filters.end);assert.equal(filters.period,"range");
  for(const pair of [{start:"2026-10-27",end:"2026-10-26"},{start:"2026-02-30",end:"2026-03-01"},{start:"2026-01-01"},{start:"2000-01-01",end:"2026-01-01"}])assert.throws(()=>parsePerformanceFilters({period:"range",...pair}),RangeError);
  assert.equal(parsePerformanceFilters({period:"range",start:"2024-02-29",end:"2024-02-29"}).start,"2024-02-29");
});
test("day week and month retain their existing inclusive ranges",()=>{
  assert.equal(parsePerformanceFilters({date:"2026-10-26",period:"week"}).start,"2026-10-20");
  assert.equal(parsePerformanceFilters({date:"2026-10-26",period:"month"}).start,"2026-10-01");
  assert.equal(parsePerformanceFilters({date:"2026-10-26"}).end,"2026-10-26");
});
