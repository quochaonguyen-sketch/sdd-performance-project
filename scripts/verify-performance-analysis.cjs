// Read-only verification of the actual server aggregation against the configured database.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const ts = require('typescript');
const projectRoot = path.resolve(__dirname,'..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request,...args) {
  return resolve.call(this,request.startsWith('@/') ? path.join(projectRoot,request.slice(2)) : request,...args);
};
require.extensions['.ts'] = (module,filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{ compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true } }).outputText,filename);
const { getDriverPerformance, parsePerformanceFilters } = require('../lib/performance/driver-performance.ts');
const { prisma } = require('../lib/prisma/client.ts');
(async()=>{
  for (const period of ['day','week','month']) {
    const result=await getDriverPerformance(parsePerformanceFilters({period}));
    const a=result.analysis;
    assert.equal(a.riderCount,result.summary.active_riders);
    assert.equal(a.distribution.reduce((n,bin)=>n+bin.count,0)+a.withoutDelivery,a.riderCount);
    assert.equal(a.areas.reduce((n,row)=>n+row.delivery_assigned,0),result.summary.delivery_assigned);
    assert.equal(a.areas.reduce((n,row)=>n+row.pickup_assigned,0),result.summary.pickup_assigned);
    for (const area of a.areas) {
      assert.ok(area.delivery_assigned_cot1+area.delivery_assigned_cot2<=area.delivery_assigned);
      assert.ok(area.pickup_assigned_cot1+area.pickup_assigned_cot2<=area.pickup_assigned);
    }
    console.log(JSON.stringify({period,riders:a.riderCount,trendDays:a.daily.length,daysWithData:a.daily.filter(x=>!('missing' in x)).length,areas:a.areas.length,deliveryAssigned:result.summary.delivery_assigned}));
  }
  const filters=parsePerformanceFilters({kv:'KV5',page:'99999'});
  const beyond=await getDriverPerformance(filters);
  assert.equal(beyond.rows.length,0);
  assert.ok(beyond.analysis.areas.every(row=>row.kv==='KV5'));
  assert.deepEqual(beyond.analysis.totals,((({delivery_assigned,delivery_delivered,pickup_assigned,pickup_picked})=>({delivery_assigned,delivery_delivered,pickup_assigned,pickup_picked}))(beyond.summary)));
  const none=await getDriverPerformance(parsePerformanceFilters({q:'__no_matching_rider_for_verification__'}));
  assert.equal(none.summary.active_riders,0);
  assert.equal(none.analysis.riderCount,0);
  console.log('Scope, missing-data, histogram and pagination assertions passed. No data modified.');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
