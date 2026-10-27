import test from "node:test";
import assert from "node:assert/strict";
import { startVisiblePolling } from "../lib/polling/visible-poller.ts";

Object.defineProperty(globalThis, "window", { value: undefined, writable: true, configurable: true });
Object.defineProperty(globalThis, "document", { value: undefined, writable: true, configurable: true });

async function flush() { for (let i = 0; i < 10; i++) await Promise.resolve(); }

test("polling pauses while hidden, coalesces focus and resumes without overlapping requests", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 10000 });
  const browser = new EventTarget();
  const page = Object.assign(new EventTarget(), { visibilityState: "visible" });
  Object.defineProperty(globalThis, "window", { value: browser, writable: true, configurable: true });
  Object.defineProperty(globalThis, "document", { value: page, writable: true, configurable: true });
  const signals: AbortSignal[] = [];
  let finish!: () => void;
  const poller = startVisiblePolling(async signal => { signals.push(signal); await new Promise<void>(resolve => { finish = resolve; }); }, 60000, "changed");
  t.after(() => poller.stop());
  t.mock.timers.tick(0); await flush();
  browser.dispatchEvent(new Event("focus"));
  t.mock.timers.tick(180000); await flush();
  assert.equal(signals.length, 1, "a slow request must never overlap a periodic read");
  page.visibilityState = "hidden"; page.dispatchEvent(new Event("visibilitychange"));
  assert.equal(signals[0].aborted, true);
  finish(); await flush();
  t.mock.timers.tick(180000); await flush();
  assert.equal(signals.length, 1, "hidden tabs must not poll");
  page.visibilityState = "visible"; page.dispatchEvent(new Event("visibilitychange"));
  browser.dispatchEvent(new Event("focus")); await flush();
  assert.equal(signals.length, 2, "visibility and focus must share a read");
  finish(); await flush();
  browser.dispatchEvent(new Event("focus")); await flush();
  assert.equal(signals.length, 2, "fresh focus events must not repeat a read");
  t.mock.timers.tick(60000); await flush();
  assert.equal(signals.length, 3);
  poller.stop(); finish(); await flush();
  browser.dispatchEvent(new Event("changed")); t.mock.timers.tick(120000); await flush();
  assert.equal(signals.length, 3, "unmount must remove timers and event listeners");
});

test("mutation events during a read queue exactly one fresh read, including hidden mutations", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 10000 });
  const browser = new EventTarget();
  const page = Object.assign(new EventTarget(), { visibilityState: "hidden" });
  Object.defineProperty(globalThis, "window", { value: browser, writable: true, configurable: true });
  Object.defineProperty(globalThis, "document", { value: page, writable: true, configurable: true });
  let reads = 0, finish!: () => void;
  const poller = startVisiblePolling(async () => { reads++; await new Promise<void>(resolve => { finish = resolve; }); }, 60000, "changed");
  t.after(() => poller.stop());
  browser.dispatchEvent(new Event("changed")); t.mock.timers.tick(120000); await flush();
  assert.equal(reads, 0);
  page.visibilityState = "visible"; page.dispatchEvent(new Event("visibilitychange")); await flush();
  browser.dispatchEvent(new Event("changed")); browser.dispatchEvent(new Event("changed"));
  assert.equal(reads, 1);
  finish(); await flush();
  assert.equal(reads, 2, "a mutation must not be swallowed by an older in-flight snapshot");
  finish(); await flush();
  assert.equal(reads, 2);
});
