const {PrismaClient}=require('@prisma/client');
const fs=require('node:fs');
const db=new PrismaClient();
(async()=>{
 const raw=JSON.parse(fs.readFileSync('C:/code/sdd-web-data/data/delivery-inventory-20261026-123938-601727.json','utf8')).records;
 const rollback=Error('rollback');
 try {await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe("set local statement_timeout='60s'");
  for(const [name,sql] of [
   ['validate',"explain(analyze,format text) select count(*) from jsonb_to_recordset($1::jsonb) as r(shipment_id text,received_time timestamptz,area text,status text) where nullif(trim(r.shipment_id),'') is null or r.received_time is null or r.area is null or r.status is distinct from 'LMHub_Received'"],
   ['distinct',"explain(analyze,format text) select count(distinct r->>'shipment_id') from jsonb_array_elements($1::jsonb) r"],
   ['insert-2000',"explain(analyze,format text) insert into public.lmhub_inventory_rows(snapshot_id,snapshot_at,shipment_id,received_time,area,status) select 'delivery-profile-rollback',now(),r.shipment_id,r.received_time,r.area,r.status from jsonb_to_recordset($1::jsonb) as r(shipment_id text,received_time timestamptz,area text,status text)"]
  ]) {const start=performance.now();const result=await tx.$queryRawUnsafe(sql,JSON.stringify(name==='insert-2000'?raw.slice(0,2000):raw));console.log(name,Math.round(performance.now()-start),JSON.stringify(result));}
  throw rollback;
 },{timeout:90000});}catch(e){if(e!==rollback)throw e;}
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());
