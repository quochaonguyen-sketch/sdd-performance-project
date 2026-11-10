import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { VolumeMaskScope } from "./calculations";
export * from "./calculations";

export type RiderVolumeMask = {
  id: string;
  rider_code: string;
  rider_name: string | null;
  factor: number; // 0.50 means 50%
  scope: VolumeMaskScope;
  is_active: boolean;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// In-memory cache for active masks to avoid database hits on every high-frequency call
let cachedMaskMap: Map<string, { factor: number; scope: VolumeMaskScope }> | null = null;
let cacheTime = 0;
const CACHE_TTL = 30_000; // 30 seconds

export function invalidateVolumeMaskCache() {
  cachedMaskMap = null;
  cacheTime = 0;
}

/**
 * Returns a map of normalized rider_code -> { factor, scope } for all active masks.
 */
export async function getActiveVolumeMaskMap(): Promise<Map<string, { factor: number; scope: VolumeMaskScope }>> {
  const now = Date.now();
  if (cachedMaskMap && now - cacheTime < CACHE_TTL) {
    return cachedMaskMap;
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("rider_volume_masks")
      .select("rider_code, factor, scope, is_active")
      .eq("is_active", true);

    if (error) {
      console.error("[VolumeMask] Error fetching active masks:", error.message);
      return cachedMaskMap ?? new Map();
    }

    const map = new Map<string, { factor: number; scope: VolumeMaskScope }>();
    for (const item of data ?? []) {
      const code = String(item.rider_code).trim().toLowerCase();
      const factor = Number(item.factor);
      if (code && Number.isFinite(factor) && factor >= 0) {
        map.set(code, {
          factor,
          scope: (item.scope as VolumeMaskScope) || "all",
        });
      }
    }

    cachedMaskMap = map;
    cacheTime = now;
    return map;
  } catch (err) {
    console.error("[VolumeMask] Exception fetching active masks:", err);
    return cachedMaskMap ?? new Map();
  }
}

/**
 * List all configured volume masks (Super Admin only).
 */
export async function listAllVolumeMasks(): Promise<RiderVolumeMask[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("rider_volume_masks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Không tải được danh sách điều chỉnh sản lượng: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    rider_code: row.rider_code,
    rider_name: row.rider_name,
    factor: Number(row.factor),
    scope: row.scope,
    is_active: Boolean(row.is_active),
    note: row.note,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

/**
 * Upsert a volume mask for a rider.
 */
export async function upsertVolumeMask(input: {
  id?: string;
  rider_code: string;
  rider_name?: string | null;
  factor: number;
  scope: VolumeMaskScope;
  is_active?: boolean;
  note?: string | null;
  user_email?: string | null;
}): Promise<RiderVolumeMask> {
  const admin = createAdminClient();
  const riderCode = input.rider_code.trim();
  if (!riderCode) throw new Error("Mã rider không được để trống.");

  const factor = Math.min(5.0, Math.max(0.0, Number(input.factor)));
  if (!Number.isFinite(factor)) throw new Error("Tỷ lệ factor không hợp lệ.");

  const payload = {
    rider_code: riderCode,
    rider_name: input.rider_name?.trim() || null,
    factor,
    scope: input.scope,
    is_active: input.is_active ?? true,
    note: input.note?.trim() || null,
    created_by: input.user_email || null,
    updated_at: new Date().toISOString(),
  };

  let query;
  if (input.id) {
    query = admin.from("rider_volume_masks").update(payload).eq("id", input.id).select().single();
  } else {
    query = admin.from("rider_volume_masks").upsert(payload, { onConflict: "rider_code" }).select().single();
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Không lưu được cấu hình: ${error.message}`);
  }

  invalidateVolumeMaskCache();
  return {
    id: data.id,
    rider_code: data.rider_code,
    rider_name: data.rider_name,
    factor: Number(data.factor),
    scope: data.scope,
    is_active: Boolean(data.is_active),
    note: data.note,
    created_by: data.created_by,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

/**
 * Delete a volume mask by ID or rider_code.
 */
export async function deleteVolumeMask(idOrCode: string): Promise<boolean> {
  const admin = createAdminClient();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrCode.trim());
  const query = isUuid
    ? admin.from("rider_volume_masks").delete().eq("id", idOrCode.trim())
    : admin.from("rider_volume_masks").delete().ilike("rider_code", idOrCode.trim());
  const { error } = await query;
  if (error) {
    throw new Error(`Không xóa được cấu hình: ${error.message}`);
  }
  invalidateVolumeMaskCache();
  return true;
}

/**
 * Toggle active state of a volume mask.
 */
export async function toggleVolumeMask(id: string, is_active: boolean): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("rider_volume_masks")
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error(`Không đổi được trạng thái: ${error.message}`);
  }
  invalidateVolumeMaskCache();
  return true;
}
