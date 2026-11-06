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

const { BacklogHistoryView, loadBacklogHistory } = require('../components/lmhub-inventory/backlog-history-view.tsx');
const { BacklogTrendChart } = require('../components/lmhub-inventory/backlog-hourly-charts.tsx');
const initial = render(BacklogHistoryView, {});
for (const text of ['Backlog History', 'Theo khu vực', 'Diễn biến tồn trong ngày']) assert.ok(initial.includes(text), text);
for (const text of ['Đối chiếu', 'Phường còn tồn', 'Mốc A', 'Mốc B', 'Chọn giờ để đối chiếu']) assert.ok(!initial.includes(text), text);
const hours = Array.from({length:24}, (_,hour) => ({ hour, snapshot_id:hour===0?'fixture':null, is_final:hour===0, status:hour===0?'CAPTURED':'MISSED', areas:hour===0?[{area:'KV1',cot1:0,cot2:0,other:0,orders:0}]:[] }));
const fixture = { source:'pickup', day:'2026-11-06', hours, checkpoints:[] };
const chart = render(BacklogTrendChart, {daily:{pickup:fixture},active:'pickup',cot:'orders',area:'',selected:0,onSelect(){}});
assert.ok(chart.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').includes('0 đơn'));
assert.ok(!chart.includes('Mốc B'));
const originalFetch=global.fetch, requests=[];
global.fetch=async input=>{
 const url=new URL(input,'http://localhost');requests.push(url);
 return url.searchParams.get('source')==='pickup'?Response.json(fixture):Response.json({error:'Fixture unavailable'},{status:503});
};
(async()=>{
 try {
  const result=await loadBacklogHistory('2026-11-06',new AbortController().signal);
  assert.equal(requests.length,2);
  for(const url of requests){assert.equal(url.searchParams.get('mode'),'hourly');assert.equal(url.searchParams.get('day'),'2026-11-06');assert.equal(url.searchParams.has('snapshot'),false);}
  assert.equal(result.daily.pickup.hours[0].areas[0].orders,0);
  assert.equal(result.daily.delivery,undefined);
  assert.equal(result.errors.length,1);
  assert.match(result.errors[0],/Delivery/);
  console.log('Backlog simplified layout, removed comparisons, captured zero and independent source failures verified.');
 } finally {global.fetch=originalFetch;}
})().catch(error=>{console.error(error);process.exitCode=1;});
