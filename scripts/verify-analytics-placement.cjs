// Render the analytics destinations and dashboard with fixtures; no live data needed.
/* eslint-disable @typescript-eslint/no-require-imports -- Match the project's CommonJS verification scripts. */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args);
};
for (const ext of ['.ts', '.tsx']) Module._extensions[ext] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, file);
Module._extensions['.css'] = mod => { mod.exports = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }; };
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const { DashboardOverviewContent } = require('../components/dashboard/operations-dashboard.tsx');
const data = Object.fromEntries(['operations', 'pickup', 'pickupBacklog', 'volume'].map(key => [key, { data: null, error: null }]));
data.noOrders = { data: { asOf: '2026-10-30', windowStart: '2026-10-01', rows: [{ riderCode: 'R1', riderName: 'Rider A', area: 'KV1', cot: 'COT2', days: 30, since: '2026-10-01' }] }, error: null };
const dashboardProps = { data, loading: false, updated: null, onRefresh() {} };
const dashboard = render(DashboardOverviewContent, dashboardProps);
assert.ok(!dashboard.includes('id="onhold-overview"'));
assert.ok(!dashboard.includes('Phân bố hiệu suất rider'));
assert.ok(!dashboard.includes('Xu hướng hoàn thành'));
assert.ok(dashboard.includes('href="/onhold"'));
assert.ok(dashboard.includes('href="/performance"'));
assert.ok(dashboard.includes('href="#volume-overview">Volume &amp; FC'));
assert.ok(!dashboard.includes('href="#fc-overview"'));
const fcPosition = dashboard.indexOf('id="fc-overview"');
const volumePosition = dashboard.indexOf('id="volume-overview"');
const livePosition = dashboard.indexOf('<h2>Live Operations</h2>');
assert.ok(volumePosition >= 0 && fcPosition > volumePosition && livePosition > fcPosition);
assert.ok(dashboard.indexOf('id="rider-no-orders"') > dashboard.indexOf('<h2>Area Overview</h2>'));
assert.ok(dashboard.includes('href="#rider-no-orders"'));
assert.ok(dashboard.includes('Rider không phát sinh đơn'));
assert.ok(dashboard.includes('Rider A'));
assert.ok(dashboard.includes('≥30 ngày'));
assert.ok(dashboard.includes('01/10/2026'));
assert.ok(dashboard.includes('30/10/2026'));
assert.ok(!dashboard.includes('Rider đã nghỉ việc'));
assert.ok(!dashboard.includes('#rider-churn'));
const unavailable = render(DashboardOverviewContent, { ...dashboardProps, data: { ...data, noOrders: { data: null, error: 'Bạn chưa có quyền xem mục này.' } } });
assert.ok(!unavailable.includes('Rider A'));
assert.ok(unavailable.includes('Bạn chưa có quyền xem mục này.'));
const { DashboardFc } = require('../components/dashboard/dashboard-fc.tsx');
const { parseHubFc } = require('../lib/dashboard/hub-fc.ts');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const yesterday = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
const nextDay = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10);
const fcComparison = render(DashboardFc, {
  source: { data: parseHubFc([['Date', 'Day', 'HCM MP', 'HCM WH', 'HCM Total'], [yesterday, 'Yesterday', 500, 500, 1000], [today, 'Today', 500, 500, 1000], [nextDay, 'Tomorrow', 400, 400, 800]]), error: null },
  hub: { date: today, totals: { lm_hub_inbounded_order_qty_eod: 777 }, inboundByDate: { [yesterday]: 900 } },
});
assert.ok(fcComparison.includes('FC so với thực tế'));
assert.ok(fcComparison.includes('FC theo tháng'));
assert.match(fcComparison, new RegExp(`<input[^>]+type="date"[^>]+value="${yesterday}"`));
assert.ok(!fcComparison.includes('Hôm nay, tạm tính'));
assert.ok(fcComparison.includes('-100'));
assert.ok(fcComparison.includes('-10%'));
assert.equal((fcComparison.match(/data-selected="true"/g) ?? []).length, 1);
const fcWithoutHistory = render(DashboardFc, {
  source: { data: parseHubFc([['Date', 'Day', 'HCM MP', 'HCM WH', 'HCM Total'], [yesterday, 'Yesterday', 500, 500, 1000]]), error: null },
  hub: { date: today, totals: { lm_hub_inbounded_order_qty_eod: 777 } },
});
assert.ok(fcWithoutHistory.includes('Chưa có Inbound thực tế cho ngày này.'));
assert.ok(!fcWithoutHistory.includes('777'));
const fcLoading = render(DashboardFc, {});
assert.ok(fcLoading.includes('Đang tải dự báo FC và sản lượng thực tế'));
assert.ok(!fcLoading.includes('<select'));
const fcUnavailable = render(DashboardFc, {
  source: { data: null, error: 'Nguồn FC chưa khả dụng.' },
  hub: { date: yesterday, totals: { lm_hub_inbounded_order_qty_eod: 900 } },
});
assert.ok(fcUnavailable.includes('Nguồn FC chưa khả dụng.'));
assert.ok(fcUnavailable.includes('900'));
const { OHAnalysisContent } = require('../components/onhold/oh-analysis.tsx');
const onhold = render(OHAnalysisContent, { source: { data: { reports: [], cells: [] }, error: null }, end: '2026-10-30', loading: false, onRefresh() {} });
assert.ok(onhold.includes('Phân tích Onhold'));
assert.ok(onhold.includes('Làm mới phân tích'));
assert.ok(onhold.includes('href="#onhold-details"'));
const failed = render(OHAnalysisContent, { source: { data: null, error: 'OH unavailable' }, end: '2026-10-30', loading: false, onRefresh() {} });
assert.ok(failed.includes('OH unavailable'));
assert.ok(failed.includes('Chưa có dữ liệu OH'));
const { OHWorkspace } = require('../components/onhold/oh-workspace.tsx');
const fixtureCell = { report_date: '2026-10-28', area: 'Khu vực 1', district: 'Quận A', ward: 'Phường A', rider_code: 'R1', rider_name: 'Rider A', reason: '169', status: 5, hour: 10, orders: 3 };
const workspace = render(OHWorkspace, { from: '2026-10-28', today: '2026-10-30', initialData: {
  reports: ['2026-10-28', '2026-10-29'].map(report_date => ({ report_date, fetched_at: `${report_date}T10:00:00Z`, total_orders: 3, input_count: 3, excluded_count: 0 })),
  cells: [fixtureCell, { ...fixtureCell, report_date: '2026-10-29', status: 1, orders: 4 }],
} });
assert.ok(workspace.includes('28/10/2026 – 30/10/2026'));
assert.ok(workspace.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').includes('7 lượt OH'));
assert.ok(workspace.includes('Rider A'));
assert.ok(workspace.includes('Phường A'));
assert.ok(!workspace.includes('<dialog'), 'Closed dialogs must not build their rows');
const { OHFullRankingsDialog } = require('../components/onhold/oh-full-rankings-dialog.tsx');
const rankings = render(OHFullRankingsDialog, { isOpen: true, onClose() {}, day: '2026-10-28 → 2026-10-30', areaFilter: 'all', totalOrders: 120, wards: [], districts: [], riders: Array.from({ length: 120 }, (_, i) => ({ key: `${i}`, name: `Fixture rider ${String(i).padStart(3, '0')}`, detail: `R${i}`, orders: 1 })) });
assert.ok(rankings.includes('Fixture rider 049'));
assert.ok(!rankings.includes('Fixture rider 050'), 'Rankings render only the current page');
const { PerformanceAnalysis } = require('../components/performance/performance-analysis.tsx');
const { buildPerformanceAnalysis } = require('../lib/performance/analysis.ts');
const totals = { delivery_assigned: 10, delivery_delivered: 8, pickup_assigned: 5, pickup_picked: 3 };
const analysis = buildPerformanceAnalysis({ daily: [{ ...totals, date: '2026-10-30', riders: 1 }], areas: [], riders: [totals] }, '2026-10-30', '2026-10-30');
const performance = render(PerformanceAnalysis, { analysis, isLoading: false, onArea() {} });
for (const label of ['Tổng hợp hiệu suất trong kỳ', '80%', '60%', 'Rider phát sinh', 'Xu hướng tỷ lệ hoàn thành', 'Phân bố hiệu suất rider']) assert.ok(performance.includes(label), label);
console.log('Dashboard links, OH analytics/error states and filtered performance totals/charts verified.');
