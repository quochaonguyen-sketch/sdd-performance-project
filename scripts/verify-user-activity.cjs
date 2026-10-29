(async () => {
  const fs = await import('node:fs'), path = await import('node:path');
  const { default: Module } = await import('node:module'), { default: ts } = await import('typescript');
  const { default: assert } = await import('node:assert/strict');
  const resolve = Module._resolveFilename, original = Module._load;
  const load = Module.createRequire(__filename);
  let context = null, authFailure = false, states = [], cursor = 0, effects = [];
  Module._resolveFilename = function(name, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(process.cwd(), name.slice(2)) : name, ...args); };
  Module._load = function(name, ...args) {
    if (name === '@/lib/auth/current-user') return { getCurrentUserContext: async () => { if (authFailure) throw Error('private backend detail'); return context; } };
    if (name === '@/lib/supabase/admin') return { createAdminClient: () => ({ from: () => ({ select() { return this; }, order() { return this; }, range: async () => ({ data: [], count: 0 }) }), rpc: async () => ({ data: [] }) }) };
    const result = original.call(this, name, ...args);
    if (name === 'react') return { ...result, useCallback: fn => fn, useEffect: fn => effects.push(fn), useState: initial => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; } };
    return result;
  };
  for (const ext of ['.ts', '.tsx']) Module._extensions[ext] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, file);
  const { GET } = load('../app/api/admin/activity/route.ts');
  const request = () => new Request('http://localhost/api/admin/activity');
  assert.equal((await GET(request())).status, 401);
  context = { profile: { role: 'member' } };
  assert.equal((await GET(request())).status, 403);
  authFailure = true;
  const failed = await GET(request());
  assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes('private backend detail'));
  authFailure = false; context = { profile: { role: 'admin' } };
  const success = await GET(request());
  assert.equal(success.status, 200);
  assert.equal(success.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual((await success.json()).events, []);

  const { UserActivityView } = load('../components/settings/user-activity-view.tsx');
  const text = node => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);
  for (const [status, body, expected] of [[404, '<!DOCTYPE html><html>not found</html>', 'Chưa tải được nhật ký'], [401, '<html>login</html>', 'Phiên đăng nhập đã hết hạn'], [200, '{"events":null,"members":[],"total":0}', 'Dữ liệu nhật ký không hợp lệ'], [200, '{"events":[],"members":[],"total":0}', null]]) {
    states = []; cursor = 0; effects = [];
    global.fetch = async () => new Response(body, { status });
    UserActivityView();
    const cleanup = effects[0]();
    await new Promise(resolve => setImmediate(resolve));
    cursor = 0;
    const output = text(UserActivityView());
    if (expected) { assert.ok(states[6].includes(expected)); assert.ok(!output.includes('Chưa có hoạt động khớp bộ lọc')); }
    else { assert.equal(states[6], null); assert.ok(output.includes('Chưa có hoạt động khớp bộ lọc')); }
    assert.ok(!output.includes('Unexpected token'));
    cleanup();
  }
  console.log('Activity API: JSON auth/outage responses, admin permissions, private cache. UI: HTML/expired session/invalid payload handled; failed reads never appear as empty logs.');
})().catch(error => { console.error(error); process.exitCode = 1; });
