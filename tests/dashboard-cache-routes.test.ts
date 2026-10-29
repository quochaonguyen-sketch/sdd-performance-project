import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { TtlCache } from "../lib/cache/ttl-cache.ts";
import { summarizeHubRoster } from "../lib/dashboard/hub-roster.ts";
import { summarizeRiderHiring } from "../lib/dashboard/rider-hiring.ts";

function route(file: string, mocks: Record<string, unknown>, fetcher?: typeof fetch) {
  const exports: { GET?: (request: Request) => Promise<Response> } = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, { exports, require: (name: string) => {
    if (name === "next/server") return { NextResponse: Response };
    if (name === "@/lib/cache/ttl-cache") return { TtlCache };
    if (!(name in mocks)) throw Error(`Unexpected dependency: ${name}`);
    return mocks[name];
  }, Request, Response, URL, Date, Intl, AbortSignal, fetch: fetcher });
  return exports.GET!;
}
const request = (force = false) => new Request("http://localhost/api/test", { headers: force ? { "x-dashboard-refresh": "1" } : {} });

test("OH route checks access before cache, bypasses on refresh and retries failures", async () => {
  let context: { user: { id: string }; profile: { role: string; permissions: { manage_performance: boolean } } } | null = { user: { id: "a" }, profile: { role: "admin", permissions: { manage_performance: true } } };
  let reads = 0, fail = false;
  const get = route("app/api/onhold/route.ts", {
    "@/lib/auth/current-user": { getCurrentUserContext: async () => context },
    "@/lib/data-sources/catalog": { vietnamDay: () => "2026-10-29" },
    "@/lib/onhold/model": { ohRange: () => {} },
    "@/lib/onhold/server": { getOHPivot: async () => { reads++; if (fail) throw Error("offline"); return { orders: reads }; } },
  });
  assert.equal((await get(request())).headers.get("X-Data-Cache"), "MISS");
  assert.equal((await get(request())).headers.get("X-Data-Cache"), "HIT");
  assert.equal(reads, 1);
  context = null;
  assert.equal((await get(request())).status, 401);
  context = { user: { id: "a" }, profile: { role: "member", permissions: { manage_performance: false } } };
  assert.equal((await get(request())).status, 403);
  context.profile.role = "admin";
  fail = true;
  assert.equal((await get(request(true))).status, 503);
  fail = false;
  assert.equal((await get(request())).headers.get("X-Data-Cache"), "MISS");
  assert.equal(reads, 3);
  context.user.id = "b";
  assert.equal((await get(request())).headers.get("X-Data-Cache"), "MISS");
});

test("Sheet caches expire independently, share reads and recalculate shifts from cached roster", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-29T08:59:30+07:00") });
  const reads = { hub: 0, roster: 0, fc: 0 };
  const grid = [["station_id", "event_date_iso", "shift_date_iso", "shift", "planned_people", "actual_people", "actual_fte", "actual_os", "actual_bpo"], ["1", "2026-10-29", "2026-10-29", "08:00-09:00", 2, 2, 2, 0, 0]];
  const get = route("app/api/dashboard/hub-sheet/route.ts", {
    "@/lib/auth/current-user": { getCurrentUserContext: async () => ({ user: { id: "a" } }) },
    "@/lib/google/off-schedule": { googleSheetsAccessToken: async () => "test-token" },
    "@/lib/dashboard/hub-sheet": { HUB_SHEET_ID: "test", parseHubSheet: () => ({ stations: [{ stationId: "1" }] }) },
    "@/lib/dashboard/hub-roster": { summarizeHubRoster },
    "@/lib/dashboard/hub-fc": { parseHubFc: () => ({ rows: [] }) },
  }, (async url => {
    const path = decodeURIComponent(String(url));
    const key = path.includes("Roster") ? "roster" : path.includes("FC!") ? "fc" : "hub";
    reads[key]++;
    return Response.json({ values: key === "roster" ? grid : [] });
  }) as typeof fetch);
  const [first] = await Promise.all([get(request()), get(request())]);
  assert.equal((await first.json()).roster.data.active.actual_people, 2);
  assert.deepEqual(reads, { hub: 1, roster: 1, fc: 1 });
  t.mock.timers.tick(60_001);
  assert.equal((await (await get(request())).json()).roster.data.active.actual_people, 0);
  assert.deepEqual(reads, { hub: 2, roster: 1, fc: 1 });
  t.mock.timers.tick(240_000);
  await get(request());
  assert.deepEqual(reads, { hub: 3, roster: 2, fc: 1 });
  t.mock.timers.tick(600_000);
  await get(request());
  assert.deepEqual(reads, { hub: 4, roster: 3, fc: 2 });
  await get(request(true));
  assert.deepEqual(reads, { hub: 5, roster: 4, fc: 3 });
});

test("Riders hiring reads are authenticated, cached and explicitly refreshable; failed reads retry",async()=>{
 let signedIn=true,reads=0,fail=false;
 const grid=[["Driver ID","Tên tài xế","Khu vực","COT","Quận lấy","Phường lấy","Quận giao","Phường giao","Ngày nhận việc"],["123","Test","KV1","COT1","","","","","10/01/2026"]];
 const get=route("app/api/riders/hiring/route.ts",{
  "@/lib/auth/current-user":{getCurrentUserContext:async()=>signedIn?{user:{id:"a"}}:null},
  "@/lib/google/off-schedule":{googleSheetsAccessToken:async()=>"test-token"},
  "@/lib/google/rider-plan":{RIDER_PLAN_ID:"test"},
  "@/lib/dashboard/rider-hiring":{summarizeRiderHiring},
 },(async()=>{reads++;return fail?new Response("offline",{status:503}):Response.json({values:grid});}) as typeof fetch);
 assert.equal((await get(request())).headers.get("X-Data-Cache"),"MISS");
 assert.equal((await get(request())).headers.get("X-Data-Cache"),"HIT");assert.equal(reads,1);
 signedIn=false;assert.equal((await get(request())).status,401);assert.equal(reads,1);
 signedIn=true;fail=true;assert.equal((await get(request(true))).status,503);
 fail=false;assert.equal((await get(request())).headers.get("X-Data-Cache"),"MISS");assert.equal(reads,3);
});
