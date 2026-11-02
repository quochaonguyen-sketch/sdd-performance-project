"use client";

import { useEffect, useRef } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { subscribeToChanges } from "@/lib/supabase/realtime-subscription";

type RealtimeTable =
  | "lmhub_inventory_rows"
  | "lmhub_fetch_jobs"
  | "pickup_48h_no_api2"
  | "pickup_48h_summary_groups"
  | "pickup_48h_realtime_riders"
  | "pickup_48h_rider_groups"
  | "riders"
  | "attendance_logs"
  | "zones"
  | "activity_logs"
  | "delivery_order"
  | "delivery_volume"
  | "pickup_volume"
  | "pickup_assignments"
  | "morning_delivery_assignments"
  | "morning_delivery_absence_notes"
  | "realtime_delivery_riders";

type Options<T extends Record<string, unknown>> = {
  table: RealtimeTable | readonly RealtimeTable[];
  onChange: (payload: RealtimePostgresChangesPayload<T>) => void;
  /** Coalesce bulk database changes into one UI refresh. */
  debounceMs?: number;
};

export function useSupabaseRealtime<T extends Record<string, unknown>>({
  table,
  onChange,
  debounceMs = 500,
}: Options<T>) {
  const onChangeRef = useRef(onChange);
  const tableKey = typeof table === "string" ? table : table.join(",");

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const supabase = createClient();
    return subscribeToChanges<T>(supabase, tableKey.split(","), payload => onChangeRef.current(payload), debounceMs);
  }, [debounceMs, tableKey]);
}
