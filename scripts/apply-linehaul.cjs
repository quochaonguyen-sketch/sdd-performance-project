let db;
(async()=>{
 const fs=await import('node:fs'),{PrismaClient}=await import('@prisma/client');
 const ref=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0],url=new URL(process.env.DATABASE_URL);
 if(!url.hostname.includes(ref)&&!decodeURIComponent(url.username).includes(ref))throw Error('Database project mismatch');
 db=new PrismaClient();const test=process.argv.includes('--test'),rollback=Error('rollback');
 const sql=fs.readFileSync('prisma/linehaul.sql','utf8');
 const statements=sql.replace(/^--.*$/gm,'').replace(/\$(\w*)\$[\s\S]*?\$\1\$/g,b=>b.replaceAll(';','\u0001')).split(';').map(s=>s.replaceAll('\u0001',';').trim()).filter(Boolean);
 try{await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe("set local lock_timeout='10s'");for(const statement of statements)await tx.$executeRawUnsafe(statement);
  if(test){await tx.$executeRawUnsafe(fs.readFileSync('tests/linehaul.integration.sql','utf8'));throw rollback;}
 },{timeout:60000});}catch(error){if(error!==rollback)throw error;}
 console.log(test?'LH ownership, snapshot validation and permissions passed; fixtures rolled back.':'LH source and private snapshot installed.');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db?.$disconnect());
