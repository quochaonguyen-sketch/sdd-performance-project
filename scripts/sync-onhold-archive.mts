import nextEnv from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createOHArchiveClient } from "../lib/onhold/archive.ts";
import type { OHData } from "../lib/onhold/model.ts";
import { packOHPivot } from "../lib/onhold/transport.ts";
import { syncOperationsArchive } from "./sync-operations-archive.mts";

type ReportVersion = { report_date: string; fetched_at: string; finalized_at: string };

nextEnv.loadEnvConfig(process.cwd(), true);

async function syncOnhold(primary: SupabaseClient, archive: SupabaseClient, dryRun: boolean) {
  const columns = "report_date,fetched_at,finalized_at";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const since = new Date(Date.parse(today) - 93 * 86_400_000).toISOString().slice(0, 10);

  const [source, target] = await Promise.all([
    primary.from("onhold_daily_reports").select(columns).gte("report_date", since).lt("report_date", today)
      .not("finalized_at", "is", null).order("report_date").abortSignal(AbortSignal.timeout(12_000)),
    archive.from("onhold_archive_days").select(columns).gte("report_date", since).lt("report_date", today)
      .abortSignal(AbortSignal.timeout(12_000)),
  ]);
  if (source.error) throw Error(`Không đọc được danh sách OH từ Supabase chính (${source.error.code}).`);
  if (target.error) throw Error(`Không đọc được Supabase lưu trữ (${target.error.code}). Kiểm tra khóa và schema.`);

  const archived = new Map((target.data as ReportVersion[]).map(report => [report.report_date, report]));
  const reports = source.data as ReportVersion[];
  const pending = reports.filter(report => {
    const copy = archived.get(report.report_date);
    return copy?.fetched_at !== report.fetched_at || copy?.finalized_at !== report.finalized_at;
  });

  let copied = 0;
  if (!dryRun) for (const report of pending) {
    const day = report.report_date;
    const sourceDay = await primary.rpc("read_onhold_pivot", { p_from: day, p_to: day }).abortSignal(AbortSignal.timeout(25_000));
    if (sourceDay.error) throw Error(`Không đọc được báo cáo OH ${day} (${sourceDay.error.code}).`);
    const data = sourceDay.data as OHData;
    const current = data.reports[0];
    if (data.reports.length !== 1 || current.report_date !== day || current.fetched_at !== report.fetched_at
      || current.finalized_at !== report.finalized_at || data.cells.some(cell => cell.report_date !== day)
      || data.cells.reduce((total, cell) => total + cell.orders, 0) !== current.total_orders) {
      throw Error(`Báo cáo OH ${day} thay đổi hoặc chưa đủ dữ liệu. Hãy chạy lại đồng bộ.`);
    }
    const result = await archive.rpc("publish_onhold_archive_day", {
      p_day: day, p_fetched_at: report.fetched_at, p_finalized_at: report.finalized_at, p_payload: packOHPivot(data),
    }).abortSignal(AbortSignal.timeout(25_000));
    if (result.error) throw Error(`Không ghi được báo cáo OH ${day} vào Supabase lưu trữ (${result.error.code}).`);
    copied++;
  }
  console.log(JSON.stringify({ mode: dryRun ? "check" : "sync", finalized: reports.length, current: reports.length - pending.length, pending: pending.length, copied }));
}

async function sync() {
  const archive = createOHArchiveClient();
  if (!archive) throw Error("Cần cấu hình SUPABASE_ARCHIVE_URL và SUPABASE_ARCHIVE_KEY trên máy chủ.");
  const primary = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const dryRun = process.argv.includes("--check");
  const jobs = await Promise.allSettled([syncOnhold(primary, archive, dryRun), syncOperationsArchive(primary, archive, dryRun)]);
  for (const job of jobs) if (job.status === "rejected") {
    console.error(job.reason instanceof Error ? job.reason.message : "Đồng bộ thất bại.");
    process.exitCode = 1;
  }
}

sync().catch(error => { console.error(error instanceof Error ? error.message : "Đồng bộ thất bại."); process.exitCode = 1; });
