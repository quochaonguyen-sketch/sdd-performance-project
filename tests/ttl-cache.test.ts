import test from "node:test";
import assert from "node:assert/strict";
import { TtlCache } from "../lib/cache/ttl-cache.ts";

test("concurrent misses share a read and TTL starts after loading", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  const cache = new TtlCache<number>(100, 2);
  let calls = 0;
  let resolve!: (value: number) => void;
  const load = () => { calls++; return new Promise<number>(done => { resolve = done; }); };
  const first = cache.load("a", load);
  const second = cache.load("a", load);
  await Promise.resolve();
  t.mock.timers.tick(1000);
  resolve(7);
  assert.equal((await first).value, 7);
  assert.equal((await second).value, 7);
  assert.equal(calls, 1);
  assert.equal((await cache.load("a", async () => 8)).hit, true);
  t.mock.timers.tick(100);
  assert.equal((await cache.load("a", async () => 8)).value, 8);
});

test("evicts least recently used entries and retries failed reads", async () => {
  const cache = new TtlCache<number>(10000, 2);
  await cache.load("a", async () => 1);
  await cache.load("b", async () => 2);
  await cache.load("a", async () => 9);
  await cache.load("c", async () => 3);
  assert.equal((await cache.load("a", async () => 9)).value, 1);
  assert.equal((await cache.load("b", async () => 4)).value, 4);
  await assert.rejects(cache.load("error", async () => { throw new Error("offline"); }));
  assert.equal((await cache.load("error", async () => 5)).value, 5);
});

for (const invalidate of ["delete", "clear"] as const) {
  test(`${invalidate} prevents an older request from restoring stale data`, async () => {
    const cache = new TtlCache<number>(10000, 2);
    let resolve!: (value: number) => void;
    const old = cache.load("a", () => new Promise<number>(done => { resolve = done; }));
    await Promise.resolve();
    if (invalidate === "delete") cache.delete("a"); else cache.clear();
    await cache.load("a", async () => 2);
    resolve(1);
    await old;
    assert.equal((await cache.load("a", async () => 3)).value, 2);
  });
}
