let db;
(async()=>{
 const {PrismaClient}=await import('@prisma/client');const XLSX=await import('xlsx');
 const {buildRiderDaily,summarizeRiderDaily}=await import('../lib/performance/rider-detail.ts');
 const {riderPerformanceWorkbook}=await import('../lib/performance/rider-export.ts');
 db=new PrismaClient();
 const [rider]=await db.$queryRawUnsafe('select id::text,rider_code,full_name,kv,cot from public.riders where rider_code=$1 and upper(kv) in ($$KV1$$,$$KV2$$,$$KV3$$,$$KV4$$,$$KV5$$) limit 1','158197');
 if(!rider)throw Error('Sample rider not found');
 const range={from:'2026-10-23',to:'2026-10-26'};
 const data=await db.$queryRawUnsafe('select to_jsonb(p)||jsonb_build_object($$report_date$$,to_char(report_date,$$YYYY-MM-DD$$)) as row from public.driver_performance_daily p where driver_id=$1 and report_date between $2::date and $3::date order by report_date desc',rider.rider_code,range.from,range.to);
 const daily=buildRiderDaily(data.map(r=>r.row),rider.cot),summary=summarizeRiderDaily(daily);
 const bytes=XLSX.write(riderPerformanceWorkbook(rider,range,daily),{type:'buffer',bookType:'xlsx'});
 const sheet=XLSX.read(bytes,{type:'buffer'}).Sheets.Performance;
 const totalRow=7+daily.length;
 if(sheet['O'+totalRow].v!==summary.total||sheet['N'+totalRow].v!==summary.convertedPickup)throw Error('Excel totals mismatch');
 for(const row of daily){if(row.total!==row.delivery_delivered+Math.ceil(row.pickup_picked/3))throw Error('Daily conversion mismatch');}
 console.log(JSON.stringify({dailyRows:daily.length,excelBytes:bytes.length,convertedPickup:summary.convertedPickup,total:summary.total,workbookMatches:true,hasDrilldownId:!!rider.id}));
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db?.$disconnect());
