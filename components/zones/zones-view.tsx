"use client";

import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { useCallback, useEffect, useState } from "react";
import { Map, RefreshCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { Button } from "@/components/ui/button";
import { HcmZoneMap } from "@/components/zones/hcm-zone-map";
import type { ZoneRider } from "@/components/zones/zone-map-types";
import type { BinhChanhPlan } from "@/components/zones/zone-model";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";

const ZONE_RIDER_COLUMNS = "id,rider_code,full_name,kv,home_district,cot,pickup_district,pickup_ward,delivery_district,delivery_ward,status";

export function ZonesView() {
  const [riders, setRiders] = useState<ZoneRider[]>([]);
  const [binhChanhPlan, setBinhChanhPlan] = useState<BinhChanhPlan | null>(null);
  const [loading, setLoading] = useState(true);
  useReportInitialDataLoading("zones", loading);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [rows, plan] = await Promise.all([
        (async () => {
          const client = createClient(), rows: ZoneRider[] = [];
          for (let from = 0; ; from += 1000) {
            const result = await client.from("riders").select(ZONE_RIDER_COLUMNS).in("kv", OPERATING_AREAS).order("rider_code").range(from, from + 999);
            if (result.error) throw new Error(result.error.message);
            const page = (result.data ?? []) as ZoneRider[];
            rows.push(...page);
            if (page.length < 1000) return rows;
          }
        })(),
        (async () => {
          const response = await fetch("/api/zones/plan", { cache: "no-store" });
          const result = await response.json() as { wardAreas: BinhChanhPlan; error?: string };
          if (!response.ok) throw new Error(result.error ?? "Không tải được địa bàn từ Plan");
          return result.wardAreas;
        })(),
      ]);
      setRiders(rows);
      setBinhChanhPlan(plan);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Không tải được dữ liệu Zone");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const applyRealtimeChange = useCallback((payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
    const nextRider = payload.new as Partial<ZoneRider>;
    const previousRider = payload.old as Partial<ZoneRider>;
    if (payload.eventType === "DELETE" && previousRider.id) {
      setRiders((current) => current.filter((rider) => rider.id !== previousRider.id));
      return;
    }
    if ((payload.eventType === "INSERT" || payload.eventType === "UPDATE") && nextRider.id && nextRider.rider_code) {
      setRiders((current) => sortZoneRiders([
        nextRider as ZoneRider,
        ...current.filter((rider) => rider.id !== nextRider.id),
      ]));
      return;
    }
    void load();
  }, [load]);

  useSupabaseRealtime({ table: "riders", onChange: applyRealtimeChange, debounceMs: 250 });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-3 ops-page-header">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-slate-950 text-white"><Map size={21} /></span>
          <div><h1 className="text-xl font-bold text-slate-950 sm:text-2xl">Quản lý Zones</h1></div>
        </div>
        <Button type="button" variant="secondary" className="shrink-0 px-3" onClick={() => void load()} disabled={loading}><RefreshCcw className={loading ? "animate-spin" : ""} size={16} /><span className="hidden sm:inline">Tải lại</span></Button>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {binhChanhPlan ? <HcmZoneMap riders={riders} binhChanhPlan={binhChanhPlan} /> : loading ? <div className="h-[560px] animate-pulse rounded-xl bg-slate-100" aria-label="Đang tải địa bàn Plan" /> : null}
    </div>
  );
}

function sortZoneRiders(riders: ZoneRider[]) {
  return riders.sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "", "vi") || a.rider_code.localeCompare(b.rider_code, "vi"));
}
