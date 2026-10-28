// Apply the additive server-only functions and reconcile counts against their order drill-down.
const fs=require('node:fs'),assert=require('node:assert/strict'),{PrismaClient}=require('@prisma/client');
const ref=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0],url=new URL(process.env.DATABASE_URL);
if(!url.hostname.includes(ref)&&!decodeURIComponent(url.username).includes(ref))throw Error('Database project mismatch');
const db=new PrismaClient();
function statements(sql){let quoted=false,start=0,result=[];for(let i=0;i<sql.length;i++){if(sql.slice(i,i+2)==='$$'){quoted=!quoted;i++;}else if(sql[i]===';'&&!quoted){result.push(sql.slice(start,i+1));start=i+1;}}return result;}
(async()=>{
 await db.$transaction(async tx=>{
  for(const sql of statements(fs.readFileSync('prisma/pickup-inventory-geography.sql','utf8')))await tx.$executeRawUnsafe(sql);
  const [{data}]=await tx.$queryRawUnsafe("select public.pickup_inventory_geography_dashboard('Assigned') as data");
  let sum=0;for(const row of data.rows)sum+=Number(row.orders);
  const [{count}]=await tx.$queryRawUnsafe("select count(distinct shipment_id)::int as count from public.pickup_48h_no_api2 where status='Assigned' and area in ('KV1','KV2','KV3','KV4','KV5') and nullif(btrim(shipment_id),'') is not null");
  assert.equal(sum,count);
  for(const r of data.rows.slice(0,10)){
   const [{data:orders}]=await tx.$queryRawUnsafe("select public.pickup_inventory_geography_orders($1,'Assigned',$2,$3,$4,'',0,ARRAY[]::text[]) as data",r.area,r.district,r.ward,r.cot.toLowerCase());
   assert.equal(orders.total,Number(r.orders));assert.ok(orders.rows.every(o=>o.area===r.area&&o.district===r.district&&o.ward===r.ward));
   const [{data:filtered}]=await tx.$queryRawUnsafe("select public.pickup_inventory_geography_orders($1,'Assigned',$2,'',$4,'',0,ARRAY[$3]::text[]) as data",r.area,r.district,r.ward,r.cot.toLowerCase());
   assert.equal(filtered.total,Number(r.orders),'District drill-down must respect the visible ward subset');
  }
  const privileges=await tx.$queryRawUnsafe("select p.proname,has_function_privilege('anon',p.oid,'execute') as anon,has_function_privilege('authenticated',p.oid,'execute') as authenticated,has_function_privilege('service_role',p.oid,'execute') as service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('pickup_inventory_geography','pickup_inventory_geography_dashboard','pickup_inventory_geography_orders')");
  assert.equal(privileges.length,3);for(const p of privileges){assert.equal(p.anon,false);assert.equal(p.authenticated,false);assert.equal(p.service,true);}
  console.log(JSON.stringify({geographicRows:data.rows.length,distinctOrders:sum,checkedWardScopes:Math.min(data.rows.length,10),serverOnlyFunctions:3}));
 },{timeout:120000});
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
