import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canAccessPickupManagement } from "@/lib/auth/permissions";
import { TtlCache } from "@/lib/cache/ttl-cache";
import {
  COLUMNS,
  PAGE_ROWS,
  normalizeRow,
  deliveryInventoryRows,
  type InventoryRow,
} from "@/components/lmhub-inventory/lmhub-inventory-model";

type DeliverySnapshotData = {
  snapshotId: string | null;
  snapshotAt: string | null;
  rows: InventoryRow[];
};

const deliverySnapshotCache = new TtlCache<DeliverySnapshotData>(60_000, 4);

export async function GET(request: Request) {
  const context = await getCurrentUserContext().catch(() => null);
  if (!context) {
    return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  }
  if (!canAccessPickupManagement(context.profile.role, context.profile.permissions)) {
    return NextResponse.json({ success: false, error: "Bạn không có quyền xem tồn Delivery" }, { status: 403 });
  }

  const url = new URL(request.url);
  const headOnly = url.searchParams.get("head") === "1";
  const refresh = url.searchParams.get("refresh") === "1";
  const admin = createAdminClient();

  try {
    const latestHead = await admin.from("lmhub_inventory_rows")
      .select("snapshot_id,snapshot_at")
      .in("area", OPERATING_AREAS)
      .order("snapshot_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestHead.error) throw latestHead.error;

    const snapshotId = latestHead.data?.snapshot_id ?? null;
    let snapshotAt = latestHead.data?.snapshot_at ?? null;

    if (!snapshotId) {
      const completed = await admin.from("lmhub_fetch_jobs").select("finished_at").eq("status", "DONE")
        .in("params->>kind", ["delivery", "ton_delivery", "all", "both"])
        .order("finished_at", { ascending: false }).limit(1).maybeSingle();
      if (!completed.error) snapshotAt = completed.data?.finished_at ?? null;
    }

    if (headOnly) {
      return NextResponse.json({
        success: true,
        snapshotId,
        snapshotAt,
      }, { headers: { "Cache-Control": "private, no-store" } });
    }

    if (!snapshotId) {
      return NextResponse.json({
        success: true,
        snapshotId: null,
        snapshotAt,
        rows: [],
      }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const cacheKey = snapshotId;
    if (refresh) {
      deliverySnapshotCache.delete(cacheKey);
    }

    const cached = await deliverySnapshotCache.load(cacheKey, async () => {
      const { count } = await admin.from("lmhub_inventory_rows")
        .select("*", { count: "exact", head: true })
        .in("area", OPERATING_AREAS)
        .eq("snapshot_id", snapshotId);

      const total = count || 0;
      const numPages = Math.ceil(total / PAGE_ROWS);
      const chunks = [];
      for (let i = 0; i < numPages; i++) {
        const from = i * PAGE_ROWS;
        chunks.push(
          admin.from("lmhub_inventory_rows")
            .select(COLUMNS)
            .in("area", OPERATING_AREAS)
            .eq("snapshot_id", snapshotId)
            .order("shipment_id", { ascending: true })
            .range(from, from + PAGE_ROWS - 1)
        );
      }

      const results = await Promise.all(chunks);
      const rawRows: InventoryRow[] = [];
      for (const res of results) {
        if (res.error) throw res.error;
        rawRows.push(...((res.data ?? []) as InventoryRow[]).map(normalizeRow));
      }

      const rows = deliveryInventoryRows(rawRows);
      return {
        snapshotId,
        snapshotAt,
        rows,
      };
    });

    return NextResponse.json({
      success: true,
      ...cached.value,
    }, {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Data-Cache": cached.hit ? "HIT" : "MISS",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Không tải được tồn Delivery" },
      { status: 500 },
    );
  }
}
