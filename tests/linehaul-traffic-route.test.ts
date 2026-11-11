import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { canViewPage } from "../lib/auth/page-access.ts";
import { assertEtaSnapshot, LinehaulEtaError } from "../lib/linehaul/traffic-eta.ts";

function fixture() {
  let signedIn = true, pageAllowed = true, permission = true, missing = false, stale = false, reads = 0, providerCalls = 0;
  const exports: { GET?: (request: Request) => Promise<Response> } = {};
  const code = ts.transpileModule(readFileSync("app/api/linehaul/eta/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  runInNewContext(code, { exports, URL, Response, Date, require(name: string) {
    if (name === "@/lib/auth/current-user") return { getCurrentUserContext: async () => signedIn ? { profile: { role: "member", page_access: { linehaul: pageAllowed }, permissions: { manage_dashboard: permission } } } : null };
    if (name === "@/lib/auth/page-access") return { canViewPage };
    if (name === "@/lib/data-sources/catalog") return { vietnamDay: () => "2026-11-02" };
    if (name === "@/lib/linehaul/traffic-eta") return { assertEtaSnapshot, LinehaulEtaError };
    if (name === "@/lib/linehaul/traffic-server") return { getLinehaulEta: async (trip: { lat: number }) => { providerCalls++; assert.equal(trip.lat, 10.9); return { arrivalAt: "2026-11-02T16:00:00+07:00" }; } };
    if (name === "@/lib/supabase/admin") return { createAdminClient: () => ({ from: (table: string) => { assert.equal(table, "linehaul_snapshots"); reads++; return { select() { return this; }, eq(key: string, value: string) { assert.ok(key === "station_id" && value === "4232" || key === "report_date" && value === "2026-11-02"); return this; }, maybeSingle: async () => ({ data: { snapshot_at: new Date(Date.now() - (stale ? 11 * 60_000 : 1000)).toISOString(), trips: missing ? [] : [{ trip_id: "123", lat: 10.9 }] }, error: null }) }; } }) };
    throw Error(name);
  } });
  return { run: (query = "trip_id=123") => exports.GET!(new Request(`http://localhost/api/linehaul/eta?${query}`)), reads: () => reads, calls: () => providerCalls,
    signedOut: () => { signedIn = false; }, noPage: () => { pageAllowed = false; }, noPermission: () => { permission = false; }, missing: () => { missing = true; }, stale: () => { stale = true; } };
}
test("ETA verifies authentication, page and business permissions before any snapshot or provider reads", async () => {
  for (const deny of ["signedOut", "noPage", "noPermission"] as const) {
    const f = fixture(); f[deny](); assert.equal((await f.run()).status, deny === "signedOut" ? 401 : 403); assert.equal(f.reads(), 0); assert.equal(f.calls(), 0);
  }
});
test("malformed IDs, absent trips and stale source never call the ETA service", async () => {
  const bad = fixture(); assert.equal((await bad.run("trip_id=../x")).status, 400); assert.equal(bad.reads(), 0);
  const missing = fixture(); missing.missing(); assert.equal((await missing.run()).status, 404); assert.equal(missing.calls(), 0);
  const stale = fixture(); stale.stale(); assert.equal((await stale.run()).status, 409); assert.equal(stale.calls(), 0);
});
test("ETA takes coordinates from today's server snapshot, ignores client coordinate/URL injection and stays private", async () => {
  const f = fixture(), response = await f.run("trip_id=123&lat=999&url=http://attacker");
  assert.equal(response.status, 200); assert.equal(f.calls(), 1); assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.ok((await response.json()).arrivalAt);
});
