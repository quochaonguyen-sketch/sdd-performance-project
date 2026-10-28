let db;

// Split our checked-in PostgreSQL source without splitting dollar-quoted function bodies.
function statements(sql) {
  const result = [];
  let begin = 0, quote = null, dollar = null, line = false, block = 0;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i], next = sql[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '/' && next === '*') { block++; i++; } else if (c === '*' && next === '/') { block--; i++; } continue; }
    if (dollar) { if (sql.startsWith(dollar, i)) { i += dollar.length - 1; dollar = null; } continue; }
    if (quote) { if (c === quote) { if (next === quote) i++; else quote = null; } continue; }
    if (c === '-' && next === '-') { line = true; i++; continue; }
    if (c === '/' && next === '*') { block = 1; i++; continue; }
    if (c === "'" || c === '"') { quote = c; continue; }
    if (c === '$') { const match = sql.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/); if (match) { dollar = match[0]; i += dollar.length - 1; continue; } }
    if (c === ';') { const value = sql.slice(begin, i + 1).trim(); if (value) result.push(value); begin = i + 1; }
  }
  if (sql.slice(begin).trim()) result.push(sql.slice(begin));
  return result;
}

async function main() {
  const fs = await import('node:fs');
  const { PrismaClient } = await import('@prisma/client');
  db = new PrismaClient();
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
  const connection = new URL(process.env.DATABASE_URL);
  if (!connection.hostname.includes(ref) && !decodeURIComponent(connection.username).includes(ref)) throw new Error('DATABASE_URL does not match this website project');
  if (process.argv.includes('--test')) {
    const rollback = new Error('rollback test');
    try {
      await db.$transaction(async tx => {
        for (const sql of statements(fs.readFileSync('tests/backlog-history.integration.sql', 'utf8'))) await tx.$executeRawUnsafe(sql);
        throw rollback;
      }, { timeout: 60000 });
    } catch (error) { if (error !== rollback) throw error; }
    console.log('Backlog history integration checks passed; all fixtures rolled back.');
    return;
  }
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe("set local lock_timeout='15s'");
    await tx.$executeRawUnsafe('select pg_advisory_xact_lock(948251,1)');
    await tx.$executeRawUnsafe('select pg_advisory_xact_lock(734291,12)');
    await tx.$executeRawUnsafe('lock table public.data_source_jobs,public.lmhub_fetch_jobs,public.pickup_48h_no_api2,public.lmhub_inventory_rows in access exclusive mode');
    for (const sql of statements(fs.readFileSync('prisma/backlog-history.sql', 'utf8'))) await tx.$executeRawUnsafe(sql);
    const source = fs.readFileSync('prisma/data-source-worker.sql', 'utf8');
    const start = source.indexOf('create or replace function public.publish_central_pickup(');
    const end = source.indexOf('revoke all on function public.publish_central_pickup', start);
    if (start < 0 || end < 0 || !source.slice(start, end).includes('r.district')) throw new Error('Pickup publisher definition missing');
    for (const sql of statements(source.slice(start, end))) await tx.$executeRawUnsafe(sql);
    await tx.$executeRawUnsafe("alter function public.publish_central_pickup(uuid,text,text,timestamptz,jsonb,text[],boolean) set statement_timeout='120s'");
    await tx.$queryRawUnsafe('select public.enqueue_backlog_checkpoints()');
  }, { timeout: 60000 });
  console.log('Backlog history schema, publication trigger and UTC+7 checkpoint schedule installed.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db?.$disconnect());
