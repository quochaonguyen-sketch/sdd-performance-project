import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

type Tree = { type?: unknown; props?: Record<string, unknown> };
function nodes(tree: unknown): Tree[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  const node = tree as Tree;
  return [node, ...nodes(node.props?.children)];
}
function text(tree: unknown): string {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join("");
  return tree && typeof tree === "object" ? text((tree as Tree).props?.children) : "";
}
async function fixture() {
  let cursor = 0, serial = 0;
  const slots: unknown[] = [], effects: (() => unknown)[] = [], requests: { url: string; body?: string }[] = [];
  const exports: { OllamaChatbox?: (props: { initialOpen: boolean }) => unknown } = {};
  const code = ts.transpileModule(readFileSync("components/ai/ollama-chatbox.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  runInNewContext(code, { exports, AbortController, TextDecoder, Intl, Date, crypto: { randomUUID: () => `id-${++serial}` },
    window: { setTimeout: () => 1, clearTimeout() {}, matchMedia: () => ({ matches: true }), location: { pathname: "/team", search: "" }, confirm: () => { throw Error("No deletion in test"); } },
    document: { addEventListener() {}, removeEventListener() {} },
    fetch: async (url: string, init?: RequestInit) => {
      requests.push({ url, body: init?.body ? String(init.body) : undefined });
      if (url.startsWith("/api/ai/memory")) return Response.json({ success: true, memoryEnabled: true, conversation: { id: "old" }, messages: [{ id: "past", role: "assistant", content: "OLD QUANTITY 999" }] });
      assert.equal(url, "/api/ai/chat");
      return new Response('{"message":{"content":"Backlog đang giảm theo dữ liệu."}}\n', { headers: { "X-Rider-Ops-Data-Sources": "analysis_backlog_delivery" } });
    },
    require(name: string) {
      if (name === "react/jsx-runtime") return jsx;
      if (name === "react") return {
        useRef<T>(initial: T) { const i = cursor++; slots[i] ??= { current: initial }; return slots[i]; },
        useState<T>(initial: T) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value: T | ((old: T) => T)) => { slots[i] = typeof value === "function" ? (value as (old: T) => T)(slots[i] as T) : value; }]; },
        useEffect(effect: () => unknown, deps: unknown[]) { const i = cursor++, before = slots[i] as unknown[] | undefined; if (!before || deps.some((dep, j) => !Object.is(dep, before[j]))) effects.push(effect); slots[i] = deps; },
      };
      if (name === "lucide-react") return new Proxy({}, { get: () => () => null });
      if (name === "@/lib/ai/browser-config") return { useBrowserAiConfig: () => ({}) };
      if (name.endsWith(".css")) return new Proxy({}, { get: (_target, key) => String(key) });
      throw Error(`Unexpected component dependency: ${name}`);
    },
  });
  const render = () => { cursor = 0; return exports.OllamaChatbox!({ initialOpen: true }); };
  const flush = async () => { for (const effect of effects.splice(0)) effect(); await new Promise(resolve => setImmediate(resolve)); };
  const click = (tree: unknown, label: string) => { const found = nodes(tree).find(node => node.type === "button" && (node.props?.["aria-label"] === label || text(node) === label)); assert.ok(found, label); (found.props!.onClick as () => void)(); };
  render(); await flush();
  return { render, flush, click, requests };
}
test("opening and choosing a suggestion loads no quantities or operational sources; sending asks once", async () => {
  const f = await fixture(); let tree = f.render();
  assert.deepEqual(f.requests.map(request => request.url), ["/api/ai/memory?preferencesOnly=1"]);
  assert.ok(!text(tree).includes("OLD QUANTITY 999"));
  assert.ok(!nodes(tree).some(node => node.props?.["aria-label"] === "Chức năng trợ lý"));
  f.click(tree, "Backlog 7 ngày qua tăng hay giảm?"); tree = f.render();
  assert.equal(f.requests.length, 1);
  assert.equal(nodes(tree).find(node => node.type === "textarea")?.props?.value, "Backlog 7 ngày qua tăng hay giảm?");
  f.click(tree, "Gửi câu hỏi"); await f.flush(); tree = f.render();
  assert.equal(f.requests.filter(request => request.url === "/api/ai/chat").length, 1);
  const body = JSON.parse(f.requests.at(-1)!.body!); assert.equal(body.messages.length, 1); assert.equal(body.conversationId, null);
  assert.ok(text(tree).includes("Backlog đang giảm theo dữ liệu."));
});
test("old quantities appear only after an explicit restore-history action", async () => {
  const f = await fixture(); let tree = f.render();
  assert.ok(!text(tree).includes("OLD QUANTITY 999"));
  f.click(tree, "Xem cuộc trò chuyện trước"); await f.flush(); tree = f.render();
  assert.ok(text(tree).includes("OLD QUANTITY 999")); assert.equal(f.requests[1].url, "/api/ai/memory");
});
