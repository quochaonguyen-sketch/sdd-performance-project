// Read-only regression check using the same aggregation as the table and Excel export.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict');
const resolve=Module._resolveFilename,load=Module._load,root=path.resolve(__dirname,'..');
Module._load=function(name,...args){if(name==='server-only')return {};return load.call(this,name,...args)};
Module._resolveFilename=function(name,...args){return resolve.call(this,name.startsWith('@/')?path.join(root,name.slice(2)):name,...args)};
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {getDriverPerformanceExport,parsePerformanceFilters}=require('../lib/performance/driver-performance.ts');
const {pickupCotWarning}=require('../lib/performance/pickup-warning.ts');
const {getPerformanceDatabase}=require('../lib/performance/database.ts');
const {prisma}=require('../lib/prisma/client.ts');
(async()=>{
 for(const q of ['163735','165712','165193']){
  const filters=parsePerformanceFilters({period:'range',start:'2026-10-23',end:'2026-10-28',q});
  const summary=await getDriverPerformanceExport(filters);
  const daily=await getDriverPerformanceExport(filters,'daily');
  assert.equal(summary.rows.length,1,`Missing rider ${q}`);
  assert.ok(daily.rows.length>0);
  for(const row of [...summary.rows,...daily.rows]){
   assert.equal(row.driver_id,q);
   assert.equal(row.pickup_assigned,0);
   assert.equal(row.pickup_picked,0);
   assert.equal(row.pickup_picked_cot1,0);
   assert.equal(pickupCotWarning(row),null);
  }
  console.log(`${q}: daily and range totals remain 0/0, no false pickup warning.`);
 }
})().catch(error=>{console.error(error.message);process.exitCode=1}).finally(async()=>{
 await (await getPerformanceDatabase()).$disconnect();await prisma.$disconnect();
});
