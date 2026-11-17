import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { TtlCache } from "../lib/cache/ttl-cache.ts";
import { summarizeHubRoster } from "../lib/dashboard/hub-roster.ts";
import { shiftVolumeDay, summarizeDashboardVolume } from "../lib/dashboard/volume-overview.ts";
import { summarizeRiderHiring } from "../lib/dashboard/rider-hiring.ts";
import { packOHPivot } from "../lib/onhold/transport.ts";

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
    "@/lib/onhold/server": { OHPivotError: class extends Error {}, getOHPivot: async () => { reads++; if (fail) throw Error("offline"); return { reports: [], cells: [] }; } },
    "@/lib/onhold/transport": { packOHPivot },
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
  const compact = new Request("http://localhost/api/onhold?format=compact");
  assert.deepEqual(await (await get(compact)).json(), { reports: [], dictionary: [], rows: [] });
  assert.equal((await get(compact)).headers.get("X-Data-Cache"), "HIT");
  await get(request(true));
  assert.equal((await get(compact)).headers.get("X-Data-Cache"), "MISS");
});

test("Sheet caches expire independently, share reads and recalculate shifts from cached roster", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-29T08:59:30+07:00") });
  const reads = { hub: 0, roster: 0, fc: 0 };
  const parsed = { hub: 0, fc: 0 };
  const grid = [["station_id", "event_date_iso", "shift_date_iso", "shift", "planned_people", "actual_people", "actual_fte", "actual_os", "actual_bpo"], ["1", "2026-10-29", "2026-10-29", "08:00-09:00", 2, 2, 2, 0, 0]];
  const get = route("app/api/dashboard/hub-sheet/route.ts", {
    "@/lib/auth/current-user": { getCurrentUserContext: async () => ({ user: { id: "a" } }) },
    "@/lib/google/off-schedule": { googleSheetsAccessToken: async () => "test-token" },
    "@/lib/dashboard/hub-sheet": { HUB_SHEET_ID: "test", parseHubSheet: () => { parsed.hub++; return { stations: [{ stationId: "1" }] }; } },
    "@/lib/dashboard/hub-roster": { summarizeHubRoster },
    "@/lib/dashboard/hub-fc": { parseHubFc: () => { parsed.fc++; return { rows: [], checkedAt: new Date().toISOString() }; } },
  }, (async url => {
    const path = decodeURIComponent(String(url));
    const key = path.includes("Roster") ? "roster" : path.includes("FC!") ? "fc" : "hub";
    reads[key]++;
    return Response.json({ values: key === "roster" ? grid : [] });
  }) as typeof fetch);
  const [first] = await Promise.all([get(request()), get(request())]);
  const initial = await first.json();
  assert.equal(initial.roster.data.active.actual_people, 2);
  assert.deepEqual(reads, { hub: 1, roster: 1, fc: 1 });
  t.mock.timers.tick(60_001);
  const refreshed = await (await get(request())).json();
  assert.equal(refreshed.roster.data.active.actual_people, 0);
  assert.equal(refreshed.fc.data.checkedAt, initial.fc.data.checkedAt);
  assert.deepEqual(reads, { hub: 2, roster: 1, fc: 1 });
  t.mock.timers.tick(240_000);
  await get(request());
  assert.deepEqual(reads, { hub: 3, roster: 2, fc: 1 });
  t.mock.timers.tick(600_000);
  await get(request());
  assert.deepEqual(reads, { hub: 4, roster: 3, fc: 2 });
  await get(request(true));
  assert.deepEqual(reads, { hub: 5, roster: 4, fc: 3 });
  assert.deepEqual(parsed, { hub: 5, fc: 3 });
});

test("Volume reads grouped totals in one caller-session request and falls back to source rows", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-17T09:00:00+07:00") });
  const today = "2026-11-17";
  const rows = [
    { source: "delivery", report_date: today, area: "KV1", total_orders: 100 },
    { source: "pickup", report_date: "2026-10-30", area: "KV5", total_orders: 300 },
  ];
  let signedIn = true;
  let useRpc = true;
  let reads = 0;
  let clients = 0;
  let fallbackReads = 0;
  const db = {
    async rpc(name: string, params: { p_today: string }) {
      reads++;
      assert.equal(name, "dashboard_volume_daily");
      assert.equal(params.p_today, today);
      return useRpc ? { data: rows, error: null } : { data: null, error: { code: "PGRST202" } };
    },
    from(table: "delivery_order" | "pickup_volume") {
      fallbackReads++;
      const row = rows[table === "delivery_order" ? 0 : 1];
      return {
        select() { return this; }, in() { return this; }, lte() { return this; }, gte() { return this; }, order() { return this; }, limit() { return this; },
        maybeSingle: async () => ({ data: { report_date: row.report_date }, error: null }),
        range: async () => ({ data: [row], error: null }),
      };
    },
  };
  const get = route("app/api/dashboard/volume/route.ts", {
    "@/lib/auth/current-user": { getCurrentUserContext: async () => signedIn ? { user: { id: "a" }, profile: { role: "member" } } : null },
    "@/lib/supabase/server": { createClient: async () => { clients++; return db; } },
    "@/lib/locations/operating-areas": { OPERATING_AREAS: ["KV1", "KV2", "KV3", "KV4", "KV5"] },
    "@/lib/pickup/realtime": { readAllPages: async (page: (from: number, to: number) => ReturnType<ReturnType<typeof db.from>["range"]>) => (await page(0, 999)).data },
    "@/lib/dashboard/volume-overview": { shiftVolumeDay, summarizeDashboardVolume },
  });
  const grouped = await (await get(request())).json();
  assert.equal(grouped.delivery.data.latest.total, 100);
  assert.equal(grouped.pickup.data.latest.date, "2026-10-30");
  assert.equal(grouped.pickup.data.daily.at(-1).total, null);
  assert.equal(fallbackReads, 0);

  assert.equal((await get(request())).headers.get("X-Data-Cache"), "HIT");
  assert.equal(reads, 1);
  assert.equal(clients, 1);

  signedIn = false;
  assert.equal((await get(request())).status, 401);
  assert.equal(reads, 1);
  signedIn = true;
  useRpc = false;
  assert.deepEqual(await (await get(request(true))).json(), grouped);
  assert.equal(fallbackReads, 4);
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
