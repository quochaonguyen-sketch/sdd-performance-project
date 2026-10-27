import test from "node:test";
import assert from "node:assert/strict";
import { restoreFilter } from "../lib/filters/remembered-state.ts";
import { metricPath } from "../lib/metrics/paths.ts";
import { vitalSampleSchema, vitalRating } from "../lib/metrics/web-vitals.ts";

test("stored filter values must match the current default shape", () => {
  const fallback = { area: "all", date: "2026-10-27", status: "OPEN" };
  assert.deepEqual(restoreFilter(JSON.stringify({ ...fallback, area: "KV1" }), fallback), { ...fallback, area: "KV1" });
  for (const raw of ['{', 'null', '[]', '{"area":3}', '"invalid"', 'x'.repeat(4001)]) assert.equal(restoreFilter(raw, fallback), fallback);
  assert.equal(restoreFilter('"KV1"', "all"), "KV1");
});
test("metrics omit URL parameters and identifiers and reject invalid telemetry", () => {
  assert.equal(metricPath('https://example.com/riders/11111111-1111-4111-8111-111111111111?email=private#section'), '/riders/:id');
  const sample = { metric_id: "metric-1", name: "LCP", value: 2500, rating: "good", path: "/riders", device: "desktop" };
  assert.equal(vitalSampleSchema.safeParse(sample).success, true);
  assert.equal(vitalSampleSchema.safeParse({ ...sample, path: "/riders?email=private" }).success, false);
  assert.equal(vitalSampleSchema.safeParse({ ...sample, value: -1 }).success, false);
  assert.equal(vitalSampleSchema.safeParse({ ...sample, value: Infinity }).success, false);
  assert.equal(vitalSampleSchema.safeParse({ ...sample, name: "UNKNOWN" }).success, false);
  assert.equal(vitalRating("LCP", 2500), "good"); assert.equal(vitalRating("LCP", 2501), "needs-improvement");
  assert.equal(vitalRating("INP", 501), "poor"); assert.equal(vitalRating("CLS", .1), "good");
});
