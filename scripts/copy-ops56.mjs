/**
 * Copy data tu project Supabase Ops56 (source) sang project hien tai (target).
 *
 * Cach dung (PowerShell, chay local de key khong lo qua chat):
 *   $env:OPS56_URL = "https://<ops56-ref>.supabase.co"
 *   $env:OPS56_SERVICE_KEY = "<ops56-service_role-key>"
 *   node scripts/copy-ops56.mjs
 *
 * Target mac dinh lay tu .env hien tai (NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY). Co the override:
 *   $env:TARGET_URL = "..."; $env:TARGET_SERVICE_KEY = "..."
 *
 * Optional: $env:OPS56_TABLES = "riders,zones" (mac dinh copy full danh sach).
 * Optional: $env:OPS56_PAGE = "1000" (so row moi page).
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Nap .env don gian (project chua co dotenv).
function loadDotEnv() {
  const p = join(ROOT, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadDotEnv();

// Thu tu copy ton trong FK: zones -> riders -> cac bang con.
const DEFAULT_TABLES = [
  "zones",
  "riders",
  "rider_off_requests",
  "attendance_logs",
  "activity_logs",
  "delivery_order",
  "delivery_volume",
  "pickup_volume",
  "pickup_assignments",
  "pickup_replacements",
  "realtime_delivery_riders",
  "realtime_delivery_riders_10am",
  "driver_performance_daily",
  "rider_violations",
  "return_order_assignments",
  "return_order_handovers",
  "return_order_snapshots",
  "morning_delivery_assignments",
  "morning_delivery_absence_notes",
  "member_tasks",
];
// Bo qua bang gan voi user cu the (auth id khac nhau giua 2 project).
const SKIP_TABLES = new Set([
  "profiles",
  "personal_notes",
  "ai_user_preferences",
  "ai_conversations",
  "ai_messages",
  "ai_pending_actions",
  "import_batches",
  "attendance_sheet_sync_outbox",
]);

const SOURCE_URL = process.env.OPS56_URL;
const SOURCE_KEY = process.env.OPS56_SERVICE_KEY;
const TARGET_URL = process.env.TARGET_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const TARGET_KEY = process.env.TARGET_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAGE = Number(process.env.OPS56_PAGE ?? "1000");
const TABLES = (process.env.OPS56_TABLES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((t) => !SKIP_TABLES.has(t));

const tables = TABLES.length > 0 ? TABLES : DEFAULT_TABLES;

if (!SOURCE_URL || !SOURCE_KEY) {
  console.error("Thieu OPS56_URL hoac OPS56_SERVICE_KEY. Xem header script de biet cach set.");
  process.exit(1);
}
if (!TARGET_URL || !TARGET_KEY) {
  console.error("Thieu TARGET (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_role KEY trong .env).");
  process.exit(1);
}
if (SOURCE_URL === TARGET_URL) {
  console.error("SOURCE trung TARGET — dung lai de tranh tu copy vao chinh minh.");
  process.exit(1);
}

const src = createClient(SOURCE_URL, SOURCE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const dst = createClient(TARGET_URL, TARGET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function tableExists(client, table) {
  const { error } = await client.from(table).select("id").limit(1);
  if (!error) return true;
  // 42P01 = undefined_table; PGRSTxxx = bang khong ton tai / khong co quyen.
  console.warn(`  [warn] khong doc duoc "${table}": ${error.message}`);
  return false;
}

async function copyTable(table) {
  if (!(await tableExists(src, table))) return { table, status: "skip (source thieu)" };
  if (!(await tableExists(dst, table))) {
    return { table, status: "skip (target thieu — chay prisma/*.sql tuong ung truoc)" };
  }
  let from = 0;
  let total = 0;
  for (;;) {
    const { data, error } = await src
      .from(table)
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { table, status: `loi doc source: ${error.message} (da copy ${total})` };
    if (!data || data.length === 0) break;
    // Upsert theo id de chay lai nhieu lan van an toan.
    const { error: upErr } = await dst.from(table).upsert(data, { onConflict: "id" });
    if (upErr) return { table, status: `loi ghi target: ${upErr.message} (da copy ${total})` };
    total += data.length;
    from += data.length;
    if (data.length < PAGE) break;
  }
  return { table, status: `ok (${total} rows)` };
}

console.log(`SOURCE: ${SOURCE_URL}`);
console.log(`TARGET: ${TARGET_URL}`);
const results = [];
for (const t of tables) {
  process.stdout.write(`- ${t}... `);
  const r = await copyTable(t);
  results.push(r);
  console.log(r.status);
}
console.log("\nXong. Refresh /dashboard de kiem tra.");
