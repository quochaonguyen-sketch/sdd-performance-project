// Isolated read-only route benchmark. Auth is mocked only inside this VM, never in the app.
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS transpilation hook. */
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const ts = require('typescript'), { runInNewContext } = require('node:vm');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const routes = { pickup: 'app/api/pickup-realtime/route.ts', operations: 'app/api/dashboard/operations/route.ts', volume: 'app/api/dashboard/volume/route.ts' };
const target = process.argv[2] ?? 'pickup';
if (!(target in routes)) throw Error('Choose pickup, operations or volume');
const originalResolve = Module._resolveFilename, originalLoad = Module._load;
Module._resolveFilename = function(name, parent, ...args) {
  return originalResolve.call(this, name.startsWith('@/') ? path.join(process.cwd(), name.slice(2)) : name, parent, ...args);
};
Module._load = function(name, ...args) { return name === 'server-only' ? {} : originalLoad.call(this, name, ...args); };
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
Module._extensions['.ts'] = (mod, file) => mod._compile(compile(fs.readFileSync(file, 'utf8')), file);
const nativeFetch = global.fetch;
let requests = [];
global.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? input.toString());
  const start = performance.now();
  const response = await nativeFetch(input, init);
  requests.push({ source: url.pathname.split('/').at(-1), ms: Math.round(performance.now() - start), status: response.status });
  return response;
};
function loadRoute(source) {
 const route = {};
 runInNewContext(compile(source), {
  exports: route, Date, Intl, Response, performance,
  require(name) {
    if (name === 'next/server') return { NextResponse: Response };
    if (name === '@/lib/auth/current-user') return { getCurrentUserContext: async () => ({ user: { id: 'benchmark' }, profile: { role: 'admin', permissions: {} } }) };
    if (name === '@/lib/supabase/server') return { createClient: async () => require('../lib/supabase/admin.ts').createAdminClient() };
    return require(name);
  },
});
 return route;
}
(async () => {
  const file = routes[target];
  const versions = process.argv.includes('--compare') ? ['before', 'after'] : ['after'];
  let baseline;
  for (const version of versions) {
   const source = version === 'before' ? execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' }) : fs.readFileSync(file, 'utf8');
   const route = loadRoute(source);
   for (let run = 1; run <= (versions.length === 2 ? 1 : 3); run++) {
    requests = []; const start = performance.now();
    const response = await route.GET(new Request('http://localhost/benchmark', { headers: { 'x-dashboard-refresh': '1' } }));
    const data = await response.json();
    if (!response.ok || data.success === false || data.live?.error || data.backlog?.error || data.delivery?.error || data.pickup?.error) throw Error('Data read failed');
    const digest = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    if (version === 'before') baseline = digest;
    console.log(JSON.stringify({ target, version, run, ms: Math.round(performance.now() - start), riders: data.riders?.length, summary: data.summary?.length, sameOutput: baseline ? baseline === digest : undefined, requests }));
    if (baseline && baseline !== digest) throw Error('Output changed; check whether the source snapshot changed during measurement');
   }
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
