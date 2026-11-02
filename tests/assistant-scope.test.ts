import test from "node:test";
import assert from "node:assert/strict";
import { assistantHref, assistantScope } from "../lib/filters/assistant-scope.ts";

test("task links preserve the exact operating area and FTE day", () => {
  const href = assistantHref("/team", "KV3", "2026-11-03");
  assert.deepEqual(assistantScope(new URL(href, "http://localhost").searchParams), { area: "KV3", date: "2026-11-03" });
  assert.deepEqual(assistantScope(new URL(assistantHref("/pickup-realtime", "KV5"), "http://localhost").searchParams), { area: "KV5", date: null });
});

test("invalid query filters cannot set an unsupported area or malformed calendar date", () => {
  for (const [area, date] of [["KV6", "2026-02-30"], ["<script>", "tomorrow"], ["all", "2026-13-01"]]) {
    assert.deepEqual(assistantScope(new URLSearchParams({ ai_area: area, ai_day: date })), { area: null, date: null });
  }
  assert.deepEqual(assistantScope(new URLSearchParams()), { area: null, date: null });
});
