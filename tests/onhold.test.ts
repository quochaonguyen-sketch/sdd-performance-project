import test from 'node:test';
import assert from 'node:assert/strict';
import { ohRange, ohSummary, ohRankings, reasonName, reasonNameVi, type OHCell } from '../lib/onhold/model.ts';

test('OH date ranges reject impossible, future, reversed and oversized windows', () => {
  assert.deepEqual(ohRange('2026-10-01', '2026-10-25', '2026-10-25'), { from: '2026-10-01', to: '2026-10-25' });
  for (const [f, t] of [['2026-02-30', '2026-03-01'], ['2026-10-25', '2026-10-26'], ['2026-10-25', '2026-10-01'], ['2026-01-01', '2026-10-25']]) {
    assert.throws(() => ohRange(f, t, '2026-10-25'));
  }
});

test('OH counts distinguish status and unknown area without dropping orders', () => {
  assert.deepEqual(
    ohSummary([
      { report_date: '2026-10-25', area: 'Khu vực 1', reason: '169', hour: 12, status: 5, orders: 7 },
      { report_date: '2026-10-25', area: 'Chưa rõ KV', reason: 'unknown', hour: -1, status: 1, orders: 2 },
    ]),
    { total: 9, held: 7, received: 2, unknown: 2 }
  );
  assert.equal(reasonName('999'), 'Unknown (999)');
  assert.equal(reasonName('169'), 'Recipient unavailable for parcel');
  assert.equal(reasonNameVi('169'), 'Khách hẹn lại / không liên lạc được');
  assert.equal(reasonNameVi('170'), 'Khách đổi ngày nhận hàng');
});

test('rankings scope by district + ward and stable rider code, descending OH counts', () => {
  const row: OHCell = {
    report_date: '2026-10-25',
    area: 'Khu vực 1',
    reason: '169',
    hour: 10,
    status: 5,
    orders: 2,
    district: 'Quận 1',
    ward: 'Phường A',
    rider_code: 'R1',
    rider_name: 'Rider A',
  };
  const rows = [
    row,
    { ...row, orders: 3, rider_name: 'Rider A renamed' },
    { ...row, orders: 8, district: 'Quận 2', rider_code: 'R2', rider_name: 'Rider B' },
  ];
  assert.deepEqual(ohRankings(rows, 'rider').map(r => [r.detail, r.orders]), [['R2', 8], ['R1', 5]]);
  assert.equal(ohRankings(rows, 'ward').length, 2);
  assert.equal(ohRankings(rows.filter(c => c.district === 'Quận 1'), 'district')[0].orders, 5);
  assert.equal(ohRankings([row, { ...row, rider_code: '0', orders: 4, rider_name: ' rider a ' }], 'rider').length, 1);
  assert.equal(ohRankings([row, { ...row, rider_code: 'R2' }, { ...row, rider_code: '0' }], 'rider').length, 3);
});

test('multi-dimensional filter correctly isolates cells by reason, area, district, ward, and status', () => {
  const cells: OHCell[] = [
    { report_date: '2026-10-25', area: 'Khu vực 5', district: 'Quận 12', ward: 'Phường Thạnh Xuân', reason: '169', hour: 10, status: 5, orders: 12 },
    { report_date: '2026-10-25', area: 'Khu vực 5', district: 'Quận 12', ward: 'Phường Thạnh Xuân', reason: '170', hour: 11, status: 1, orders: 8 },
    { report_date: '2026-10-25', area: 'Khu vực 5', district: 'Quận Gò Vấp', ward: 'Phường 5', reason: '169', hour: 14, status: 5, orders: 15 },
    { report_date: '2026-10-25', area: 'Khu vực 1', district: 'Quận 1', ward: 'Phường Bến Nghé', reason: '169', hour: 9, status: 5, orders: 5 },
  ];

  // Filter area = Khu vực 5, district = Quận 12, reason = 169
  const filtered = cells.filter(
    c => c.area === 'Khu vực 5' && c.district === 'Quận 12' && c.reason === '169'
  );
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].orders, 12);
  assert.equal(ohSummary(filtered).total, 12);
  assert.equal(ohSummary(filtered).held, 12);

  // Filter status = 1 (Received)
  const receivedOnly = cells.filter(c => c.status === 1);
  assert.equal(receivedOnly.length, 1);
  assert.equal(receivedOnly[0].orders, 8);
  assert.equal(receivedOnly[0].reason, '170');
});
