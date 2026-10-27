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
  const {getDriverPerformance,getDriverPerformanceExport,parsePerformanceFilters}=load('../lib/performance/driver-performance.ts');
  for(const q of ['', 'Toàn', 'Phường', 'Toàn']){
   queries.length=0;const start=performance.now();const result=await getDriverPerformance(parsePerformanceFilters({date:'2026-10-26',q}));
   console.log(JSON.stringify({q:q||'(all)',ms:Math.round(performance.now()-start),queries:queries.length,queryMs:[...queries],rows:result.rows.length,groups:result.summary.groups}));
   if(!q){
    const assert=await import('node:assert/strict');
    for(const controls of [{page:'2'},{sort:'pickup',dir:'desc'}]){
     queries.length=0;
     const next=await getDriverPerformance(parsePerformanceFilters({date:'2026-10-26',...controls}));
     assert.deepEqual(next.summary,result.summary);assert.deepEqual(next.analysis,result.analysis);
     assert.equal(queries.length,1,'Only table rows should be queried when paging or sorting');
     console.log(JSON.stringify({controls,queries:queries.length,totalsAndChartsUnchanged:true}));
    }
    queries.length=0;
    const refreshed=await getDriverPerformance(parsePerformanceFilters({date:'2026-10-26'}),'audit-refresh');
    assert.equal(queries.length,3,'Manual refresh must reload rows, metadata and charts');
    assert.deepEqual(refreshed.summary,result.summary);
    const beyond=await getDriverPerformance(parsePerformanceFilters({date:'2026-10-26',page:'100000'}));
    assert.equal(beyond.filters.page,Math.ceil(result.summary.groups/beyond.filters.pageSize));assert.ok(beyond.rows.length);
    const empty=await getDriverPerformance(parsePerformanceFilters({date:'2026-10-26',page:'100000',q:'__nonexistent_audit_rider__'}));
    assert.equal(empty.filters.page,1);assert.equal(empty.summary.groups,0);assert.equal(empty.rows.length,0);
    console.log('Refresh bypass, last-page recovery and empty results verified.');
   }
  }
  const filters=parsePerformanceFilters({date:'2026-10-25',sort:'total',dir:'desc'});
  const result=await getDriverPerformance(filters);
  const totals=result.rows.map(r=>r.delivery_delivered+Math.ceil(r.pickup_picked/3));
  if(totals.some((n,i)=>i>0&&n>totals[i-1])||result.rows.some(r=>!r.rider_id))throw Error('Sorting or drilldown regression');
  console.log('Total sorting and rider drilldown verified on real data.');
  const range=await getDriverPerformance(parsePerformanceFilters({period:'range',start:'2026-10-23',end:'2026-10-26',q:'158197'}));
  const [expected]=await client.$queryRaw`select sum(delivery_delivered)::int as deli,sum(pickup_picked)::int as pick from public.driver_performance_daily where driver_id='158197' and report_date between '2026-10-23'::date and '2026-10-26'::date`;
  if(range.rows.length!==1||range.rows[0].delivery_delivered!==expected.deli||range.rows[0].pickup_picked!==expected.pick||range.analysis.start!=='2026-10-23'||range.analysis.end!=='2026-10-26'||range.analysis.daily.length!==4)throw Error('Inclusive custom range regression');
  console.log(JSON.stringify({customRangeVerified:true,from:range.filters.start,to:range.filters.end,deli:expected.deli,pick:expected.pick,total:expected.deli+Math.ceil(expected.pick/3)}));
  const all=await getDriverPerformanceExport(parsePerformanceFilters({date:'2026-10-26',page:'2',pageSize:'25'}));
  if(all.rows.length!==all.summary.groups||all.rows.length<=100)throw Error('Export did not include all pages');
  const {performanceListWorkbook}=load('../lib/performance/list-export.ts');const XLSX=await import('xlsx');
  const bytes=XLSX.write(performanceListWorkbook(all.filters,all.rows),{type:'buffer',bookType:'xlsx'});
  const sheet=XLSX.read(bytes,{type:'buffer'}).Sheets.Performance,totalRow=8+all.rows.length;
  if(sheet[`N${totalRow}`].v!==all.summary.pickup_picked||sheet[`H${totalRow}`].v!==all.summary.delivery_delivered||sheet[`F2`].v!==all.rows.length)throw Error('Export totals mismatch');
  const filtered=await getDriverPerformanceExport(parsePerformanceFilters({period:'range',start:'2026-10-23',end:'2026-10-26',q:'158197',kv:range.rows[0].kv,district:range.rows[0].delivery_district,cot:range.rows[0].cot}));
  if(filtered.rows.length!==1||filtered.rows[0].driver_id!=='158197'||filtered.rows[0].pickup_picked!==expected.pick)throw Error('Filtered export scope mismatch');
  console.log(JSON.stringify({allPagesExportVerified:true,riders:all.rows.length,bytes:bytes.length,filteredRangeExportVerified:true}));
  const dailyFilters=parsePerformanceFilters({period:'range',start:'2026-10-23',end:'2026-10-26',q:'158197'});
  const daily=await getDriverPerformanceExport(dailyFilters,'daily');
  const expectedDaily=await client.$queryRaw`select to_char(report_date,'YYYY-MM-DD') as day,sum(delivery_delivered)::int as deli,sum(pickup_picked)::int as pick from public.driver_performance_daily where driver_id='158197' and report_date between '2026-10-23'::date and '2026-10-26'::date group by report_date order by report_date`;
  const actualDaily=daily.rows.map(row=>({day:row.report_date,deli:row.delivery_delivered,pick:row.pickup_picked}));
  (await import('node:assert/strict')).deepEqual(actualDaily,expectedDaily);
  const combined=performanceListWorkbook(dailyFilters,range.rows),dailyBook=performanceListWorkbook(dailyFilters,daily.rows,'daily');
  XLSX.utils.book_append_sheet(combined,dailyBook.Sheets['Theo ngay'],'Theo ngay');
  const reopened=XLSX.read(XLSX.write(combined,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
  if(reopened.SheetNames.length!==2||reopened.Sheets['Theo ngay'].A8.v!==expectedDaily[0].day)throw Error('Daily or combined workbook regression');
  console.log(JSON.stringify({dailyExportMatchesDatabase:true,days:daily.rows.length,combinedSheets:reopened.SheetNames}));
 }finally{await client.$disconnect();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
