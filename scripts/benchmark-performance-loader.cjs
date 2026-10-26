// Measures the real data loader; authentication remains enforced by the page/API.
(async()=>{
 const fs=await import('node:fs');const path=await import('node:path');const {default:Module}=await import('node:module');const {default:ts}=await import('typescript');
 const root=process.cwd(),originalResolve=Module._resolveFilename,originalLoad=Module._load;
 Module._resolveFilename=function(name,parent,...args){return originalResolve.call(this,name.startsWith('@/')?path.join(root,name.slice(2)):name,parent,...args);};
 Module._load=function(name,...args){return name==='server-only'?{}:originalLoad.call(this,name,...args);};
 const load=Module.createRequire(__filename);
 Module._extensions['.ts']=function(mod,file){mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);};
 const {PrismaClient}=await import('@prisma/client');const {performanceSessionUrl}=load('../lib/performance/database-url.ts');
 const url=performanceSessionUrl(process.env.DATABASE_URL,process.env.DIRECT_URL);
 const client=new PrismaClient({...(url?{datasources:{db:{url}}}:{}),log:[{emit:'event',level:'query'}]});global.prisma=client;global.performanceReadClient=client;
 const queries=[];client.$on('query',e=>queries.push(e.duration));
 try{
  const {getDriverPerformance,parsePerformanceFilters}=load('../lib/performance/driver-performance.ts');
  for(const q of ['', 'Toàn', 'Phường', 'Toàn']){
   queries.length=0;const start=performance.now();const result=await getDriverPerformance(parsePerformanceFilters({date:'2026-10-26',q}));
   console.log(JSON.stringify({q:q||'(all)',ms:Math.round(performance.now()-start),queries:queries.length,queryMs:[...queries],rows:result.rows.length,groups:result.summary.groups}));
  }
  const filters=parsePerformanceFilters({date:'2026-10-25',sort:'total',dir:'desc'});
  const result=await getDriverPerformance(filters);
  const totals=result.rows.map(r=>r.delivery_delivered+Math.ceil(r.pickup_picked/3));
  if(totals.some((n,i)=>i>0&&n>totals[i-1])||result.rows.some(r=>!r.rider_id))throw Error('Sorting or drilldown regression');
  console.log('Total sorting and rider drilldown verified on real data.');
 }finally{await client.$disconnect();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
