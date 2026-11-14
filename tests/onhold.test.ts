import test from 'node:test';
import assert from 'node:assert/strict';
import { ohRange, ohWeekRange, ohPivotIndex, ohSummary, ohRankings, resolveOHRiders, reasonName, reasonNameVi, type OHCell } from '../lib/onhold/model.ts';
import { packOHPivot, unpackOHPivot } from '../lib/onhold/transport.ts';

test('compact pivot preserves filtered totals, names, blank values and date order', () => {
  const first: OHCell = { report_date: '2026-11-01', area: 'Khu vực 1', reason: '169', hour: -1, status: 5, orders: 2, rider_name: 'Nguyễn Văn A', ward: '' };
  const cells = [first, { ...first, report_date: '2026-11-02', status: 1 as const, rider_code: '000123' }];
  const packed = packOHPivot({ reports: [], cells });
  const restored = unpackOHPivot(JSON.parse(JSON.stringify(packed)));
  assert.deepEqual(JSON.parse(JSON.stringify(restored.cells)), cells);
  assert.deepEqual(ohRankings(restored.cells, 'rider'), ohRankings(cells, 'rider'));
  assert.deepEqual(ohPivotIndex(restored.cells), ohPivotIndex(cells));
});

test('missing rider IDs use names and exact unique directory matches without inventing identities', () => {
  const directory = [{ rider_code: 'R1', rider_name: 'Nguyễn Văn A' }, { rider_code: 'R2', rider_name: 'Trần Văn B' }, { rider_code: 'R3', rider_name: 'Trần Văn B' }];
  const rows = resolveOHRiders([
    { rider_code: '0', rider_name: ' nguyễn  văn a ' },
    { rider_code: 'R1', rider_name: 'Chưa rõ rider' },
    { rider_code: 'unknown', rider_name: 'Trần Văn B' },
    { rider_code: 'unknown', rider_name: 'Chưa rõ rider' },
    { rider_code: 'R9', rider_name: 'Unknown' },
    { rider_code: 'R9', rider_name: 'Tên từ nguồn OH' },
  ], directory);
  assert.equal(rows[0].rider_code, 'R1');
  assert.equal(rows[1].rider_name, 'Nguyễn Văn A');
  assert.equal(rows[2].rider_code, 'unknown', 'Duplicate names cannot be assigned an arbitrary ID');
  assert.equal(rows[2].rider_name, 'Trần Văn B');
  assert.equal(rows[3].rider_name, 'Chưa rõ rider', 'No name can be inferred without either identity');
  assert.equal(rows[4].rider_name, 'Tên từ nguồn OH');
});

test('rider ranking recovers a later name for the same ID and retains name-only orders', () => {
  const row: OHCell = { report_date: '2026-11-06', area: 'Khu vực 1', reason: '169', hour: 10, status: 5, orders: 2, rider_code: 'R1', rider_name: 'Chưa rõ rider' };
  const rows = [row, { ...row, rider_name: 'Tên rider' }, { ...row, rider_code: '0', rider_name: ' tên RIDER ' }];
  const ranks = ohRankings(rows, 'rider');
  assert.equal(ranks.length, 1);
  assert.equal(ranks[0].name, 'Tên rider');
  assert.equal(ranks[0].orders, 6);
  assert.equal(ohSummary(rows).total, ranks[0].orders);
});

test('ISO week selection handles year boundaries, invalid weeks and current partial week', () => {
  assert.deepEqual(ohWeekRange('2026-W45', '2026-11-06'), { from: '2026-11-02', to: '2026-11-06' });
  assert.deepEqual(ohWeekRange('2026-W44', '2026-11-06'), { from: '2026-10-26', to: '2026-11-01' });
  assert.deepEqual(ohWeekRange('2026-W01', '2026-11-06'), { from: '2025-12-29', to: '2026-01-04' });
  assert.deepEqual(ohWeekRange('2020-W53', '2021-01-04'), { from: '2020-12-28', to: '2021-01-03' });
  for (const week of ['', '2026-W00', '2025-W53', '2026-W54', '2026-W46']) assert.throws(() => ohWeekRange(week, '2026-11-06'));
});

test('indexed pivot preserves daily totals across areas, reasons, hours and statuses', () => {
  const base: OHCell = { report_date: '2026-11-01', area: 'Khu vực 1', reason: '169', hour: 10, status: 5, orders: 2 };
  const cells: OHCell[] = [base, { ...base, reason: '170', hour: 12, status: 1, orders: 3 }, { ...base, area: 'Chưa rõ KV', orders: 4 }, { ...base, report_date: '2026-11-02', orders: 7 }];
  const index = ohPivotIndex(cells);
  assert.equal(index.get('2026-11-01')?.get('Khu vực 1'), 5);
  assert.equal(index.get('2026-11-01')?.get('Chưa rõ KV'), 4);
  assert.equal(index.get('2026-11-02')?.get('Khu vực 1'), 7);
  assert.equal(index.get('2026-11-03'), undefined);
  assert.equal([...index.values()].reduce((n, areas) => n + [...areas.values()].reduce((sum, count) => sum + count, 0), 0), ohSummary(cells).total);
});

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

  const riderRankings = ohRankings(rows, 'rider');
  const r2 = riderRankings.find(r => r.detail === 'R2');
  assert.equal(r2?.area, 'Khu vực 1');
  assert.equal(r2?.district, 'Quận 2');
  assert.equal(r2?.ward, 'Phường A');
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
