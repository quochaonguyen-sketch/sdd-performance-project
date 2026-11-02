import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { addDays } from "../lib/team/model.ts";
import { validateAnalysisScope } from "../lib/ai/operations-analysis.ts";

function fixture(signedIn = true) {
  let reads = 0;
  const exports: { GET?: (request: Request) => Promise<Response> } = {};
  const code = ts.transpileModule(readFileSync("app/api/ai/analysis/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, { exports, URL, Response, require(name: string) {
    if (name === "@/lib/auth/current-user") return { getCurrentUserContext: async () => signedIn ? {} : null };
    if (name === "@/lib/ai/work-date") return { todayInVietnam: () => "2026-11-02" };
    if (name === "@/lib/team/model") return { addDays };
    if (name === "@/lib/ai/operations-analysis") return { validateAnalysisScope };
    if (name === "@/lib/ai/operations-analysis-server") return { loadOperationsAnalysis: async (_context: unknown, scope: unknown) => { reads++; return { scope }; } };
    throw Error(name);
  } });
  return { run: (query = "") => exports.GET!(new Request(`http://localhost/api/ai/analysis${query}`)), reads: () => reads };
}
test("analysis endpoint verifies authentication before reading sources", async () => {
  const f = fixture(false); assert.equal((await f.run()).status, 401); assert.equal(f.reads(), 0);
});
test("analysis endpoint validates real dates, bounded range, area and clock before source loading", async () => {
  const f = fixture();
  for (const query of ["?from=2026-09-01", "?to=2026-11-03", "?from=2026-02-30", "?area=KV9", "?hour=24"]) assert.equal((await f.run(query)).status, 400);
  assert.equal(f.reads(), 0);
});
test("analysis endpoint defaults to last seven days and never publicly caches scoped data", async () => {
  const f = fixture(), response = await f.run(); assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual((await response.json()).scope, { from: "2026-10-27", to: "2026-11-02", area: "all", hour: 23 });
});
