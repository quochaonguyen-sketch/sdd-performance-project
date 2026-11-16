const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const { loadEnvConfig } = require('@next/env');
const { statements } = require('./apply-backlog-history.cjs');

loadEnvConfig(process.cwd(), true);
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const apply = process.argv.includes('--apply');
const rollback = Error('rollback after verification');
const secretName = 'backlog_pivot_archive';

async function run() {
  const { createOHArchiveClient } = await import('../lib/onhold/archive.ts');
  const archive = createOHArchiveClient();
  assert.ok(archive, 'Missing archive project configuration');
  const primaryRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
  const connection = new URL(process.env.DATABASE_URL);
  assert.ok(connection.hostname.includes(primaryRef) || decodeURIComponent(connection.username).includes(primaryRef),
    'DATABASE_URL is not connected to the primary project');
  const config = JSON.stringify({
    url: new URL(process.env.SUPABASE_ARCHIVE_URL.trim()).origin,
    key: process.env.SUPABASE_ARCHIVE_KEY.trim(),
  });
  const migration = statements(readFileSync('prisma/backlog-pivot-primary.sql', 'utf8'));
  const manifest = async () => {
    const result = {};
    for (const batch of ['0123', '4567', '89ab', 'cdef']) {
      const parts = await Promise.all([...batch].map(async p_prefix => {
        const { data, error } = await archive.rpc('read_backlog_archive_manifest', { p_prefix })
          .abortSignal(AbortSignal.timeout(25_000));
        assert.ok(!error && data, `Cannot read archive manifest (${error?.code ?? 'empty'})`);
        return data;
      }));
      Object.assign(result, ...parts);
    }
    return result;
  };

  try {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe("set local lock_timeout = '12s'");
      await tx.$executeRawUnsafe('select pg_advisory_xact_lock(948251,1)');
      await tx.$executeRawUnsafe('lock table public.lmhub_fetch_jobs, public.backlog_snapshots, public.backlog_snapshot_rows in share row exclusive mode');

      const [source] = await tx.$queryRawUnsafe(`
        select coalesce(jsonb_object_agg(snapshot_id, jsonb_build_array(row_count, digest)), '{}'::jsonb) as manifest
        from (
          select snapshot_id, count(*) as row_count,
            md5(jsonb_agg(to_jsonb(r) order by area collate "C", district collate "C", ward collate "C")::text) as digest
          from public.backlog_snapshot_rows r group by snapshot_id
        ) grouped`);
      const target = await manifest();
      const [headers] = await tx.$queryRawUnsafe('select jsonb_agg(id) as ids from public.backlog_snapshots');
      const targetIds = new Set();
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await archive.from('backlog_snapshots').select('id').order('id')
          .range(offset, offset + 499).abortSignal(AbortSignal.timeout(15_000));
        assert.ok(!error && data, `Cannot verify archive snapshots (${error?.code ?? 'empty'})`);
        for (const { id } of data) targetIds.add(id);
        if (data.length < 500) break;
      }
      const missing = Object.keys(source.manifest).filter(id => JSON.stringify(source.manifest[id]) !== JSON.stringify(target[id]));
      const pending = new Set([...missing, ...headers.ids.filter(id => !targetIds.has(id))]);
      // The full copy runs independently. Only the final delta should need replay while publication is locked.
      assert.ok(pending.size <= 30, 'Run copy-backlog-snapshots.mts --apply before retrying cutover');

      const samples = await tx.$queryRawUnsafe(`
        select distinct on (source) id, source, work_date::text as day,
          public.read_backlog_snapshot(id, source) as detail, public.read_backlog_hourly(source, work_date) as hourly
        from public.backlog_snapshots where total_orders > 0 order by source, source_snapshot_at desc`);
      assert.equal(samples.length, 2, 'Missing Pickup or Delivery reference snapshot');

      const [secret] = await tx.$queryRawUnsafe('select id from vault.secrets where name=$1', secretName);
      if (secret) {
        await tx.$executeRawUnsafe('select vault.update_secret($1::uuid,$2)', secret.id, config);
      } else {
        await tx.$executeRawUnsafe('select vault.create_secret($1,$2)', config, secretName);
      }
      for (const sql of migration) await tx.$executeRawUnsafe(sql);
      console.log('Archive bridge installed in test transaction.');

      // Replay the real source data for both paths and any snapshots captured during the full copy.
      for (const id of new Set([...pending, ...samples.map(row => row.id)])) {
        const [saved] = await tx.$queryRawUnsafe(`
          select s.total_orders, public.backlog_archive_rpc('write_backlog_archive_pivot',
            jsonb_build_object('p_snapshot', to_jsonb(s), 'p_rows', coalesce((
              select jsonb_agg(to_jsonb(r)) from public.backlog_snapshot_rows r where r.snapshot_id = s.id
            ), '[]'::jsonb))) as total
          from public.backlog_snapshots s where s.id=$1::uuid`, id);
        assert.equal(BigInt(saved.total), saved.total_orders, 'Archive did not confirm source total');
      }
      const verified = missing.length ? await manifest() : target;
      assert.deepEqual(Object.fromEntries(Object.keys(source.manifest).map(id => [id, verified[id]])),
        source.manifest, 'Archive pivot fingerprint mismatch');
      const totalRows = Object.values(source.manifest).reduce((sum, [count]) => sum + count, 0);

      // DROP without CASCADE fails safely if another SQL object still depends on this table.
      await tx.$executeRawUnsafe('drop table public.backlog_snapshot_rows');
      await tx.$executeRawUnsafe('set local role service_role');
      for (const sample of samples) {
        const [after] = await tx.$queryRawUnsafe(`
          select public.read_backlog_snapshot($1::uuid, $2) as detail, public.read_backlog_hourly($2, $3::date) as hourly
        `, sample.id, sample.source, sample.day);
        assert.deepEqual(after.detail, sample.detail, `Snapshot detail changed for ${sample.source}`);
        assert.deepEqual(after.hourly, sample.hourly, `Hourly report changed for ${sample.source}`);
      }
      await tx.$executeRawUnsafe('reset role');
      console.log(JSON.stringify({ verifiedRows: totalRows, snapshots: headers.ids.length, checkedSources: samples.map(row => row.source) }));
      if (!apply) throw rollback;
    }, { timeout: 110_000 });
  } catch (error) {
    if (error !== rollback) throw error;
    console.log('Validation completed. Primary database changes rolled back.');
    return;
  }
  console.log('Archive readers and writer active. Primary pivot table dropped.');
}

run().catch(error => {
  console.error(error.code === 'ERR_ASSERTION' ? error.message : error.message?.split('\n').slice(-3).join('\n'));
  process.exitCode = 1;
}).finally(() => db.$disconnect());
