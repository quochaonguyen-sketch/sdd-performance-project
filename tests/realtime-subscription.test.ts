import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { subscribeToChanges } from "../lib/supabase/realtime-subscription.ts";

function fixture() {
  type Callback = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  const listeners = new Map<string, Callback>();
  let subscriptions = 0, removals = 0, channels = 0;
  const channel = {
    on(_event: string, filter: { table: string }, callback: Callback) { listeners.set(filter.table, callback); return channel; },
    subscribe() { subscriptions++; return channel; },
  };
  const client = { channel() { channels++; return channel; }, removeChannel() { removals++; } } as unknown as SupabaseClient;
  const emit = (table: string, id: number) => listeners.get(table)!({ eventType: "UPDATE", schema: "public", table, commit_timestamp: "2026-11-02T00:00:00Z", errors: null, old: {}, new: { id } });
  return { client, emit, counts: () => ({ channels, subscriptions, removals }) };
}

test("related realtime tables share one subscription and one debounce window", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture(), ids: unknown[] = [];
  const stop = subscribeToChanges(f.client, ["summary", "live", "groups", "inventory", "riders"], p => ids.push(p.new), 1500);
  t.after(stop);
  for (const table of ["summary", "live", "groups", "inventory", "riders"]) f.emit(table, 1);
  t.mock.timers.tick(1499); assert.equal(ids.length, 0);
  t.mock.timers.tick(1); assert.deepEqual(ids, [{ id: 1 }]);
  assert.deepEqual(f.counts(), { channels: 1, subscriptions: 1, removals: 0 });
  f.emit("live", 2); t.mock.timers.tick(1000); f.emit("riders", 3);
  t.mock.timers.tick(1500); assert.deepEqual(ids, [{ id: 1 }, { id: 3 }]);
  f.emit("live", 4); stop(); t.mock.timers.tick(1500); f.emit("live", 5);
  assert.equal(ids.length, 2, "unmounted subscribers must not run a queued callback");
});

test("zero debounce preserves individual row updates", () => {
  const f = fixture(), ids: unknown[] = [];
  const stop = subscribeToChanges(f.client, ["riders"], p => ids.push(p.new), 0);
  f.emit("riders", 1); f.emit("riders", 2);
  assert.deepEqual(ids, [{ id: 1 }, { id: 2 }]); stop();
  assert.equal(f.counts().removals, 1);
});
