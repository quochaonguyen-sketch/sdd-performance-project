// Update only cutoff scheduling; preserve existing pivots, workers and hourly history.
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
  const connection = new URL(process.env.DATABASE_URL);
  if (!connection.hostname.includes(ref) && !decodeURIComponent(connection.username).includes(ref)) throw Error('Database project mismatch');
  const source = fs.readFileSync('prisma/backlog-history.sql', 'utf8');
  const rollback = Error('verified-rollback'), test = process.argv.includes('--test');
  try {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe("set local lock_timeout='10s'");
      await tx.$executeRawUnsafe('select pg_advisory_xact_lock(948251,1)');
      for (const name of ['backlog_cutoff_times', 'backlog_checkpoint_valid', 'enqueue_backlog_checkpoints']) {
        const start = source.indexOf(`create or replace function public.${name}(`);
        const end = source.indexOf('$$;', start);
        if (start < 0 || end < start) throw Error(`Missing checked-in function ${name}`);
        await tx.$executeRawUnsafe(source.slice(start, end + 3));
      }
      await tx.$executeRawUnsafe('revoke all on function public.backlog_cutoff_times(text) from public,anon,authenticated');
      await tx.$executeRawUnsafe('grant execute on function public.backlog_cutoff_times(text) to service_role');
      if (test) {
        await tx.$executeRawUnsafe(fs.readFileSync('tests/backlog-cutoffs.integration.sql', 'utf8'));
        throw rollback;
      }
      // Retire only unstarted old fixed slots. Completed/queued snapshots remain intact.
      await tx.$executeRawUnsafe("update public.backlog_checkpoints set status='MISSED',message='Đã thay bằng lịch chốt riêng Pickup 11:15/15:30, Delivery 13:30/17:30',updated_at=now() where status='PENDING' and scheduled_for>=now() and (scheduled_for at time zone 'Asia/Ho_Chi_Minh')::time in ('16:00'::time,'16:30'::time)");
      await tx.$queryRawUnsafe('select public.enqueue_backlog_checkpoints()');
    }, { timeout: 60000 });
  } catch (error) { if (error !== rollback) throw error; }
  console.log(test ? 'Backlog cutoff checks passed; fixtures and test jobs rolled back.' : 'Pickup 11:15/15:30 and Delivery 13:30/17:30 scheduling installed.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
