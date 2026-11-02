import type { RealtimePostgresChangesPayload, SupabaseClient } from "@supabase/supabase-js";

// Related tables share a channel and debounce window when they refresh one snapshot.
export function subscribeToChanges<T extends Record<string, unknown>>(
  client: SupabaseClient,
  tables: readonly string[],
  onChange: (payload: RealtimePostgresChangesPayload<T>) => void,
  debounceMs: number,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = true;
  const channel = client.channel(`realtime:${tables.join(",")}`);
  for (const table of tables) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload: RealtimePostgresChangesPayload<T>) => {
      if (!active) return;
      if (debounceMs <= 0) { onChange(payload); return; }
      clearTimeout(timer);
      timer = setTimeout(() => { if (active) onChange(payload); }, debounceMs);
    });
  }
  channel.subscribe();
  return () => { if (!active) return; active = false; clearTimeout(timer); void client.removeChannel(channel); };
}
