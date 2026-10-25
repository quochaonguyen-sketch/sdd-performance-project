import test from "node:test";
import assert from "node:assert/strict";
import { summarizeDashboardVolume, shiftVolumeDay } from "../lib/dashboard/volume-overview.ts";

test("volume sums all scoped rows and retains legacy detail counts without using live assigned",()=>{
  const result=summarizeDashboardVolume([
    {report_date:"2026-10-25",area:"KV1",total_orders:100},
    {report_date:"2026-10-25",area:"KV1",total_orders:null},
    {report_date:"2026-10-25",area:"KV5",total_orders:42},
    {report_date:"2026-10-25",area:"KV6",total_orders:999},
    {report_date:"2026-10-26",area:"KV1",total_orders:999},
  ],"2026-10-25");
  assert.equal(result.latest?.total,143);
  assert.equal(result.latest?.areas.find(r=>r.area==="KV1")?.orders,101);
  assert.equal(result.latest?.areas.reduce((n,r)=>n+(r.orders??0),0),143);
  assert.equal(result.daily.length,14);
});

test("missing dates remain null, real zero stays zero and fallback keeps its actual date",()=>{
  const result=summarizeDashboardVolume([{report_date:"2026-10-23",area:"KV1",total_orders:0}],"2026-10-25");
  assert.equal(result.latest?.date,"2026-10-23");
  assert.equal(result.latest?.total,0);
  assert.equal(result.daily.at(-1)?.total,null);
  assert.equal(result.daily.find(r=>r.date==="2026-10-23")?.total,0);
  assert.equal(result.latest?.areas.find(r=>r.area==="KV2")?.orders,null);
  assert.equal(summarizeDashboardVolume([],"2026-10-25").latest,null);
  assert.equal(shiftVolumeDay("2026-01-01",-1),"2025-12-31");
});
