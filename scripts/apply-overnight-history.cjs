let db;
(async()=>{
 const fs=require('node:fs'),{PrismaClient}=require('@prisma/client');
 const ref=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0],url=new URL(process.env.DATABASE_URL);
 if(!url.hostname.includes(ref)&&!decodeURIComponent(url.username).includes(ref))throw Error('Database project mismatch');
 db=new PrismaClient();const test=process.argv.includes('--test'),rollback=Error('rollback');
 const sql=fs.readFileSync('prisma/overnight-holds-cutoff.sql','utf8');
 const statements=sql.replace(/^--.*$/gm,'').replace(/\$(\w*)\$[\s\S]*?\$\1\$/g,b=>b.replaceAll(';','\u0001')).split(';').map(s=>s.replaceAll('\u0001',';').trim()).filter(s=>s.startsWith('create or replace function public.publish_overnight_hold('));
 if(statements.length!==1)throw Error('Expected one overnight publisher');
 try{await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe("set local lock_timeout='10s'");
  for(const statement of statements)await tx.$executeRawUnsafe(statement);
  if(test){await tx.$executeRawUnsafe(fs.readFileSync('tests/overnight-cutoff.integration.sql','utf8'));throw rollback;}
 },{timeout:60000});}catch(error){if(error!==rollback)throw error;}
 console.log(test?'Overnight prior-day capture checks passed; transaction rolled back.':'Overnight prior-day capture installed; existing locked snapshots preserved.');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db?.$disconnect());
