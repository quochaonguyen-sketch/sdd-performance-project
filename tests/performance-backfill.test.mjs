import test from 'node:test';
import assert from 'node:assert/strict';
import { missingDays } from '../scripts/backfill-performance-month.cjs';

test('backfill keeps existing dates and excludes future days', () => {
  const existing = new Set(Array.from({ length: 16 }, (_, i) => `2026-10-${i + 13}`));
  const missing = missingDays('2026-10', '2026-10-29', existing);
  assert.equal(missing.length, 13);
  assert.equal(missing[0], '2026-10-01');
  assert.equal(missing.at(-1), '2026-10-29');
  assert.ok(missing.every(day => !existing.has(day) && day <= '2026-10-29'));
});
test('backfill respects month lengths and rejects invalid months', () => {
  assert.equal(missingDays('2024-02', '2026-10-29', new Set()).length, 29);
  assert.deepEqual(missingDays('2026-11', '2026-10-29', new Set()), []);
  assert.throws(() => missingDays('2026-13', '2026-10-29', new Set()));
});
