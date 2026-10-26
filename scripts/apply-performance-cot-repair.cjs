let db;
(async()=>{
 const fs=await import('node:fs');const {PrismaClient}=await import('@prisma/client');db=new PrismaClient();
 const [day,path]=process.argv.slice(2);if(!/^\d{4}-\d{2}-\d{2}$/.test(day??'')||!path)throw Error('Expected day and verified cot_only artifact');
 const body=JSON.parse(fs.readFileSync(path,'utf8'));const rows=body.records;
 if(body.repair_kind!=='cot_only'||!Array.isArray(rows)||!rows.length||new Set(rows.map(r=>r.driver_id)).size!==rows.length||rows.some(r=>r.report_date!==day||r.performance_id!==day+'|'+r.driver_id))throw Error('Invalid repair artifact');
 const ref=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];const connection=new URL(process.env.DATABASE_URL);
 if(!connection.hostname.includes(ref)&&!decodeURIComponent(connection.username).includes(ref))throw Error('Database project mismatch');
 await db.$transaction(async tx=>{
  const saved=await tx.$queryRawUnsafe('select * from public.driver_performance_daily where report_date=$1::date for update',day);
  if(saved.length!==rows.length)throw Error('Report changed; refusing partial repair');
  const lookup=new Map(saved.map(r=>[r.driver_id,r]));
  for(const row of rows){const current=lookup.get(row.driver_id);if(!current||['delivery_assigned','delivery_delivered','pickup_assigned','pickup_picked'].some(k=>current[k]!==row[k]))throw Error('Official totals changed; refresh repair inputs');}
  fs.writeFileSync('C:/code/sdd-web-data/data/performance-cot-backup/performance-'+day+'-before-scope-fix.json',JSON.stringify(saved));
  const count=await tx.$executeRawUnsafe(`update public.driver_performance_daily p set
   cot=r.cot,delivery_assigned_cot1=r.delivery_assigned_cot1,delivery_delivered_cot1=r.delivery_delivered_cot1,
   delivery_assigned_cot2=r.delivery_assigned_cot2,delivery_delivered_cot2=r.delivery_delivered_cot2,
   pickup_assigned_cot1=r.pickup_assigned_cot1,pickup_picked_cot1=r.pickup_picked_cot1,
   pickup_assigned_cot2=r.pickup_assigned_cot2,pickup_picked_cot2=r.pickup_picked_cot2,cot_breakdown=r.cot_breakdown
   from jsonb_to_recordset($1::jsonb) r(driver_id text,cot text,delivery_assigned_cot1 int,delivery_delivered_cot1 int,
   delivery_assigned_cot2 int,delivery_delivered_cot2 int,pickup_assigned_cot1 int,pickup_picked_cot1 int,pickup_assigned_cot2 int,pickup_picked_cot2 int,cot_breakdown jsonb)
   where p.report_date=$2::date and p.driver_id=r.driver_id`,JSON.stringify(rows),day);
  if(count!==rows.length)throw Error('Incomplete update');console.log(day+': corrected COT for '+count+' rows; official totals and fetched_at unchanged.');
 },{timeout:60000});
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db?.$disconnect());
