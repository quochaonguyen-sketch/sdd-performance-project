// Replace only the two affected RPCs; never replay source settings or schedules.
let db;
const rollback = Error('ROLLBACK');
async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const fs = await import('node:fs');
  db = new PrismaClient();
  const functions = [
  ['prisma/delivery-realtime-source.sql', 'publish_central_delivery_realtime'],
  ['prisma/data-source-worker.sql', 'finish_data_source_job'],
].map(([file, name]) => {
  const sql = fs.readFileSync(file, 'utf8');
  const start = sql.indexOf(`create or replace function public.${name}(`);
  const end = sql.indexOf('end $$;', start);
  if (start < 0 || end < 0) throw Error(`Missing function: ${name}`);
  return sql.slice(start, end + 'end $$;'.length);
});
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
  const url = new URL(process.env.DATABASE_URL);
  if (!url.hostname.includes(ref) && !decodeURIComponent(url.username).includes(ref)) throw Error('Database project mismatch');
  try {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe("set local lock_timeout='10s'");
      await tx.$executeRawUnsafe('select pg_advisory_xact_lock(948251,1)');
      await tx.$executeRawUnsafe('select pg_advisory_xact_lock(948251,9)');
      for (const sql of functions) await tx.$executeRawUnsafe(sql);
      if (process.argv.includes('--test')) {
        const active = await tx.$queryRawUnsafe("select count(*)::int as n from public.data_source_jobs where source_id='delivery_realtime' and status in ('RUNNING','CANCEL_REQUESTED')");
        if (active[0].n) throw Error('Wait for the active Delivery job before testing');
        await tx.$executeRawUnsafe(fs.readFileSync('tests/delivery-realtime.integration.sql', 'utf8'));
        throw rollback;
      }
      await tx.$executeRawUnsafe("notify pgrst,'reload schema'");
    }, { timeout: 60000 });
  } catch (error) { if (error !== rollback) throw error; }
  console.log(process.argv.includes('--test') ? 'Passed: stale snapshot preserves newer data, skip reason survives acknowledgement, newer snapshot publishes, invalid data/ownership rejected. All test changes rolled back.' : 'Updated Delivery realtime stale-snapshot handling and acknowledgement. Settings and historical jobs preserved.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db?.$disconnect());
