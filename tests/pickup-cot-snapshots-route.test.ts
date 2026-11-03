import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function fixture({ signedIn = true, allowed = true, fail = false } = {}) {
  let reads = 0;
  const exports: { GET?: (request: Request) => Promise<Response> } = {};
  const code = ts.transpileModule(readFileSync("app/api/pickup-realtime/cot-snapshots/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const query = {
    select() { return this; },
    eq(column: string, day: string) { assert.equal(column, "report_date"); assert.equal(day, "2026-11-03"); return this; },
    order: async () => ({ data: [], error: fail ? { message: "private-db-error" } : null }),
  };
  runInNewContext(code, { exports, URL, Date, Response, require(name: string) {
    if (name === "@/lib/auth/current-user") return { getCurrentUserContext: async () => signedIn ? { profile: { role: "member", permissions: {} } } : null };
    if (name === "@/lib/auth/permissions") return { canAccessPickupManagement: () => allowed };
    if (name === "@/lib/data-sources/catalog") return { vietnamDay: () => "2026-11-03" };
    if (name === "@/lib/supabase/admin") return { createAdminClient: () => { reads++; return { from(table: string) { assert.equal(table, "pickup_cot_oh_snapshots"); return query; } }; } };
    throw Error(name);
  } });
  return { run: (day = "2026-11-03") => exports.GET!(new Request(`http://localhost/api/pickup-realtime/cot-snapshots?date=${day}`)), reads: () => reads };
}
test("COT OH history checks login and pickup permission before reading private history", async () => {
  for (const options of [{ signedIn: false }, { allowed: false }]) {
    const f = fixture(options); assert.equal((await f.run()).status, options.signedIn === false ? 401 : 403); assert.equal(f.reads(), 0);
  }
});
test("COT OH history rejects invalid/future dates before I/O and keeps missing snapshots distinct from zero", async () => {
  const f = fixture();
  for (const day of ["2026-02-30", "2026-11-04", "bad", "2026-1-1"]) assert.equal((await f.run(day)).status, 400);
  assert.equal(f.reads(), 0);
  const response = await f.run(); assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { day: "2026-11-03", snapshots: [] });
});
test("COT OH history errors never expose database internals or masquerade as empty success", async () => {
  const response = await fixture({ fail: true }).run(); assert.equal(response.status, 503); assert.ok(!(await response.text()).includes("private-db-error"));
});
