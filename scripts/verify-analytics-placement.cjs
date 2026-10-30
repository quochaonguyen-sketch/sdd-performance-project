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
const dashboard = render(DashboardOverviewContent, { data, loading: false, updated: null, onRefresh() {} });
assert.ok(!dashboard.includes('id="onhold-overview"'));
assert.ok(!dashboard.includes('Phân bố hiệu suất rider'));
assert.ok(!dashboard.includes('Xu hướng hoàn thành'));
assert.ok(dashboard.includes('href="/onhold"'));
assert.ok(dashboard.includes('href="/performance"'));
const { OHAnalysisContent } = require('../components/onhold/oh-analysis.tsx');
const onhold = render(OHAnalysisContent, { source: { data: { reports: [], cells: [] }, error: null }, end: '2026-10-30', loading: false, onRefresh() {} });
assert.ok(onhold.includes('Phân tích Onhold'));
assert.ok(onhold.includes('Làm mới phân tích'));
assert.ok(onhold.includes('href="#onhold-details"'));
const failed = render(OHAnalysisContent, { source: { data: null, error: 'OH unavailable' }, end: '2026-10-30', loading: false, onRefresh() {} });
assert.ok(failed.includes('OH unavailable'));
assert.ok(failed.includes('Chưa có dữ liệu OH'));
const { PerformanceAnalysis } = require('../components/performance/performance-analysis.tsx');
const { buildPerformanceAnalysis } = require('../lib/performance/analysis.ts');
const totals = { delivery_assigned: 10, delivery_delivered: 8, pickup_assigned: 5, pickup_picked: 3 };
const analysis = buildPerformanceAnalysis({ daily: [{ ...totals, date: '2026-10-30', riders: 1 }], areas: [], riders: [totals] }, '2026-10-30', '2026-10-30');
const performance = render(PerformanceAnalysis, { analysis, isLoading: false, onArea() {} });
for (const label of ['Tổng hợp hiệu suất trong kỳ', '80%', '60%', 'Rider phát sinh', 'Xu hướng tỷ lệ hoàn thành', 'Phân bố hiệu suất rider']) assert.ok(performance.includes(label), label);
console.log('Dashboard links, OH analytics/error states and filtered performance totals/charts verified.');
