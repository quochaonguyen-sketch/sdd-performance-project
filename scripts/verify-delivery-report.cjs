// Synthetic fixture only; no credentials or live customer data.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const ts = require('typescript');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(process.cwd(), name.slice(2)) : name, parent, ...args);
};
for (const ext of ['.ts', '.tsx']) Module._extensions[ext] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, file);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { buildDeliveryReport, reportHeat } = require('../components/lmhub-inventory/delivery-backlog-report-model.ts');
const { DeliveryBacklogReport, drawDeliveryReport } = require('../components/lmhub-inventory/delivery-backlog-report.tsx');
const districts = Array.from({ length: 5 }, (_, area) => Array.from({ length: 4 }, (_, district) => ({
  area: `KV${area + 1}`, district: ['Quận 1', 'Quận 5', 'Quận 7', 'Thủ Đức'][district], wards: [],
  totals: { cot1: district + area, cot2: (area + 1) * (district + 1) * 9, total: district + area + (area + 1) * (district + 1) * 9 },
}))).flat();
const rows = buildDeliveryReport(districts, 'all');
const props = { districts, cot: 'all', snapshotAt: '2026-10-27T10:13:04Z', scope: 'Tất cả khu vực · COT 1 + COT 2', disabled: false };
const useState = React.useState;
let hook = 0;
React.useState = (initial) => useState(hook++ === 0 ? true : initial);
const html = renderToStaticMarkup(React.createElement(DeliveryBacklogReport, props));
React.useState = useState;
assert.ok(html.includes('<table'));
assert.ok(html.includes('17:13:04'));
assert.ok(html.includes('Tải ảnh PNG'));
assert.ok(html.includes('TỔNG CỘNG'));
assert.equal((html.match(/scope="row"/g) || []).length, rows.length);
const commands = [];
const ctx = new Proxy({ measureText: (text) => ({ width: text.length * 7 }) }, {
  get: (obj, key) => key in obj ? obj[key] : (...args) => commands.push([key, ...args]),
});
const canvas = { getContext: () => ctx };
drawDeliveryReport(canvas, rows, '27/10/2026 17:13:04', props.scope);
assert.equal(canvas.width, 1916);
assert.ok(canvas.height > 2000);
assert.ok(commands.some(([type, text]) => type === 'fillText' && text === 'TỔNG CỘNG'));
assert.ok(commands.some(([type, text]) => type === 'fillText' && text === rows.at(-1).total.toLocaleString('vi-VN')));
const baseHeight = canvas.height;
drawDeliveryReport(canvas, rows, '27/10/2026 17:13:04', 'Phạm vi dài '.repeat(80));
assert.ok(canvas.height > baseHeight, 'Long filter text must not overlap the table');
console.log('Report: accessible preview, all 26 rows, Vietnam timestamp, complete PNG drawing and long scope verified.');
if (process.argv.includes('--serve')) {
  const draw = drawDeliveryReport.toString();
  const script = `const number=v=>v.toLocaleString('vi-VN');const areaLabel=v=>v.replace(/^KV/,'Khu vực ');const columns=${JSON.stringify(['Khu vực','Quận / huyện','COT 1','COT 2','Tổng tồn','Cơ cấu COT'])};const widths=[150,270,100,100,110,180];const delivery_backlog_report_model_1={reportHeat:${reportHeat.toString()}};const lmhub_inventory_model_1={deliveryDistrictLabel:v=>v==='Thủ Đức'?'Thủ Đức (cũ)':v};(${draw})(document.querySelector('canvas'),${JSON.stringify(rows)},'27/10/2026 17:13:04',${JSON.stringify(props.scope)});`;
  require('node:http').createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<html lang="vi"><title>Delivery report — dữ liệu mẫu</title><body style="margin:24px;background:#edf2f7;font:14px Arial"><p>DỮ LIỆU MẪU — kiểm tra bố cục ảnh xuất PNG</p><canvas style="width:958px;max-width:100%;height:auto;box-shadow:0 4px 20px #18324d22"></canvas><script>${script}</script></body></html>`);
  }).listen(3003, '127.0.0.1', () => console.log('Fixture: http://127.0.0.1:3003'));
}
