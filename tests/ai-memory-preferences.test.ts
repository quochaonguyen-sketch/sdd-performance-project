import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";

function fixture(signedIn = true) {
  const reads: string[] = [];
  const client = { auth: { getUser: async () => ({ data: { user: signedIn ? { id: "owner" } : null } }) }, from(table: string) {
    reads.push(table);
    return {
      select() { return this; }, eq() { return this; }, order() { return this; },
      limit(): unknown { return table === "ai_messages" ? Promise.resolve({ data: [{ id: "m1", role: "assistant", content: "Old quantity 999" }], error: null }) : this; },
      maybeSingle: async () => ({ data: table === "ai_user_preferences" ? { memory_enabled: true } : { id: "old-conversation" }, error: null }),
    };
  } };
  const exports: { GET?: (request: Request) => Promise<Response> } = {};
  const code = ts.transpileModule(readFileSync("app/api/ai/memory/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, { exports, URL, Response, require(name: string) {
    if (name === "next/server") return { NextResponse: Response };
    if (name === "zod") return { z };
    if (name === "@/lib/supabase/server") return { createClient: async () => client };
    throw Error(name);
  } });
  return { reads, run: (query = "") => exports.GET!(new Request(`http://localhost/api/ai/memory${query}`)) };
}
test("opening chat reads preferences without querying or returning old conversations and quantities", async () => {
  const f = fixture(), response = await f.run("?preferencesOnly=1"), result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.memoryEnabled, true);
  assert.deepEqual(f.reads, ["ai_user_preferences"]); assert.equal("messages" in result, false); assert.equal("conversation" in result, false);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
test("old conversation remains available only through the explicit history request", async () => {
  const f = fixture(), response = await f.run(), result = await response.json();
  assert.equal(result.messages[0].content, "Old quantity 999"); assert.equal(result.conversation.id, "old-conversation");
  assert.deepEqual(f.reads, ["ai_user_preferences", "ai_conversations", "ai_messages"]);
});
test("preferences and history requests both require authentication before reads", async () => {
  const f = fixture(false);
  assert.equal((await f.run("?preferencesOnly=1")).status, 401); assert.equal((await f.run()).status, 401); assert.deepEqual(f.reads, []);
});
