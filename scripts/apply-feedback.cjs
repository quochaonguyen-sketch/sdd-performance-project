const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
for (const file of ['.env', '.env.local']) {
  if (fs.existsSync(file)) Object.assign(process.env, require('node:util').parseEnv(fs.readFileSync(file, 'utf8')));
}
const db = new PrismaClient();
(async () => {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
  const url = new URL(process.env.DATABASE_URL);
  if (!url.hostname.includes(ref) && !decodeURIComponent(url.username).includes(ref)) throw Error('Database project mismatch');
  const statements = fs.readFileSync('prisma/feedback.sql', 'utf8').split(';').map(s => s.trim()).filter(Boolean);
  statements.push(...fs.readFileSync('prisma/feedback-followups.sql', 'utf8').split(/^-- statement-breakpoint\s*$/m).map(s => s.trim()).filter(Boolean));
  await db.$transaction(async tx => {
    for (const statement of statements) await tx.$executeRawUnsafe(statement);
  }, { timeout: 30000 });
  const result = await db.$queryRawUnsafe("select relname, relrowsecurity from pg_class where oid in ('public.user_feedback'::regclass, 'public.product_updates'::regclass, 'public.product_update_reads'::regclass, 'public.feedback_notifications'::regclass, 'public.web_vital_samples'::regclass)");
  if (result.length !== 5 || result.some(row => !row.relrowsecurity)) throw Error('Feedback table security check failed');
  const grants = await db.$queryRawUnsafe("select table_name from information_schema.role_table_grants where table_schema='public' and table_name in ('user_feedback','product_updates','product_update_reads','feedback_notifications','web_vital_samples') and grantee in ('anon','authenticated')");
  if (grants.length) throw Error('Unexpected direct client access');
  if (process.argv.includes('--test')) {
    const rollback = Error('rollback-fixtures');
    try {
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe(fs.readFileSync('tests/feedback.integration.sql', 'utf8'));
        throw rollback;
      }, { timeout: 30000 });
    } catch (error) { if (error !== rollback) throw error; }
    console.log('Persistence, review, publishing, read idempotency and access checks passed; fixtures rolled back.');
  }
  console.log('Feedback tables installed; RLS and server-only access verified.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
