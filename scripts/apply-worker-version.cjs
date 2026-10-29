let db;
const rollback = Error('ROLLBACK');
async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const fs = await import('node:fs');
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
  const url = new URL(process.env.DATABASE_URL);
  if (!url.hostname.includes(ref) && !decodeURIComponent(url.username).includes(ref)) throw Error('Database project mismatch');
  const sql = fs.readFileSync('prisma/data-source-worker.sql', 'utf8');
  const start = sql.indexOf('create or replace function public.pulse_data_source_worker(');
  const end = sql.indexOf('\n$$;', start);
  if (start < 0 || end < 0) throw Error('Missing worker heartbeat definition');
  db = new PrismaClient();
  try {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe("set local lock_timeout='10s'");
      await tx.$executeRawUnsafe('select pg_advisory_xact_lock(948251,1)');
      await tx.$executeRawUnsafe(sql.slice(start, end + '\n$$;'.length));
      if (process.argv.includes('--test')) {
        await tx.$executeRawUnsafe(fs.readFileSync('tests/worker-version.integration.sql', 'utf8'));
        throw rollback;
      }
      await tx.$executeRawUnsafe("notify pgrst,'reload schema'");
    }, { timeout: 60000 });
  } catch (error) { if (error !== rollback) throw error; }
  console.log(process.argv.includes('--test') ? 'Passed: long worker version retained, unsupported worker blocked, capable worker claims Performance. Queue and fixtures rolled back.' : 'Worker heartbeat now preserves versions up to 100 characters; capability checks and schedules unchanged.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db?.$disconnect());
