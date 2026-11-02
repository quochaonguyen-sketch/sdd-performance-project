import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { resolveWorkDateScope } from "../lib/ai/work-date.ts";
import { analysisScopeForQuestion, isReturnOnlyAnalysis, needsOperationsAnalysis } from "../lib/ai/operations-analysis.ts";

function fixture() {
  let verified = true, legacyAllowed = false, briefingReads = 0, legacyReads = 0, analysisReads = 0;
  let provider: { messages: Array<{ role: string; content: string }> } | null = null;
  const preference = { select() { return preference; }, eq() { return preference; }, maybeSingle: async () => ({ data: { memory_enabled: false }, error: null }) };
  const client = { auth: { getUser: async () => ({ data: { user: { id: "test" } } }) }, from(name: string) { assert.equal(name, "ai_user_preferences"); return preference; } };
  const exports: { POST?: (request: Request) => Promise<Response> } = {};
  const code = ts.transpileModule(readFileSync("app/api/ai/chat/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, { exports, Response, TextDecoder, TextEncoder, ReadableStream, DOMException, AbortSignal, Date,
    process: { env: { SHOPAIKEY_API_KEY: "test-key", SHOPAIKEY_BASE_URL: "https://example.invalid/v1" } },
    fetch: async (_url: string, init: RequestInit) => {
      provider = JSON.parse(String(init.body));
      return new Response('data: {"choices":[{"delta":{"content":"27 FTE, ngày 2026-11-03."}}]}\n\ndata: [DONE]\n');
    },
    require(name: string) {
      if (name === "next/server") return { NextResponse: Response };
      if (name === "zod") return { z };
      if (name === "@/lib/supabase/server") return { createClient: async () => client };
      if (name === "@/lib/supabase/admin") return { createAdminClient: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }) };
      if (name === "@/lib/auth/current-user") return { getCurrentUserContext: async () => verified ? { user: { id: "test" }, profile: {} } : null };
      if (name === "@/lib/ai/source-access") return { canReadLegacyAiContext: () => legacyAllowed };
      if (name === "@/lib/ai/operations-analysis") return { analysisScopeForQuestion, isReturnOnlyAnalysis, needsOperationsAnalysis };
      if (name === "@/lib/ai/operations-analysis-server") return { loadOperationsAnalysis: async (_context: unknown, scope: unknown) => { analysisReads++; return { scope, generatedAt: "2026-11-02T03:00:00Z", sources: [{ id: "analysis_oh", state: "ready" }, { id: "analysis_return", state: "forbidden" }], daily: [] }; } };
      if (name === "@/lib/ai/operations-context") return { loadAiOperationsContext: async () => { legacyReads++; throw Error("legacy read must be gated"); } };
      if (name === "@/lib/ai/work-date") return { todayInVietnam: () => "2026-11-02", resolveWorkDateScope: () => resolveWorkDateScope("2026-11-02") };
      if (name === "@/lib/ai/briefing-server") return { loadOperationsBriefing: async () => { briefingReads++; return { generatedAt: "2026-11-02T03:00:00Z", day: "2026-11-02", sources: [{ id: "team", state: "ready" }, { id: "pickup", state: "forbidden" }], summary: { fteTomorrow: { date: "2026-11-03", working: 27 } } }; } };
      throw Error(name);
    },
  });
  return { run: (body: unknown) => exports.POST!(new Request("http://localhost/api/ai/chat", { method: "POST", body: JSON.stringify(body) })),
    analysisReads: () => analysisReads,
    provider: () => provider, reads: () => ({ briefingReads, legacyReads }), revoke: () => { verified = false; }, allowLegacy: () => { legacyAllowed = true; } };
}
const body = { messages: [{ role: "user", content: "Ngày mai có bao nhiêu FTE đi làm?" }], includeData: true, contextMode: "operations" };

test("AI chat streams through the configured provider with server-loaded facts and only readable source headers", async () => {
  const f = fixture(), response = await f.run(body);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-rider-ops-data-sources"), "team");
  assert.match(await response.text(), /27 FTE/);
  assert.deepEqual(f.reads(), { briefingReads: 1, legacyReads: 0 });
  const context = f.provider()!.messages.find(message => message.content.startsWith("RIDER_OPS_DATA_CONTEXT"));
  assert.ok(context?.content.includes('"working":27')); assert.ok(context?.content.includes("2026-11-03"));
});

test("AI chat fails closed when fresh context verification fails or legacy combined sources are forbidden", async () => {
  const revoked = fixture(); revoked.revoke(); assert.equal((await revoked.run(body)).status, 401);
  assert.equal(revoked.provider(), null); assert.equal(revoked.reads().briefingReads, 0);
  const legacy = fixture(); assert.equal((await legacy.run({ ...body, contextMode: "page" })).status, 403);
  assert.equal(legacy.provider(), null); assert.equal(legacy.reads().legacyReads, 0);
});

test("turning data off performs no operations or legacy data reads", async () => {
  const f = fixture(), response = await f.run({ ...body, includeData: false });
  assert.equal(response.status, 200); await response.text();
  assert.deepEqual(f.reads(), { briefingReads: 0, legacyReads: 0 });
  assert.ok(!f.provider()!.messages.some(message => message.content.startsWith("RIDER_OPS_DATA_CONTEXT")));
});

test("historical OH questions use bounded analysis scope without live-briefing fallback", async () => {
  const f = fixture(), response = await f.run({ ...body, messages: [{ role: "user", content: "Phân tích OH từ 26/10/2026 đến 01/11/2026 KV2" }] });
  assert.equal(response.status, 200); await response.text();
  assert.equal(f.analysisReads(), 1); assert.equal(f.reads().briefingReads, 0);
  assert.equal(response.headers.get("x-rider-ops-data-sources"), "analysis_oh");
  const context = f.provider()!.messages.find(message => message.content.startsWith("RIDER_OPS_DATA_CONTEXT"))!.content;
  assert.match(context, /operations_analysis/); assert.match(context, /2026-10-26/); assert.match(context, /KV2/);
  assert.ok(f.provider()!.messages[0].content.includes("Delivery Volume cùng ngày"));
});

test("invalid analysis scope returns a clear 400 before provider or data reads", async () => {
  const f = fixture(), response = await f.run({ ...body, messages: [{ role: "user", content: "Backlog 60 ngày" }] });
  assert.equal(response.status, 400); assert.equal(f.analysisReads(), 0); assert.equal(f.provider(), null);
});

test("follow-up accepts a long prior assistant report while user input stays limited to 4000 chars", async () => {
  const f = fixture();
  const response = await f.run({ ...body, messages: [{ role: "assistant", content: "x".repeat(6000) }, ...body.messages] });
  assert.equal(response.status, 200); await response.text();
  assert.equal((await f.run({ ...body, messages: [{ role: "user", content: "x".repeat(4001) }] })).status, 400);
});
