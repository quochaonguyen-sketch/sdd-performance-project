import "server-only";
import { TtlCache } from "@/lib/cache/ttl-cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { prepareLostSnapshot } from "./list";
import type { LostRow } from "./model";

const snapshotCache = new TtlCache<ReturnType<typeof prepareLostSnapshot>>(30_000, 1);

export async function readLostSnapshot() {
  const { value } = await snapshotCache.load("lost", async () => {
    const { data, error } = await createAdminClient().from("lost_report")
      .select("rows,synced_at,last_error").eq("id", true).maybeSingle();
    if (error) throw Error("Chưa đọc được danh sách đơn. Hãy thử lại.");
    return prepareLostSnapshot((data?.rows ?? []) as LostRow[], data?.synced_at ?? null, data?.last_error ?? null);
  });
  return value;
}
