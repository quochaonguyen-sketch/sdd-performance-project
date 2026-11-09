import { getCurrentUserContext } from "@/lib/auth/current-user";
import { TtlCache } from "@/lib/cache/ttl-cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { zoneDistrictForLocation } from "@/components/zones/zone-model";
import { zoneId } from "@/components/zones/zone-map-types";

export type ZoneVolumeData = {
  date: string;
  deliveryByZone: Record<string, number>;
  pickupByZone: Record<string, number>;
  totals: {
    delivery: number;
    pickup: number;
  };
  checkedAt: string;
};

const cache = new TtlCache<ZoneVolumeData>(60_000, 5);

export async function GET(request: Request) {
  if (!(await getCurrentUserContext())) {
    return Response.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedDate = searchParams.get("date")?.trim() || null;

  try {
    const admin = createAdminClient();

    let targetDate = requestedDate;
    if (!targetDate) {
      const { data: latestRow } = await admin
        .from("delivery_order")
        .select("report_date")
        .order("report_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      targetDate = latestRow?.report_date ?? new Date().toISOString().slice(0, 10);
    }

    const cacheKey = `zone-volume:${targetDate}`;
    const { value } = await cache.load(cacheKey, async () => {
      const deliveryRows: Array<{ district: string | null; old_ward: string | null; total_orders: number | null }> = [];
      for (let offset = 0; offset < 3000; offset += 1000) {
        const { data, error } = await admin
          .from("delivery_order")
          .select("district,old_ward,total_orders")
          .eq("report_date", targetDate)
          .in("area", OPERATING_AREAS)
          .range(offset, offset + 999);
        if (error) throw new Error(error.message);
        if (data && data.length > 0) deliveryRows.push(...data);
        if (!data || data.length < 1000) break;
      }

      const pickupRows: Array<{ district: string | null; new_ward: string | null; total_orders: number | null }> = [];
      for (let offset = 0; offset < 3000; offset += 1000) {
        const { data, error } = await admin
          .from("pickup_volume")
          .select("district,new_ward,total_orders")
          .eq("report_date", targetDate)
          .in("area", [...OPERATING_AREAS, "UNRESOLVED"])
          .range(offset, offset + 999);
        if (error) throw new Error(error.message);
        if (data && data.length > 0) pickupRows.push(...data);
        if (!data || data.length < 1000) break;
      }

      const deliveryByZone: Record<string, number> = {};
      let totalDelivery = 0;
      for (const row of deliveryRows) {
        const orders = Number(row.total_orders ?? 0);
        totalDelivery += orders;
        const district = zoneDistrictForLocation(row.district, row.old_ward);
        if (district && row.old_ward) {
          const id = zoneId(district.id, row.old_ward);
          deliveryByZone[id] = (deliveryByZone[id] ?? 0) + orders;
        }
      }

      const pickupByZone: Record<string, number> = {};
      let totalPickup = 0;
      for (const row of pickupRows) {
        const orders = Number(row.total_orders ?? 0);
        totalPickup += orders;
        const district = zoneDistrictForLocation(row.district, row.new_ward);
        if (district && row.new_ward) {
          const id = zoneId(district.id, row.new_ward);
          pickupByZone[id] = (pickupByZone[id] ?? 0) + orders;
        }
      }

      return {
        date: targetDate!,
        deliveryByZone,
        pickupByZone,
        totals: {
          delivery: totalDelivery,
          pickup: totalPickup,
        },
        checkedAt: new Date().toISOString(),
      };
    });

    return Response.json(value, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Không tải được volume của các phường" },
      { status: 502 },
    );
  }
}
