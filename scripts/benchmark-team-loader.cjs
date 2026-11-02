// Read-only timing of the real loader; prints counts, never staff details or credentials.
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS hook matches the server's alias resolution. */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
Module._resolveFilename = function(name, parent, ...args) {
  return originalResolve.call(this, name.startsWith('@/') ? path.join(process.cwd(), name.slice(2)) : name, parent, ...args);
};
Module._load = function(name, ...args) { return name === 'server-only' ? {} : originalLoad.call(this, name, ...args); };
Module._extensions['.ts'] = function(mod, file) {
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, file);
};
(async () => {
  const { loadTeam } = require('../lib/team/server.ts');
  const times = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    const data = await loadTeam('2026-10-01', '2026-10-31');
    const ms = Math.round(performance.now() - start);
    times.push(ms);
    console.log(JSON.stringify({ run: i + 1, ms, staff: data.staff.length, shifts: data.shifts.length }));
  }
  console.log(JSON.stringify({ medianMs: times.sort((a, b) => a - b)[1] }));
})().catch(() => { console.error('Team benchmark failed; check database connectivity/configuration.'); process.exitCode = 1; });
