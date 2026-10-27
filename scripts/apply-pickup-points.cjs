let db;
async function main() {
 const fs=await import('node:fs');const {PrismaClient}=await import('@prisma/client');
 const ref=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];const url=new URL(process.env.DATABASE_URL);
 if(!url.hostname.includes(ref)&&!decodeURIComponent(url.username).includes(ref))throw Error('Database project mismatch');
 db=new PrismaClient();
 if(process.argv.includes('--test')){
  const rollback=Error('rollback');
  try{await db.$transaction(async tx=>{await tx.$executeRawUnsafe(fs.readFileSync('tests/pickup-points.integration.sql','utf8'));throw rollback;},{timeout:30000});}catch(e){if(e!==rollback)throw e;}
  console.log('PUP sync, private write permissions, pagination and 30-day ADO checks passed; fixtures rolled back.');return;
 }
 const sql=fs.readFileSync('prisma/pickup-points-ado.sql','utf8');
 const statements=sql.replace(/\$\$[\s\S]*?\$\$/g,b=>b.replaceAll(';','\u0001')).split(';').map(s=>s.replaceAll('\u0001',';').trim()).filter(Boolean);
 await db.$transaction(async tx=>{await tx.$executeRawUnsafe("set local lock_timeout='10s'");for(const s of statements)await tx.$executeRawUnsafe(s);},{timeout:60000});
 console.log('Pickup Points catalog and per-shop volume installed for',ref);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db?.$disconnect());
