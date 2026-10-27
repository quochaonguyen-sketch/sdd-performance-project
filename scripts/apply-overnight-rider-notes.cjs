let db;
(async()=>{
 const fs=await import('node:fs'),{PrismaClient}=await import('@prisma/client');
 const ref=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0],url=new URL(process.env.DATABASE_URL);
 if(!url.hostname.includes(ref)&&!decodeURIComponent(url.username).includes(ref))throw Error('Database project mismatch');
 db=new PrismaClient();const test=process.argv.includes('--test'),rollback=Error('rollback');
 const statements=fs.readFileSync('prisma/overnight-rider-notes.sql','utf8').split(';').map(s=>s.trim()).filter(Boolean);
 try{await db.$transaction(async tx=>{
  for(const sql of statements)await tx.$executeRawUnsafe(sql);
  if(test){await tx.$executeRawUnsafe(fs.readFileSync('tests/overnight-rider-notes.integration.sql','utf8'));throw rollback;}
 },{timeout:30000});}catch(error){if(error!==rollback)throw error;}
 console.log(test?'Rider note persistence and permissions passed; fixtures rolled back.':'Overnight rider notes installed.');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db?.$disconnect());
