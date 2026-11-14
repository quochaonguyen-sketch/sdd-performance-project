import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { analysisAccess } from "../lib/ai/source-access.ts";
import { buildOperationsAnalysis, validateAnalysisScope, type AnalysisScope } from "../lib/ai/operations-analysis.ts";
import { defaultPageAccess } from "../lib/auth/page-access.ts";
import { normalizePermissions } from "../lib/auth/permissions.ts";
import { addDays } from "../lib/team/model.ts";
import type { CurrentUserContext } from "../lib/auth/current-user.ts";
import { TtlCache } from "../lib/cache/ttl-cache.ts";

function fixture(allowed?: "oh" | "returns" | "volume" | "all") {
  const pages = defaultPageAccess("member");
  for (const key of Object.keys(pages) as Array<keyof typeof pages>) pages[key] = false;
  const permissions = normalizePermissions({}, "member");
  if (allowed === "all") {
    for (const key of Object.keys(pages) as Array<keyof typeof pages>) pages[key] = true;
    for (const key of Object.keys(permissions) as Array<keyof typeof permissions>) permissions[key] = true;
  }
  if (allowed === "oh") { pages.onhold = true; permissions.manage_performance = true; }
  if (allowed === "returns") { pages.return = true; permissions.manage_return = true; }
  if (allowed === "volume") { pages.delivery_volume = true; permissions.manage_volume = true; }
  const context: CurrentUserContext = { user: { id: "test", email: "test@spxexpress.com" }, profile: { role: "member", full_name: null, page_access: pages, permissions, rider_edit_areas: [] } };
  const calls: string[] = [];
  const exports: { loadOperationsAnalysis?: (context: CurrentUserContext, scope: AnalysisScope, signal?: AbortSignal, returnOnly?: boolean) => Promise<ReturnType<typeof buildOperationsAnalysis>> } = {};
  const code = ts.transpileModule(readFileSync("lib/ai/operations-analysis-server.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, { exports, Date, Intl, AbortSignal, require(name: string) {
    if (name === "server-only") return {};
    if (name === "@/lib/cache/ttl-cache") return { TtlCache };
    if (name === "./source-access") return { analysisAccess };
    if (name === "./operations-analysis") return { buildOperationsAnalysis, validateAnalysisScope };
    if (name === "./work-date") return { todayInVietnam: () => "2026-11-02" };
    if (name === "@/lib/team/model") return { addDays };
    if (name === "@/lib/locations/operating-areas") return { OPERATING_AREAS: ["KV1", "KV2", "KV3", "KV4", "KV5"] };
    if (name === "@/lib/onhold/server") return { getOHPivot: async (from: string, to: string) => { assert.equal(from, to); calls.push("oh"); return { reports: [], cells: [] }; } };
    if (name === "@/lib/return-orders/workspace-server") return { getReturnWorkspace: async () => { calls.push("returns"); return { snapshotAt: "2026-11-02T00:00:00Z", rows: [] }; } };
    if (name === "@/lib/return-orders/history-server") return { getReturnHistory: async () => { calls.push("history"); return { days: [], groups: [] }; } };
    if (name === "@/lib/dashboard/backlog-hourly-server") return { readBacklogHourly: async () => { calls.push("backlog"); throw Error("offline"); } };
    if (name === "@/lib/pickup/realtime") return { readAllPages: async (read: (from: number, to: number) => unknown) => read(0, 999) };
    if (name === "@/lib/supabase/admin") return { createAdminClient: () => { calls.push("admin"); throw Error("unexpected privileged read"); } };
    if (name === "@/lib/supabase/server") return { createClient: async () => { calls.push("session"); throw Error("offline"); } };
    throw Error(`Unexpected dependency: ${name}`);
  } });
  return { calls, revokeOH: () => { pages.onhold = false; }, run: (returnOnly = false) => exports.loadOperationsAnalysis!(context, { from: "2026-11-01", to: "2026-11-02", area: "all", hour: 23 }, undefined, returnOnly) };
}

test("all denied analysis sources cause no admin/client/RPC/Google/Return reads", async () => {
  const f = fixture(), result = await f.run();
  assert.deepEqual(f.calls, []); assert.equal(result.sources.length, 10); assert.ok(result.sources.every(source => source.state === "forbidden"));
  assert.equal(result.daily[0].oh.orders, null); assert.equal(result.returns, null); assert.equal(result.forecast, null);
});
test("OH-only and Return-only rights read just the authorized source", async () => {
  const oh = fixture("oh"), missing = await oh.run(); assert.deepEqual(oh.calls, ["oh", "oh", "oh"]); assert.equal(missing.sources.find(source => source.id === "analysis_oh")?.state, "missing");
  const returns = fixture("returns"), empty = await returns.run(); assert.deepEqual(returns.calls, ["returns", "history"]); assert.equal(empty.returns?.total, 0); assert.equal(empty.daily[0].volume, null);
});
test("failed allowed analysis source remains an explicit error instead of a zero denominator", async () => {
  const f = fixture("volume"), result = await f.run(); assert.deepEqual(f.calls, ["session"]);
  assert.equal(result.sources.find(source => source.id === "analysis_volume")?.state, "error"); assert.equal(result.daily[0].volume, null); assert.equal(result.daily[0].oh.rate, null);
});

test("day pivots are reused briefly, but revoked source permission is checked before cached data", async () => {
  const f = fixture("oh"); await f.run(); await f.run();
  assert.equal(f.calls.length, 3);
  f.revokeOH(); const result = await f.run();
  assert.equal(f.calls.length, 3); assert.equal(result.sources.find(source => source.id === "analysis_oh")?.state, "forbidden");
  assert.equal(result.daily[0].oh.orders, null);
});

test("Return-only analysis skips unrelated sources even for accounts with all permissions", async () => {
  const f = fixture("all"), result = await f.run(true);
  assert.deepEqual(f.calls, ["returns", "history"]); assert.equal(result.sources.length, 2);
  assert.equal(result.sources[0].id, "analysis_return"); assert.equal(result.daily[0].oh.orders, null);
});
