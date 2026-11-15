import test from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { resolveWorkDateScope } from "../lib/ai/work-date.ts";
import { analysisScopeForQuestion, isReturnOnlyAnalysis, needsOperationsAnalysis } from "../lib/ai/operations-analysis.ts";
import { findMatchingRiders } from "../lib/ai/rider-matcher.ts";

type ProviderPayload = { messages: Array<{ role: string; content: string }> };

function fixture(reply?: (payload: ProviderPayload, init: RequestInit) => Promise<Response>) {
  let verified = true, legacyAllowed = false, briefingReads = 0, legacyReads = 0, analysisReads = 0;
  let provider: ProviderPayload | null = null;
  const account = new AsyncLocalStorage<string>();
  function clientForAccount() {
    const id = account.getStore()!;
    const preference = {
      select() { return preference; },
      eq(column: string, value: string) {
        assert.equal(column, "user_id");
        assert.equal(value, id);
        return preference;
      },
      maybeSingle: async () => ({ data: { memory_enabled: false }, error: null }),
    };
    return { auth: { getUser: async () => ({ data: { user: { id } } }) }, from(name: string) { assert.equal(name, "ai_user_preferences"); return preference; } };
  }
  const exports: { POST?: (request: Request) => Promise<Response> } = {};
  const code = ts.transpileModule(readFileSync("app/api/ai/chat/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, { exports, Response, TextDecoder, TextEncoder, ReadableStream, DOMException, AbortSignal, AbortController, setTimeout, clearTimeout, Date,
    process: { env: { SHOPAIKEY_API_KEY: "test-key", SHOPAIKEY_BASE_URL: "https://example.invalid/v1" } },
    fetch: async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(String(init.body)) as ProviderPayload;
      provider = payload;
      if (reply) return reply(payload, init);
      return new Response('data: {"choices":[{"delta":{"content":"27 FTE, ngày 2026-11-03."}}]}\n\ndata: [DONE]\n');
    },
    require(name: string) {
      if (name === "next/server") return { NextResponse: Response };
      if (name === "zod") return { z };
      if (name === "@/lib/supabase/server") return { createClient: async () => clientForAccount() };
      if (name === "node:timers/promises") return { setTimeout: sleep };
      if (name === "@/lib/supabase/admin") return { createAdminClient: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }) };
      if (name === "@/lib/auth/current-user") return { getCurrentUserContext: async () => verified ? { user: { id: "test" }, profile: {} } : null };
      if (name === "@/lib/ai/source-access") return { canReadLegacyAiContext: () => legacyAllowed };
      if (name === "@/lib/ai/operations-analysis") return { analysisScopeForQuestion, isReturnOnlyAnalysis, needsOperationsAnalysis };
      if (name === "@/lib/ai/operations-analysis-server") return { loadOperationsAnalysis: async (_context: unknown, scope: unknown) => { analysisReads++; return { scope, generatedAt: "2026-11-02T03:00:00Z", sources: [{ id: "analysis_oh", state: "ready" }, { id: "analysis_return", state: "forbidden" }], daily: [] }; } };
      if (name === "@/lib/ai/operations-context") return { loadAiOperationsContext: async () => { legacyReads++; throw Error("legacy read must be gated"); } };
      if (name === "@/lib/ai/work-date") return { todayInVietnam: () => "2026-11-02", resolveWorkDateScope: () => resolveWorkDateScope("2026-11-02") };
      if (name === "@/lib/ai/briefing-server") return { loadOperationsBriefing: async () => { briefingReads++; return { generatedAt: "2026-11-02T03:00:00Z", day: "2026-11-02", sources: [{ id: "team", state: "ready" }, { id: "pickup", state: "forbidden" }], summary: { fteTomorrow: { date: "2026-11-03", working: 27 } } }; } };
      if (name === "@/lib/ai/wh-context") return { isWhTrackingQuery: (q: string) => /iphone/i.test(q), loadWhOperationsContext: async () => ({ report_date: "2026-11-02", total_orders: 10, snapshot_at: "2026-11-02T03:00:00Z" }) };
      if (name === "@/lib/ai/rider-lookup") return { lookupRidersContext: async () => [] };
      if (name === "@/lib/ai/ward-volume-lookup") return {
        isVolumeQuery: (q: string) => /volume|giao/i.test(q),
        lookupWardVolumeContext: async () => ({
          is_target_ward: true,
          district: "Quận Gò Vấp",
          ward: "Phường 5",
          date_range: { start: "2026-11-01", end: "2026-11-08", label: "2026-11-01..2026-11-08" },
          totals: { delivery: 4788, pickup: 0 },
          daily_breakdown: [{ date: "2026-11-08", delivery: 372, pickup: 0 }],
        }),
      };
      throw Error(name);
    },
  });
  return { run: (body: unknown, userId = "test", signal?: AbortSignal) => account.run(userId, () =>
    exports.POST!(new Request("http://localhost/api/ai/chat", { method: "POST", body: JSON.stringify(body), signal }))),
    analysisReads: () => analysisReads,
    provider: () => provider, reads: () => ({ briefingReads, legacyReads }), revoke: () => { verified = false; }, allowLegacy: () => { legacyAllowed = true; } };
}
const body = { messages: [{ role: "user", content: "Ngày mai có bao nhiêu FTE đi làm?" }], includeData: true, contextMode: "operations" };

test("two accounts overlap at the provider with independent prompts and cancellation", { timeout: 2_000 }, async () => {
  const bothStarted = Promise.withResolvers<void>();
  const active = new Map<string, AbortSignal>();
  let attemptsA = 0;
  const f = fixture(async (payload, init) => {
    const question = payload.messages.at(-1)!.content;
    if (question === "cau-hoi-A" && ++attemptsA === 1) {
      return new Response(null, { status: 429, headers: { "Retry-After": "0" } });
    }
    active.set(question, init.signal!);
    if (active.size === 2) bothStarted.resolve();
    await bothStarted.promise;
    return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: question } }] })}\n\ndata: [DONE]\n`);
  });
  const first = new AbortController();
  const ask = (content: string, user: string, signal?: AbortSignal) => f.run({
    ...body, includeData: false, messages: [{ role: "user", content }],
  }, user, signal);
  const [replyA, replyB] = await Promise.all([ask("cau-hoi-A", "user-a", first.signal), ask("cau-hoi-B", "user-b")]);
  assert.equal(attemptsA, 2);
  first.abort();
  assert.equal(active.get("cau-hoi-A")?.aborted, true);
  assert.equal(active.get("cau-hoi-B")?.aborted, false);
  const [answerA, answerB] = await Promise.all([replyA.text(), replyB.text()]);
  assert.match(answerA, /cau-hoi-A/);
  assert.doesNotMatch(answerA, /cau-hoi-B/);
  assert.match(answerB, /cau-hoi-B/);
  assert.doesNotMatch(answerB, /cau-hoi-A/);
});

test("AI retries a short rate limit once and stops when the provider is still busy", async () => {
  let attempts = 0;
  const f = fixture(async () => {
    attempts++;
    return new Response(null, { status: 429, headers: { "Retry-After": attempts === 1 ? "0" : "9" } });
  });
  const response = await f.run({ ...body, includeData: false });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Retry-After"), "9");
  assert.equal(attempts, 2);
});

test("invalid server credentials fail once without trying the same key on other models", async () => {
  let attempts = 0;
  const f = fixture(async () => {
    attempts++;
    return Response.json({ error: { message: "Invalid token (request id: private)" } }, { status: 401 });
  });
  const response = await f.run({ ...body, includeData: false });
  assert.equal(response.status, 502);
  const message = await response.text();
  assert.match(message, /Khóa ShopAIKey/);
  assert.doesNotMatch(message, /request id/);
  assert.equal(attempts, 1);
});

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

test("casual greetings like 'hi' on /wh-dashboard do not inject wh_tracking or ops data context", async () => {
  const f = fixture();
  const response = await f.run({
    messages: [{ role: "user", content: "hi" }],
    includeData: true,
    pagePath: "/wh-dashboard",
    contextMode: "operations",
  });
  assert.equal(response.status, 200);
  await response.text();
  const messages = f.provider()!.messages;
  assert.ok(!messages.some(m => m.content.startsWith("RIDER_OPS_DATA_CONTEXT")));
  assert.equal(response.headers.get("x-rider-ops-data-sources"), "none");
  assert.equal(f.reads().briefingReads, 0);
  assert.equal(f.analysisReads(), 0);
});

test("actual iPhone questions on /wh-dashboard do inject wh_tracking context", async () => {
  const f = fixture();
  const response = await f.run({
    messages: [{ role: "user", content: "hôm nay có bao nhiêu đơn iphone" }],
    includeData: true,
    pagePath: "/wh-dashboard",
    contextMode: "operations",
  });
  assert.equal(response.status, 200);
  await response.text();
  const messages = f.provider()!.messages;
  const context = messages.find(m => m.content.startsWith("RIDER_OPS_DATA_CONTEXT"));
  assert.ok(context?.content.includes("wh_tracking"));
});

test("volume questions for a specific ward inject ward_volume context with daily breakdown", async () => {
  const f = fixture();
  const response = await f.run({
    messages: [{ role: "user", content: "Volume Giao Phường 5, Quận Gò Vấp" }],
    includeData: true,
    pagePath: "/dashboard",
    contextMode: "operations",
  });
  assert.equal(response.status, 200);
  await response.text();
  const messages = f.provider()!.messages;
  const context = messages.find(m => m.content.startsWith("RIDER_OPS_DATA_CONTEXT"));
  assert.ok(context?.content.includes("ward_volume"));
  assert.ok(context?.content.includes("Phường 5"));
  assert.ok(context?.content.includes("4788"));
});

test("findMatchingRiders matches full name, 2-word names, numeric codes, and ignores punctuation", () => {
  const riders = [
    { rider_code: "122667", full_name: "ĐỖ ANH DŨNG" },
    { rider_code: "113502", full_name: "TRƯƠNG THẾ THANH TOÀN" },
    { rider_code: "132420", full_name: "NGUYỄN THỊ HẢI TRẦM" },
  ];

  // 1. Exact full name
  const m1 = findMatchingRiders("Tiến độ Giao hàng - ĐỖ ANH DŨNG", riders);
  assert.equal(m1.length, 1);
  assert.equal(m1[0].rider_code, "122667");

  // 2. Trailing punctuation like question mark
  const m2 = findMatchingRiders("tiến độ anh dũng?", riders);
  assert.equal(m2.length, 1);
  assert.equal(m2[0].rider_code, "122667");

  // 3. Code match
  const m3 = findMatchingRiders("kiểm tra 113502", riders);
  assert.equal(m3.length, 1);
  assert.equal(m3[0].rider_code, "113502");

  // 4. Non-existent name returns empty
  const m4 = findMatchingRiders("ai đó không có thật", riders);
  assert.equal(m4.length, 0);
});
