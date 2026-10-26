let db;
async function main() {
 const fs=await import('node:fs');
 const {PrismaClient}=await import('@prisma/client');
 db=new PrismaClient();
 const ref=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
 const connection=new URL(process.env.DATABASE_URL);
 if(!connection.hostname.includes(ref)&&!decodeURIComponent(connection.username).includes(ref))throw Error('Database project mismatch');
 if(process.argv.includes('--test')){
  const rollback=Error('rollback');
  try{await db.$transaction(async tx=>{
   await tx.$executeRawUnsafe('select pg_advisory_xact_lock(948251,1)');
   await tx.$executeRawUnsafe('select pg_advisory_xact_lock(734291,12)');
   await tx.$executeRawUnsafe(fs.readFileSync('tests/delivery-performance.integration.sql','utf8'));
   throw rollback;
  },{timeout:60000});}catch(error){if(error!==rollback)throw error;}
  console.log('Compact publication checks passed; all fixtures rolled back.');
  return;
 }
 const source=fs.readFileSync('prisma/lmhub-delivery-worker.sql','utf8');
 const begin=source.indexOf('create or replace function public.publish_sdd_delivery_inventory(');
 const end=source.indexOf('revoke all on function public.claim_sdd_delivery_job',begin);
 if(begin<0||end<0)throw Error('Publisher definition missing');
 await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe("set local lock_timeout='15s'");
  await tx.$executeRawUnsafe('select pg_advisory_xact_lock(948251,1)');
  await tx.$executeRawUnsafe('select pg_advisory_xact_lock(734291,12)');
  await tx.$executeRawUnsafe(source.slice(begin,end));
  await tx.$executeRawUnsafe("alter function public.publish_sdd_delivery_inventory(uuid,text,text,timestamptz,jsonb,text[],boolean) set statement_timeout='60s'");
  const compact=fs.readFileSync('prisma/delivery-compact.sql','utf8');
  const compactEnd=compact.indexOf('end $$;')+7;
  if(compactEnd<7)throw Error('Compact definition missing');
  await tx.$executeRawUnsafe(compact.slice(0,compactEnd));
  for(const statement of compact.slice(compactEnd).split(';').filter(s=>s.trim()))await tx.$executeRawUnsafe(statement);
  await tx.$executeRawUnsafe("notify pgrst, 'reload schema'");
 },{timeout:60000});
 console.log('Delivery publisher installed: typed ID validation, bounded 60s bulk publication, actual completion timestamp.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db?.$disconnect());
