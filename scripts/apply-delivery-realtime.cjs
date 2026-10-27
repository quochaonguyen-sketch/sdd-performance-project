// Apply only to the database belonging to the website's configured Supabase URL.
let db;
async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const fs = await import('node:fs');
  db = new PrismaClient();
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
  const url = new URL(process.env.DATABASE_URL);
  if (!url.hostname.includes(ref) && !decodeURIComponent(url.username).includes(ref)) throw Error('Database project mismatch');
  const state = await db.$queryRawUnsafe("select to_regclass('public.realtime_delivery_riders')::text as riders, to_regclass('public.data_source_jobs')::text as jobs");
  console.log('Target:', ref, state);
  if (process.argv.includes('--check')) return;
  if (!state[0].riders || !state[0].jobs) throw Error('Install base realtime and source-worker SQL first');
  if (process.argv.includes('--test')) {
    const rollback = Error('ROLLBACK');
    try {
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe('select pg_advisory_xact_lock(948251,1)');
        await tx.$executeRawUnsafe(fs.readFileSync('tests/delivery-realtime.integration.sql','utf8'));
        throw rollback;
      }, {timeout:30000});
    } catch(error) { if(error!==rollback) throw error; }
    console.log('Atomic replacement, duplicate rejection, worker ownership and permissions passed; all test data rolled back.');
    return;
  }
  const sql = fs.readFileSync('prisma/delivery-realtime-source.sql', 'utf8');
  // Dollar-quoted PL/pgSQL bodies contain semicolons and must remain one statement.
  const statements = sql.replace(/\$\$[\s\S]*?\$\$/g, body => body.replaceAll(';','\u0001')).split(';').map(s => s.replaceAll('\u0001',';').trim()).filter(Boolean);
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe("set local lock_timeout='10s'");
    for (const statement of statements) await tx.$executeRawUnsafe(statement);
    const base = fs.readFileSync('prisma/data-source-worker.sql', 'utf8');
    const start = base.indexOf('create or replace function public.control_data_source(');
    const end = base.indexOf('end $$;', start) + 'end $$;'.length;
    if (start < 0 || end < 8) throw Error('Source control definition missing');
    await tx.$executeRawUnsafe(base.slice(start, end));
  }, { timeout: 60000 });
  console.log('Delivery realtime publisher installed; automatic schedule remains disabled.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db?.$disconnect());
