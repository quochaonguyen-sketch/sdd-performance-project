import nextEnv from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createOHArchiveClient } from "../lib/onhold/archive.ts";
import { FULL_WH_VERSION, WH_STATION, type WhArchiveSnapshot } from "../lib/wh/archive.ts";

nextEnv.loadEnvConfig(process.cwd(), true);

type SnapshotVersion = Pick<WhArchiveSnapshot, "report_date" | "snapshot_at" | "job_id">;
const versionOf = (row: SnapshotVersion) => `${FULL_WH_VERSION}${row.job_id}:${row.snapshot_at}`;

async function copyDay(archive: SupabaseClient, primary: SupabaseClient, row: SnapshotVersion, check: boolean) {
  const version = versionOf(row);
  const key = { kind: "wh", report_date: row.report_date };
  const signal = AbortSignal.timeout(25_000);
  const table = () => archive.from("operations_archive_days");
  const current = await table().select("version,snapshot_at:payload->>snapshot_at").match(key).abortSignal(signal).maybeSingle();
  if (current.error) throw Error(`Không đối chiếu được WH ngày ${row.report_date} (${current.error.code}).`);
  if (current.data?.version === version || (
    current.data?.version.startsWith(FULL_WH_VERSION) &&
    Date.parse(current.data.snapshot_at) >= Date.parse(row.snapshot_at)
  )) return true;
  if (check) return false;

  const snapshot = await primary.from("wh_tracking_snapshots").select("station_id,report_date,snapshot_at,job_id,orders")
    .match({ station_id: WH_STATION, report_date: row.report_date }).abortSignal(signal).single();
  if (snapshot.error || !Array.isArray(snapshot.data?.orders)) {
    throw Error(`Không đọc được snapshot WH ngày ${row.report_date}.`);
  }
  const write = { ...key, version: versionOf(snapshot.data), payload: snapshot.data };
  const query = current.data
    ? table().update(write).match(key).eq("version", current.data.version)
    : table().upsert(write, { onConflict: "kind,report_date", ignoreDuplicates: true });
  const saved = await query.select("version").abortSignal(signal).maybeSingle();
  if (saved.error || !saved.data) throw Error(`Chưa ghi được WH ngày ${row.report_date}. Chạy lại đồng bộ.`);
  return true;
}

async function main() {
  const check = !process.argv.includes("--apply");
  const archive = createOHArchiveClient();
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  if (!archive || !url || !key) throw Error("Cần cấu hình đầy đủ hai Supabase trên máy chạy đồng bộ.");
  const primary = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const pageSize = 100;
  let total = 0, pending = 0;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await primary.from("wh_tracking_snapshots").select("report_date,snapshot_at,job_id")
      .eq("station_id", WH_STATION).order("report_date").range(offset, offset + pageSize - 1)
      .abortSignal(AbortSignal.timeout(25_000));
    if (error || !data) throw Error("Không đọc được danh sách ngày WH từ Supabase chính.");
    for (const row of data) {
      total++;
      if (!await copyDay(archive, primary, row, check)) pending++;
    }
    if (data.length < pageSize) break;
  }
  console.log(JSON.stringify({ mode: check ? "check" : "apply", total, pending }));
  if (pending > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Lỗi khi di chuyển snapshot WH.");
  process.exitCode = 1;
});
