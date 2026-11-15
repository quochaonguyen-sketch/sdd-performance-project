import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { syncScheduleArchive } from "../lib/attendance/schedule-archive.ts";
import { createOHArchiveClient } from "../lib/onhold/archive.ts";

nextEnv.loadEnvConfig(process.cwd(), true);

async function sync() {
  const apply = process.argv.includes("--apply");
  const archive = createOHArchiveClient();
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  if (!archive || !url || !key) throw Error("Cần cấu hình cả hai Supabase.");
  const primary = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const result = await syncScheduleArchive(primary, archive, apply);
  if (!result) throw Error("Chưa cài bảng rider_schedule_archive ở Supabase thứ hai.");
  console.log(JSON.stringify({ mode: apply ? "apply" : "check", ...result }));
  if (!apply && result.pending) process.exitCode = 1;
}

sync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Đồng bộ lịch rider thất bại.");
  process.exitCode = 1;
});
