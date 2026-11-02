import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { briefingAccess } from "../lib/ai/source-access.ts";
import { buildBriefing } from "../lib/ai/briefing.ts";
import { defaultPageAccess } from "../lib/auth/page-access.ts";
import { normalizePermissions } from "../lib/auth/permissions.ts";
import type { CurrentUserContext } from "../lib/auth/current-user.ts";
import type { OperationsBriefing } from "../lib/ai/briefing.ts";

function fixture(allowed?: "team" | "riders") {
  const pages = defaultPageAccess("member");
  for (const key of Object.keys(pages) as Array<keyof typeof pages>) pages[key] = false;
  if (allowed) pages[allowed] = true;
  const context: CurrentUserContext = { user: { id: "test", email: "test@spxexpress.com" }, profile: { role: "member", full_name: null, page_access: pages, permissions: normalizePermissions({}, "member"), rider_edit_areas: [] } };
  const calls: string[] = [];
  const exports: { loadOperationsBriefing?: (context: CurrentUserContext) => Promise<OperationsBriefing> } = {};
  const code = ts.transpileModule(readFileSync("lib/ai/briefing-server.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, { exports, Date, Intl, AbortSignal, require(name: string) {
    if (name === "server-only") return {};
    if (name === "./source-access") return { briefingAccess };
    if (name === "./briefing") return { buildBriefing };
    if (name === "@/lib/ai/work-date") return { todayInVietnam: () => "2026-11-02" };
    if (name === "@/lib/locations/operating-areas") return { OPERATING_AREAS: ["KV1", "KV2", "KV3", "KV4", "KV5"] };
    if (name === "@/lib/team/model") return { addDays: () => "2026-11-03" };
    if (name === "@/lib/team/server") return { loadTeam: async () => { calls.push("team"); return { staff: [], shifts: [] }; } };
    if (name === "@/lib/pickup/realtime") return { readAllPages: async (read: (from: number, to: number) => unknown) => read(0, 999) };
    if (name === "@/lib/supabase/server") return { createClient: async () => { calls.push("session"); return { from(table: string) { calls.push(table); throw Error("offline"); } }; } };
    throw Error(`Forbidden or unexpected dependency: ${name}`);
  } });
  return { calls, run: () => exports.loadOperationsBriefing!(context) };
}

test("denied sources are never queried, including the privileged team/pickup loaders", async () => {
  const f = fixture(), data = await f.run();
  assert.deepEqual(f.calls, []); assert.ok(data.sources.every(s => s.state === "forbidden"));
  assert.equal(data.summary.delivery, null); assert.equal(data.summary.fteToday, null);
});

test("team-only users query only team data and retain real zero versus unavailable sources", async () => {
  const f = fixture("team"), data = await f.run();
  assert.deepEqual(f.calls, ["team"]); assert.equal(data.summary.fteToday?.total, 0);
  assert.equal(data.summary.pickup, null); assert.equal(data.summary.delivery, null);
});

test("a failed allowed source becomes an explicit error without reading denied sources", async () => {
  const f = fixture("riders"), data = await f.run();
  assert.deepEqual(f.calls, ["session", "riders"]);
  assert.equal(data.sources.find(s => s.id === "riders")?.state, "error");
  assert.equal(data.summary.delivery, null); assert.equal(data.tasks.length, 1);
});
