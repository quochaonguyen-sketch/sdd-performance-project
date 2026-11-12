/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS runner for the Windows worker. */
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { createInterface } = require('node:readline');
const { loadEnvConfig } = require('@next/env');
const { createClient } = require('@supabase/supabase-js');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
loadEnvConfig(root, true);

function loadTypeScript(relative) {
  const filename = path.join(root, relative);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return mod.exports;
}

const { parseLostSheet, reconcileLostRow, lostSerialEpoch } = loadTypeScript('lib/lost/model.ts');
const { googleSheetsAccessToken } = loadTypeScript('lib/google/off-schedule.ts');
const { HUB_SHEET_ID } = loadTypeScript('lib/dashboard/hub-sheet.ts');
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(40_000) }) },
});

async function run(query, label) {
  const { data, error } = await query;
  if (error) throw Error(`${label} (${error.code || 'kết nối'}).`);
  return data;
}

async function loadSheet() {
  const token = await googleSheetsAccessToken();
  const range = encodeURIComponent("'LOST'!A:K");
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${HUB_SHEET_ID}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw Error(`Không đọc được tab LOST (Google ${response.status}).`);
  return parseLostSheet((await response.json()).values ?? []);
}

async function writeChecks(records) {
  for (let i = 0; i < records.length; i += 100) {
    await run(db.from('lost_spx_checks').upsert(records.slice(i, i + 100)), 'Chưa lưu được kết quả tra SPX');
  }
}

async function importPrevious(file, checks) {
  const XLSX = require('xlsx');
  const workbook = XLSX.readFile(file);
  const sheet = workbook.Sheets.LOST;
  if (!sheet) throw Error('File đối soát cũ thiếu tab LOST.');
  const [header, ...rows] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
  if (!header || header[5] !== 'Shipment ID' || header[13] !== 'Tên rider' || header[17] !== 'Rider log lỗi mới nhất') {
    throw Error('File đối soát cũ thiếu cột rider hoặc log.');
  }
  const seeded = [];
  for (const row of rows) {
    const check = checks.get(String(row[5] ?? '').trim().toUpperCase());
    if (!check) continue;
    let changed = false;
    const code = /\((4|39)\)$/.exec(String(row[14] ?? ''))?.[1];
    if (check.tracking === null && code && row[13] && typeof row[15] === 'number') {
      check.tracking = [{ status: Number(code), at: lostSerialEpoch(row[15]), station: code === '39' ? 4232 : 0, code: String(row[12] ?? ''), rider: String(row[13]) }];
      changed = true;
    }
    const matched = /^Khớp (\d+) log$/.exec(String(row[21] ?? ''));
    if (check.logs === null && (matched || ['Không có log lỗi', 'Không có log khớp'].includes(row[21]))) {
      const items = [];
      if (matched) {
        if (!row[17] || typeof row[18] !== 'number') throw Error('File đối soát cũ có log thiếu rider hoặc giờ.');
        items.push({ rider: row[17], at: lostSerialEpoch(row[18]), error: String(row[19] ?? '') });
        for (const line of String(row[20] ?? '').split('\n').filter(Boolean)) {
          const parts = /^(.+) \((\d{2})\/(\d{2})\/(\d{4}),? (\d{2}:\d{2}:\d{2})\)$/.exec(line);
          if (!parts) throw Error('File đối soát cũ có giờ log bổ sung không hợp lệ.');
          const [, rider, d, m, y, time] = parts;
          items.push({ rider, at: Date.parse(`${y}-${m}-${d}T${time}+07:00`) / 1000, error: '' });
        }
      }
      check.logs = { items, matchedCount: Number(matched?.[1] ?? 0) };
      changed = true;
    }
    if (changed) seeded.push(check);
  }
  await writeChecks(seeded);
  return seeded.length;
}

async function lookupMissing(jobs, checks) {
  if (!jobs.length) return { received: 0, failures: 0, reasons: {} };
  const worker = process.env.LOST_SPX_WORKER_ROOT || path.resolve(root, '..', 'sdd-web-data');
  const python = process.env.LOST_SPX_PYTHON || path.join(worker, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (!fs.existsSync(python)) throw Error('Không tìm thấy Python của worker SPX.');
  const child = spawn(python, ['-B', '-X', 'utf8', '-c', "import runpy,sys; runpy.run_path(sys.argv[1], run_name='__main__')", path.join(__dirname, 'lost-spx.py')], {
    cwd: worker, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const exit = new Promise(resolve => {
    child.once('error', () => resolve(-1));
    child.once('close', resolve);
  });
  child.stderr.resume();
  child.stdin.on('error', () => {});
  child.stdin.end(JSON.stringify(jobs));
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const timeout = setTimeout(() => child.kill(), 9 * 60_000);
  const pending = [];
  const seen = new Set();
  const reasons = {};
  let failures = 0;
  try {
    for await (const line of lines) {
      const result = JSON.parse(line);
      const check = checks.get(result.shipment_id);
      if (!check || seen.has(result.shipment_id)) throw Error('Worker SPX trả kết quả trùng hoặc sai mã.');
      seen.add(result.shipment_id);
      if (Array.isArray(result.tracking)) check.tracking = result.tracking;
      if (Array.isArray(result.logs?.items)) check.logs = result.logs;
      if (result.errors?.length) {
        failures += 1;
        for (const reason of result.errors) reasons[reason] = (reasons[reason] ?? 0) + 1;
      }
      if (check.tracking !== null || check.logs !== null) pending.push(check);
      if (pending.length >= 20) await writeChecks(pending.splice(0));
    }
    await writeChecks(pending);
    if (await exit !== 0 || seen.size !== jobs.length) throw Error('Worker SPX dừng trước khi tra đủ đơn. Kiểm tra phiên SPX trên máy worker.');
    return { received: seen.size, failures, reasons };
  } finally {
    clearTimeout(timeout);
    lines.close();
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

async function main() {
  const lease = randomUUID();
  const now = new Date();
  const target = db.from('lost_report');
  const claimed = await run(target.update({ lease_id: lease, lease_until: new Date(+now + 11 * 60_000).toISOString() })
    .eq('id', true).or(`report_day.is.null,report_day.lt.${day}`).or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`).select('id').maybeSingle(), 'Chưa mở được lượt đồng bộ LOST');
  if (!claimed) {
    console.log('LOST đã đồng bộ trong ngày hoặc đang có lượt chạy. Không gọi SPX.');
    return;
  }
  const report = () => db.from('lost_report');
  try {
    const source = await loadSheet();
    const shipments = [...new Set(source.map(row => row.shipment))].filter(id => /^VN[A-Z0-9]{3,40}$/.test(id));
    const checks = new Map(shipments.map(shipment_id => [shipment_id, { shipment_id, tracking: null, logs: null }]));
    for (let i = 0; i < shipments.length; i += 120) {
      const existing = await run(db.from('lost_spx_checks').select('shipment_id,tracking,logs').in('shipment_id', shipments.slice(i, i + 120)), 'Chưa đọc được các đơn đã tra');
      for (const row of existing) checks.set(row.shipment_id, row);
    }
    const seedPath = process.argv[2];
    const seeded = seedPath ? await importPrevious(path.resolve(seedPath), checks) : 0;
    const jobs = [...checks.values()].filter(check => check.tracking === null || check.logs === null).map(check => ({
      shipment_id: check.shipment_id, tracking: check.tracking === null, logs: check.logs === null,
    }));
    console.log(JSON.stringify({ rows: source.length, seeded, alreadyChecked: shipments.length - jobs.length, requests: { tracking: jobs.filter(job => job.tracking).length, logs: jobs.filter(job => job.logs).length } }));
    const lookup = await lookupMissing(jobs, checks);
    const rows = source.map(row => reconcileLostRow(row, checks.get(row.shipment)));
    const data = await run(report().update({ rows, synced_at: new Date().toISOString(), report_day: day,
      lease_id: null, lease_until: null, last_error: lookup.failures ? `${lookup.failures} đơn còn phần tra cứu SPX chưa hoàn tất.` : null,
    }).eq('id', true).eq('lease_id', lease).select('id').maybeSingle(), 'Chưa đăng được dữ liệu LOST');
    if (!data) throw Error('Lượt đồng bộ LOST đã hết hiệu lực.');
    console.log(JSON.stringify({ published: rows.length, completed: rows.filter(row => row.trackingChecked && row.logsChecked).length,
      eventMatched: rows.filter(row => row.event).length, withLogs: rows.filter(row => row.logs.length).length, ...lookup }));
  } catch (error) {
    await report().update({ lease_id: null, lease_until: null, last_error: 'Lượt đồng bộ gần nhất gặp lỗi. Kiểm tra log đồng bộ trên máy worker.' }).eq('id', true).eq('lease_id', lease);
    throw error;
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Lỗi đồng bộ LOST.'); process.exitCode = 1; });
