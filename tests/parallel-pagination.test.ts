import test from "node:test";
import assert from "node:assert/strict";
import { readAllPages } from "../lib/pickup/realtime.ts";

test("parallel reads are bounded, preserve source ordering, and include the final partial page", async () => {
  const source = Array.from({ length: 10501 }, (_, i) => i);
  let active = 0, maxActive = 0;
  const result = await readAllPages(async (from, to) => {
    active++; maxActive = Math.max(active, maxActive);
    await new Promise(resolve => setTimeout(resolve, from % 2000 === 0 ? 2 : 0));
    active--; return { data: source.slice(from, to + 1), error: null };
  }, 1000, 4);
  assert.deepEqual(result, source);
  assert.equal(maxActive, 4);
  assert.equal(active, 0);
});

test("small sources use one request; exact multiples terminate on the empty page", async () => {
  for (const count of [0, 17, 1000, 5000]) {
    const source = Array.from({ length: count }, (_, i) => i);
    let calls = 0;
    const result = await readAllPages(async (from, to) => { calls++; return { data: source.slice(from, to + 1), error: null }; }, 1000, 4);
    assert.deepEqual(result, source);
    if (count < 1000) assert.equal(calls, 1);
  }
});

test("failed required pages reject, while unused pages beyond the end cannot truncate valid data", async () => {
  for (const reject of [false, true]) {
    await assert.rejects(readAllPages(async from => {
      if (from === 1000) { if (reject) throw Error("network"); return { data: null, error: { message: "offline" } }; }
      return { data: Array.from({ length: 1000 }, (_, i) => from + i), error: null };
    }, 1000, 4), /network|offline/);
  }
  const data = await readAllPages(async from => {
    if (from === 0) return { data: [0, 1], error: null };
    if (from === 2) return { data: [2], error: null };
    throw Error("unused speculative request failed");
  }, 2, 4);
  assert.deepEqual(data, [0, 1, 2]);
  await assert.rejects(readAllPages(async () => ({ data: [], error: null }), 1000, 5), /Invalid pagination/);
});
