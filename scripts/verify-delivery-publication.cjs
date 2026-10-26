let db;
(async()=>{
 const fs=await import('node:fs');
 const {PrismaClient}=await import('@prisma/client');
 db=new PrismaClient();
 const [job,artifact]=process.argv.slice(2);
 if(!/^[0-9a-f-]{36}$/.test(job??'')||!artifact)throw Error('Usage: verify-delivery-publication.cjs job-id artifact.json');
 const rows=JSON.parse(fs.readFileSync(artifact,'utf8')).records;
 const result=await db.$queryRawUnsafe(`with expected as (
 select * from jsonb_to_recordset($1::jsonb) as r(shipment_id text,create_time timestamptz,received_time timestamptz,report_date date,ward text,district text,area text,zone_id text,status text,order_type text,cot_group text)
 ), actual as (select * from public.lmhub_inventory_rows where snapshot_id=$2)
 select (select count(*)::int from expected) as expected,(select count(*)::int from actual) as actual,
 (select count(*)::int from expected e full join actual a using(shipment_id) where e.shipment_id is null or a.shipment_id is null or
 row(e.create_time,e.received_time,e.report_date,e.ward,e.district,e.area,e.zone_id,e.status,e.order_type,e.cot_group) is distinct from
 row(a.create_time,a.received_time,a.report_date,a.ward,a.district,a.area,a.zone_id,a.status,a.order_type,a.cot_group)) as mismatches,
 (select total_orders::int from public.backlog_snapshots where source='delivery' and source_snapshot_id=$2) as history`,JSON.stringify(rows),job);
 const jobs=await db.$queryRawUnsafe('select status,started_at,finished_at from public.data_source_jobs where id=$1::uuid',job);
 console.log(JSON.stringify({job,...result[0],status:jobs[0]?.status,elapsed_ms:jobs[0]?.finished_at-jobs[0]?.started_at}));
 if(result[0].mismatches||result[0].actual!==rows.length||result[0].history!==rows.length||jobs[0]?.status!=='SUCCEEDED')throw Error('Publication verification failed');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db?.$disconnect());
