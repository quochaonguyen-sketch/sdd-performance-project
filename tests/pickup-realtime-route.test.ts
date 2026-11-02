import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { buildPickupRealtime, readAllPages } from "../lib/pickup/realtime.ts";

function fixture(current = true, aligned = true) {
  let signedIn = true, permitted = true, fail = "", clients = 0;
  const calls: string[] = [];
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  const live = [{ driver_id: "123", area: "KV1", zones: "Z1", assigned_orders: 3, total_pickup_quantity: 2, onhold_orders: 0 }];
  const groups = [{ driver_id: "123", khu_vuc: "Z1", ward: "W1", ward_area: "KV1", assigned_orders: 3, picked_orders: 2 }];
  const profiles = [{ rider_code: "123", full_name: "Test Rider", kv: "KV1", cot: "COT 1", status: "active" }];
  const summary = [{ khu_vuc: "Z1", ward: "W1", area: "KV1", assign_orders: 3, picked_orders: 2 }];
  const stamp = new Date().toISOString();
  const db = {
    from(table: string) {
      let paged = false;
      const query = {
        select() { return query; }, order() { return query; }, limit() { return query; },
        eq() { return query; }, maybeSingle() { return query; }, returns() { return query; },
        range() { paged = true; return query; },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          calls.push(`${table}:${paged ? "rows" : "head"}`);
          return ready.then(() => {
            if (fail === table) return { data: null, error: { message: "offline" } };
            if (table === "pickup_realtime_current") return { data: current ? { snapshot_id: "s1", snapshot_at: stamp, source_date: "2000-01-01", riders: live, groups } : null, error: null };
            if (table === "riders") return { data: profiles, error: null };
            if (!paged) return { data: [{ snapshot_id: table === "pickup_48h_rider_groups" && !aligned ? "old" : "s1", snapshot_at: stamp }], error: null };
            return { data: table === "pickup_48h_summary_groups" ? summary : table === "pickup_48h_realtime_riders" ? live : groups, error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
    rpc(_name: string, args: { p_status: string }) {
      calls.push(args.p_status);
      return Promise.resolve({ data: { rows: [], snapshotAt: stamp }, error: fail === "inventory" ? { message: "offline" } : null });
    },
  };
  const exports: { GET?: () => Promise<Response> } = {};
  const source = ts.transpileModule(readFileSync("app/api/pickup-realtime/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(source, { exports, Date, Intl, require: (name: string) => {
    if (name === "next/server") return { NextResponse: Response };
    if (name === "@/lib/auth/current-user") return { getCurrentUserContext: async () => signedIn ? { profile: { role: "member", permissions: {} } } : null };
    if (name === "@/lib/auth/permissions") return { canAccessPickupManagement: () => permitted };
    if (name === "@/lib/supabase/admin") return { createAdminClient: () => { clients++; return db; } };
    if (name === "@/lib/pickup/realtime") return { buildPickupRealtime, readAllPages };
    throw Error(name);
  } });
  return { run: () => exports.GET!(), release, calls, expected: () => buildPickupRealtime(profiles, live, groups, summary),
    state: () => clients, signOut: () => { signedIn = false; }, deny: () => { permitted = false; }, fail: (table: string) => { fail = table; } };
}

test("pickup authorizes before database access", async () => {
  for (const status of [401, 403]) {
    const f = fixture(); if (status === 401) f.signOut(); else f.deny();
    assert.equal((await f.run()).status, status); assert.equal(f.state(), 0);
  }
});

test("pickup inventory starts before snapshot metadata, avoids unused legacy reads and preserves full-fleet output", async () => {
  const f = fixture(), pending = f.run();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.calls.includes("Assigned") && f.calls.includes("Pickup Onhold"));
  f.release(); const response = await pending, data = await response.json();
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(data.riders, f.expected().riders); assert.deepEqual(data.summary, f.expected().summary);
  assert.equal(data.riderStale, true); assert.equal(data.riderSource, "sdd-web-data");
  assert.ok(!f.calls.some(call => /pickup_48h_(realtime_riders|rider_groups)/.test(call)));
});

test("legacy pickup fallback retains matching groups and excludes mismatched snapshots", async () => {
  for (const aligned of [true, false]) {
    const f = fixture(false, aligned); f.release(); const data = await (await f.run()).json();
    assert.equal(data.success, true); assert.equal(data.riderSource, "legacy");
    assert.equal(data.snapshotsAligned, aligned);
    assert.equal(data.riders[0].groups.length, aligned ? 1 : 0);
  }
});

test("pickup read errors never return a successful partial snapshot", async () => {
  for (const table of ["pickup_realtime_current", "riders", "pickup_48h_summary_groups", "inventory"]) {
    const f = fixture(); f.fail(table); f.release();
    const response = await f.run(); assert.equal(response.status, 500); assert.equal((await response.json()).success, false);
  }
});
