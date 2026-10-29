let db;
const rollback = Error('ROLLBACK');
async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const fs = await import('node:fs');
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
  const url = new URL(process.env.DATABASE_URL);
  if (!url.hostname.includes(ref) && !decodeURIComponent(url.username).includes(ref)) throw Error('Database project mismatch');
  db = new PrismaClient();
  try {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe("set local lock_timeout='10s'");
      await tx.$executeRawUnsafe(fs.readFileSync('prisma/remove-timeoff-tasks-violations.sql','utf8'));
      const [state] = await tx.$queryRawUnsafe("select to_regclass('public.rider_off_requests')::text as off, to_regclass('public.member_tasks')::text as tasks, to_regclass('public.rider_violations')::text as violations, to_regclass('public.ai_pending_actions')::text as actions, to_regclass('public.attendance_logs')::text as attendance, to_regclass('public.driver_performance_daily')::text as performance");
      if (state.off || state.tasks || state.violations || state.actions || !state.attendance || !state.performance) throw Error('Feature removal validation failed');
      if (process.argv.includes('--test')) throw rollback;
      await tx.$executeRawUnsafe("notify pgrst,'reload schema'");
    }, { timeout: 60000 });
  } catch (error) { if (error !== rollback) throw error; }
  console.log(process.argv.includes('--test') ? 'Removal and dependency checks passed; all changes rolled back.' : 'Removed Time Off, Tasks, Violations and their pending AI actions. Shared attendance and Performance preserved.');
}
main().catch(error => { console.error(error.message); process.exitCode=1; }).finally(()=>db?.$disconnect());
