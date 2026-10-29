// One batch through the normal worker queue; never overwrite a pre-existing day.
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function missingDays(month, today, existing) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error('Expected YYYY-MM');
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
    .filter(day => day <= today && !existing.has(day));
}

async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const month = process.argv[2];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  missingDays(month, today, new Set());
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
  const connection = new URL(process.env.DATABASE_URL);
  if (!connection.hostname.includes(ref) && !decodeURIComponent(connection.username).includes(ref)) throw Error('Database project mismatch');
  const folder = path.join(process.env.LOCALAPPDATA, 'SDD', 'performance-backfill');
  fs.mkdirSync(folder, { recursive: true });
  const stateFile = path.join(folder, `${month}.json`);
  const lockFile = path.join(folder, `${month}.lock`);
  const lock = fs.openSync(lockFile, 'wx');
  const db = new PrismaClient();
  let state;
  const save = () => fs.writeFileSync(stateFile, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2));
  const log = (day, status, detail) => console.log(JSON.stringify({ at: new Date().toISOString(), day, status, detail }));
  try {
    const existing = await db.$queryRawUnsafe('select distinct report_date::text as day from public.driver_performance_daily where report_date >= $1::date and report_date < ($1::date + interval \'1 month\')', `${month}-01`);
    const dates = missingDays(month, today, new Set(existing.map(r => r.day)));
    state = { month, startedAt: new Date().toISOString(), pid: process.pid, status: 'RUNNING', preservedDays: existing.map(r => r.day), days: dates.map(day => ({ day, status: 'PENDING' })) };
    save();
    log(null, 'STARTED', { missing: dates, preserved: existing.length, stateFile });
    for (const item of state.days) {
      for (;;) {
        const next = await db.$transaction(async tx => {
          await tx.$executeRawUnsafe('select pg_advisory_xact_lock(948251,1)');
          const present = await tx.$queryRawUnsafe('select exists(select 1 from public.driver_performance_daily where report_date=$1::date) as found', item.day);
          if (present[0].found) return { skip: true };
          const active = await tx.$queryRawUnsafe("select id,report_date::text as day from public.data_source_jobs where source_id='performance' and status in ('QUEUED','RUNNING','CANCEL_REQUESTED')");
          if (active.length) return active[0].day === item.day ? { jobId: active[0].id } : { busy: true };
          const result = await tx.$queryRawUnsafe("select public.control_data_source('performance','run',$1::date,null) as job", item.day);
          return result[0].job;
        }, { timeout: 15000 });
        if (next.skip) { item.status = 'SKIPPED_EXISTING'; log(item.day, item.status); save(); break; }
        if (next.busy) { await pause(20000); continue; }
        item.jobId = next.jobId;
        item.status = 'QUEUED';
        save(); log(item.day, item.status, { jobId: item.jobId });
        let lastStatus;
        for (;;) {
          const [job] = await db.$queryRawUnsafe('select status,phase,message,started_at,finished_at from public.data_source_jobs where id=$1::uuid', item.jobId);
          if (!job) throw Error(`Missing job for ${item.day}`);
          if (`${job.status}:${job.phase}` !== lastStatus) {
            lastStatus = `${job.status}:${job.phase}`;
            item.status = job.status; item.phase = job.phase;
            save(); log(item.day, job.status, { phase: job.phase, message: job.message });
          }
          if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(job.status)) {
            const [count] = await db.$queryRawUnsafe('select count(*)::int as riders from public.driver_performance_daily where report_date=$1::date', item.day);
            item.riders = count.riders;
            item.finishedAt = job.finished_at;
            item.message = job.message;
            if (job.status === 'SUCCEEDED' && !count.riders) item.status = 'FAILED_EMPTY';
            save(); log(item.day, item.status, { riders: item.riders });
            break;
          }
          await pause(15000);
        }
        break;
      }
    }
    const remaining = await db.$queryRawUnsafe('select distinct report_date::text as day from public.driver_performance_daily where report_date >= $1::date and report_date < ($1::date + interval \'1 month\')', `${month}-01`);
    state.remaining = missingDays(month, today, new Set(remaining.map(r => r.day)));
    state.status = state.remaining.length || state.days.some(d => ['FAILED', 'FAILED_EMPTY', 'CANCELLED'].includes(d.status)) ? 'NEEDS_ATTENTION' : 'COMPLETED';
    save(); log(null, state.status, { remaining: state.remaining });
    if (state.status !== 'COMPLETED') process.exitCode = 1;
  } catch (error) {
    if (state) { state.status = 'ERROR'; state.error = error.message; save(); }
    throw error;
  } finally {
    await db.$disconnect(); fs.closeSync(lock); fs.unlinkSync(lockFile);
  }
}

module.exports = { missingDays };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
