import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { TtlCache } from "../lib/cache/ttl-cache.ts";

function fixture({ signedIn = true, allowed = true, snapshotId = "snap-123", rows = [], fail = false }: {
  signedIn?: boolean;
  allowed?: boolean;
  snapshotId?: string | null;
  rows?: any[];
  fail?: boolean;
} = {}) {
  let headReads = 0;
  const exports: { GET?: (request: Request) => Promise<Response> } = {};
  const code = ts.transpileModule(readFileSync("app/api/inventory-delivery/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;

  const mockAdmin = {
    from(table: string) {
      assert.equal(table, "lmhub_inventory_rows");
      return {
        select(cols: string, opts?: { count?: string; head?: boolean }) {
          if (opts?.head) {
            return {
              in() { return this; },
              eq: async () => ({ count: rows.length, error: fail ? { message: "db error" } : null }),
            };
          }
          return {
            in() { return this; },
            order() { return this; },
            limit() { return this; },
            eq() { return this; },
            range: async () => ({
              data: rows,
              error: fail ? { message: "db error" } : null,
            }),
            maybeSingle: async () => {
              headReads++;
              return {
                data: snapshotId ? { snapshot_id: snapshotId, snapshot_at: "2026-11-07T05:00:00Z" } : null,
                error: fail ? { message: "db error" } : null,
              };
            },
          };
        },
      };
    },
  };

  runInNewContext(code, {
    exports,
    URL,
    Date,
    Response,
    Headers,
    console,
    Promise,
    Math,
    String,
    Number,
    Boolean,
    Array,
    Map,
    Set,
    Error,
    require(name: string) {
      if (name === "next/server") {
        return {
          NextResponse: {
            json: (body: any, init?: any) => new Response(JSON.stringify(body), {
              status: init?.status ?? 200,
              headers: new Headers(init?.headers ?? { "content-type": "application/json" }),
            }),
          },
        };
      }
      if (name === "@/lib/auth/current-user") {
        return { getCurrentUserContext: async () => signedIn ? { profile: { role: "member", permissions: {} } } : null };
      }
      if (name === "@/lib/auth/permissions") {
        return { canAccessPickupManagement: () => allowed };
      }
      if (name === "@/lib/locations/operating-areas") {
        return { OPERATING_AREAS: ["KV1", "KV2", "KV3", "KV4", "KV5"] };
      }
      if (name === "@/lib/supabase/admin") {
        return { createAdminClient: () => mockAdmin };
      }
      if (name === "@/lib/cache/ttl-cache") {
        return { TtlCache };
      }
      if (name === "@/components/lmhub-inventory/lmhub-inventory-model") {
        return {
          COLUMNS: "shipment_id,area,district,ward,cot_group,zone_id,order_type,status,received_time,snapshot_id,snapshot_at",
          PAGE_ROWS: 1000,
          normalizeRow: (r: any) => r,
          deliveryInventoryRows: (r: any) => r,
        };
      }
      throw new Error(`Unexpected require: ${name}`);
    },
  });

  return {
    run: (url = "http://localhost/api/inventory-delivery") => exports.GET!(new Request(url)),
    headReads: () => headReads,
  };
}

test("inventory-delivery API requires authentication and pickup permissions", async () => {
  for (const opt of [{ signedIn: false }, { allowed: false }]) {
    const f = fixture(opt);
    const res = await f.run();
    assert.equal(res.status, opt.signedIn === false ? 401 : 403);
    assert.equal(f.headReads(), 0);
  }
});

test("inventory-delivery head check returns snapshot info without fetching rows", async () => {
  const f = fixture({ snapshotId: "snap-abc" });
  const res = await f.run("http://localhost/api/inventory-delivery?head=1");
  assert.equal(res.status, 200);
  const json = await res.json() as any;
  assert.equal(json.success, true);
  assert.equal(json.snapshotId, "snap-abc");
  assert.equal(json.rows, undefined);
  assert.equal(f.headReads(), 1);
});

test("inventory-delivery caches snapshot payload and serves subsequent requests from cache", async () => {
  const sampleRow = { shipment_id: "VN123", area: "KV1", district: "Quận 1", ward: "Phường 1" };
  const f = fixture({ snapshotId: "snap-cache-test", rows: [sampleRow] });

  // First request: MISS
  const res1 = await f.run("http://localhost/api/inventory-delivery");
  assert.equal(res1.status, 200);
  assert.equal(res1.headers.get("X-Data-Cache"), "MISS");
  const json1 = await res1.json() as any;
  assert.equal(json1.success, true);
  assert.equal(json1.rows.length, 1);

  // Second request: HIT
  const res2 = await f.run("http://localhost/api/inventory-delivery");
  assert.equal(res2.status, 200);
  assert.equal(res2.headers.get("X-Data-Cache"), "HIT");
});
