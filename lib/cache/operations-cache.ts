import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import type { AttendanceLog, Rider, RiderRegistryItem } from "@/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { TtlCache } from "@/lib/cache/ttl-cache";

type NoteStatus = "ACTIVE" | "ARCHIVED";

export type CachedPersonalNote = {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  status: NoteStatus;
  created_at: string;
  updated_at: string;
};

export type AttendanceSchedulePayload = {
  riders: Rider[];
  logs: AttendanceLog[];
};

const RIDERS_CACHE_KEY = "all";
const RIDERS_TTL_MS = 60_000;
const NOTES_TTL_MS = 45_000;
const ATTENDANCE_TTL_MS = 30_000;
const ridersCache = new TtlCache<Rider[]>(RIDERS_TTL_MS, 1);
const riderRegistryCache = new TtlCache<RiderRegistryItem[]>(RIDERS_TTL_MS, 1);
const notesCache = new TtlCache<CachedPersonalNote[]>(NOTES_TTL_MS, 100);
const attendanceCache = new TtlCache<AttendanceSchedulePayload>(ATTENDANCE_TTL_MS, 6);

export function invalidateRidersCache() {
  ridersCache.clear();
  riderRegistryCache.clear();
  attendanceCache.clear();
}

export function invalidateNotesCache(userId: string) {
  notesCache.delete(userId);
}

export function invalidateAttendanceCache(month?: string) {
  if (month) attendanceCache.delete(month);
  else attendanceCache.clear();
}

export async function getCachedRiders() {
  const result = await ridersCache.load(RIDERS_CACHE_KEY, () => fetchAll<Rider>((from, to) =>
    createAdminClient()
      .from("riders")
      .select("*").in("kv", OPERATING_AREAS)
      .order("updated_at", { ascending: false })
      .range(from, to),
  ));
  return { data: result.value, cache: cacheState(result) };
}

export async function getCachedRiderRegistry() {
  const result = await riderRegistryCache.load(RIDERS_CACHE_KEY, async () => {
    const rows = await fetchAll<RiderRegistryRow>((from, to) =>
      createAdminClient()
        .from("riders")
        .select(RIDER_REGISTRY_SELECT).in("kv", OPERATING_AREAS)
        .order("updated_at", { ascending: false })
        .range(from, to)
        .overrideTypes<RiderRegistryRow[], { merge: false }>(),
    );
    return rows.map(toRiderRegistryItem);
  });
  return { data: result.value, cache: cacheState(result) };
}

export async function getCachedPersonalNotes(
  userId: string,
  fetchNotes: () => Promise<{ data: CachedPersonalNote[] | null; error: { message: string } | null }>,
) {
  try {
    const result = await notesCache.load(userId, async () => {
      const { data, error } = await fetchNotes();
      if (error) throw new Error(error.message);
      return data ?? [];
    });
    return { data: result.value, error: null, cache: cacheState(result) };
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : "Không tải được ghi chú" }, cache: { hit: false, expires_at: null } };
  }
}

export async function getCachedAttendanceSchedule(month: string, load: () => Promise<AttendanceSchedulePayload>) {
  const result = await attendanceCache.load(month, load);
  return { data: result.value, cache: cacheState(result) };
}

function cacheState(entry: { hit: boolean; expiresAt: number }) {
  return {
    hit: entry.hit,
    expires_at: new Date(entry.expiresAt).toISOString(),
  };
}

async function fetchAll<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

const RIDER_REGISTRY_SELECT = [
  "id",
  "rider_code",
  "kv",
  "home_district",
  "cot",
  "full_name",
  "pickup_district",
  "pickup_ward",
  "point_name",
  "delivery_district",
  "delivery_ward",
  "avatar_url",
  "zone_id",
  "status",
  "current_shift",
  "created_at",
  "updated_at",
  "phone:raw_data->>phone",
  "phone_number:raw_data->>phone_number",
  "mobile:raw_data->>mobile",
].join(",");

type RiderRegistryRow = Omit<RiderRegistryItem, "phone" | "raw_data"> & {
  phone: unknown;
  phone_number: unknown;
  mobile: unknown;
};

function toRiderRegistryItem(row: RiderRegistryRow): RiderRegistryItem {
  return {
    id: row.id,
    rider_code: row.rider_code,
    kv: row.kv,
    home_district: row.home_district,
    cot: row.cot,
    full_name: row.full_name,
    pickup_district: row.pickup_district,
    pickup_ward: row.pickup_ward,
    point_name: row.point_name,
    delivery_district: row.delivery_district,
    delivery_ward: row.delivery_ward,
    avatar_url: row.avatar_url,
    zone_id: row.zone_id,
    status: row.status,
    current_shift: row.current_shift,
    created_at: row.created_at,
    updated_at: row.updated_at,
    phone: firstText(row.phone, row.phone_number, row.mobile),
    raw_data: null,
  };
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}
