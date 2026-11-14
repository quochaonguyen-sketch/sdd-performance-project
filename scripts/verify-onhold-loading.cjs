/* eslint-disable @typescript-eslint/no-require-imports -- Use the existing CommonJS verification harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
let reportDates = [], active = 0, peak = 0;
let metadataFailures = 0, metadataReads = 0;
const versions = new Map();
const reads = [], failures = new Map();
const client = {
  from(table) {
    if (table === 'riders') {
      const query = { select() { return query; }, order() { return query; }, range() { return query; }, async abortSignal() { return { data: [], error: null }; } };
      return query;
    }
    const query = {
      select() { return query; }, gte() { return query; }, lte() { return query; }, order() { return query; },
      async abortSignal() {
        metadataReads++;
        if (metadataFailures > 0) { metadataFailures--; return { data: null, error: { code: '', message: 'Fetch failed' }, status: 0 }; }
        return { data: reportDates.map(report_date => ({ report_date, fetched_at: versions.get(report_date), finalized_at: report_date < '2026-11-06' ? 'closed' : null })), error: null, status: 200 };
      },
    };
    return query;
  },
  rpc(name, params) {
    assert.equal(name, 'read_onhold_pivot');
    assert.equal(params.p_from, params.p_to, 'Every aggregation must be scoped to one day');
    return { async abortSignal() {
      const day = params.p_from;
      reads.push(day); active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 2)); active--;
      const failure = failures.get(day);
      if (failure?.remaining > 0) {
        failure.remaining--;
        return { data: null, error: { code: failure.code, message: 'Fixture database failure' }, status: failure.status };
      }
      return { data: { reports: [{ report_date: day }], cells: [{ report_date: day, orders: 1 }] }, error: null, status: 200 };
    } };
  },
};
const resolve = Module._resolveFilename, load = Module._load;
Module._resolveFilename = function(name, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args); };
Module._load = function(name, ...args) {
  if (name === 'server-only') return {};
  if (name === '@/lib/supabase/admin') return { createAdminClient: () => client };
  if (name === '@/lib/data-sources/catalog') return { vietnamDay: () => '2026-11-06' };
  return load.call(this, name, ...args);
};
Module._extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const { getOHPivot, OHPivotError } = require('../lib/onhold/server.ts');
const day = value => `2026-10-${String(value).padStart(2, '0')}`;
(async () => {
  reportDates = [1, 2, 3, 4, 5, 6].map(day);
  const result = await getOHPivot(day(1), day(6));
  assert.equal(peak, 3);
  assert.equal(result.cells.reduce((sum, cell) => sum + cell.orders, 0), 6);
  assert.deepEqual(result.reports.map(report => report.report_date), reportDates);
  reportDates = [2, 3, 4, 5].map(day);
  await getOHPivot(day(2), day(5));
  assert.equal(reads.length, 6, 'Overlapping periods reuse daily cache');
  await getOHPivot(day(2), day(5), true);
  assert.equal(reads.length, 10, 'Manual refresh bypasses daily cache');
  versions.set(day(2), 'updated');
  await getOHPivot(day(2), day(5));
  assert.equal(reads.length, 11, 'Revised reports invalidate only the affected day');
  reportDates = [day(7)]; failures.set(day(7), { remaining: 1, code: '57014', status: 500 });
  assert.equal((await getOHPivot(day(7), day(7))).cells.length, 1);
  assert.equal(reads.filter(value => value === day(7)).length, 2, 'Transient failures retry once');
  reportDates = [day(8)]; failures.set(day(8), { remaining: 2, code: '42501', status: 403 });
  await assert.rejects(getOHPivot(day(8), day(8)), error => error instanceof OHPivotError && error.code === '42501');
  assert.equal(reads.filter(value => value === day(8)).length, 1, 'Permission failures are not retried');
  reportDates = [day(9), day(10)]; failures.set(day(9), { remaining: 2, code: '57014', status: 500 });
  await assert.rejects(getOHPivot(day(9), day(10)), error => error.code === '57014');
  assert.equal(reads.filter(value => value === day(9)).length, 2, 'Failed periods never return partial totals');
  reportDates = [];
  assert.deepEqual(await getOHPivot(day(11), day(12)), { reports: [], cells: [] });
  metadataFailures = 1;
  const before = metadataReads;
  assert.deepEqual(await getOHPivot(day(11), day(12)), { reports: [], cells: [] });
  assert.equal(metadataReads - before, 2, 'Metadata network failures also retry once');
  console.log('OH daily batching, concurrency, overlap cache, forced refresh, bounded retry and all-or-nothing reads verified.');
})().catch(error => { console.error(error); process.exitCode = 1; });
