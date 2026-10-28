let db;
(async()=>{
 const fs=require('node:fs'),{PrismaClient}=require('@prisma/client');
 const ref=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0],connection=new URL(process.env.DATABASE_URL);
 if(!connection.hostname.includes(ref)&&!decodeURIComponent(connection.username).includes(ref))throw Error('Database project mismatch');
 db=new PrismaClient();
 const canonical=fs.readFileSync('prisma/data-source-worker.sql','utf8');
 const pulse=canonical.slice(canonical.indexOf('create or replace function public.pulse_data_source_job('),canonical.indexOf('create or replace function public.begin_data_source_publish('));
 const begin=canonical.slice(canonical.indexOf('create or replace function public.begin_data_source_publish('),canonical.indexOf('create or replace function public.begin_data_source_inventory('));
 if(process.argv.includes('--test')){
  const rollback=Error('rollback'),started=Date.now();
  try{await db.$transaction(async tx=>{
   await tx.$executeRawUnsafe("set local statement_timeout='130s'");
   for(const [test,original] of [['pickup_test_rows','pickup_48h_no_api2'],['pickup_test_jobs','data_source_jobs'],['pickup_test_legacy','lmhub_fetch_jobs']]){
    await tx.$executeRawUnsafe(`create temporary table ${test} (like public.${original} including all) on commit drop`);
   }
   await tx.$executeRawUnsafe('create trigger audit_user_changes after insert or update or delete on pg_temp.pickup_test_rows for each row execute function ops_private.audit_user_change()');
   const [row]=await tx.$queryRawUnsafe("select pg_get_functiondef('public.publish_central_pickup(uuid,text,text,timestamptz,jsonb,text[],boolean)'::regprocedure) as source");
   const source=row.source.replaceAll('public.publish_central_pickup','pg_temp.pickup_test_publish').replaceAll('public.pickup_48h_no_api2','pg_temp.pickup_test_rows').replaceAll('public.data_source_jobs','pg_temp.pickup_test_jobs').replaceAll('public.lmhub_fetch_jobs','pg_temp.pickup_test_legacy');
   await tx.$executeRawUnsafe(source);
   await tx.$executeRawUnsafe(fs.readFileSync('tests/pickup-publication-budget.integration.sql','utf8'));
   throw rollback;
  },{timeout:145000});}catch(error){if(error!==rollback)throw error;}
  console.log(`12,000-row publication, audit trigger, ownership, idempotency and rollback checks passed in ${Date.now()-started}ms; only temporary tables were used.`);
  return;
 }
 await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe("set local lock_timeout='5s'");
  await tx.$executeRawUnsafe(pulse);
  await tx.$executeRawUnsafe(begin);
  await tx.$executeRawUnsafe("alter function public.publish_central_pickup(uuid,text,text,timestamptz,jsonb,text[],boolean) set statement_timeout='120s'");
 },{timeout:15000});
 await db.$executeRawUnsafe("notify pgrst,'reload schema'");
 const result=await db.$queryRawUnsafe("select proconfig from pg_proc where oid='public.publish_central_pickup(uuid,text,text,timestamptz,jsonb,text[],boolean)'::regprocedure");
 if(!result[0]?.proconfig.includes('statement_timeout=120s'))throw Error('Pickup publication timeout was not applied');
 console.log('Pickup publication has a 120s database budget; worker HTTP budget must be 150s.');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db?.$disconnect());
