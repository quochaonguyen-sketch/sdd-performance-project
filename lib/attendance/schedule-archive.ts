import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttendanceLog } from "../../types.ts";
import { createOHArchiveClient } from "../onhold/archive.ts";

export type ScheduleSnapshot = { version: string; captured_at: string; row_count: number; rows: AttendanceLog[] | null };

export async function readScheduleSnapshot(primary: SupabaseClient, month: string, includeRows = false) {
  const { data, error } = await primary.rpc("rider_schedule_archive_snapshot", {
    p_month: `${month}-01`, p_include_rows: includeRows,
  }).abortSignal(AbortSignal.timeout(12_000));
  const snapshot = data as ScheduleSnapshot | null;
  if (error || !snapshot || !/^[a-f0-9]{32}$/.test(snapshot.version) || !Number.isInteger(snapshot.row_count) ||
    (includeRows && (!Array.isArray(snapshot.rows) || snapshot.rows.length !== snapshot.row_count))) {
    throw Error("Không đọc được snapshot lịch rider từ Supabase chính.");
  }
  return snapshot;
}

export async function publishScheduleSnapshot(archive: SupabaseClient, month: string, snapshot: ScheduleSnapshot) {
  const { error } = await archive.rpc("publish_rider_schedule_archive", {
    p_month: `${month}-01`, p_version: snapshot.version, p_captured_at: snapshot.captured_at,
    p_count: snapshot.row_count, p_rows: snapshot.rows,
  }).abortSignal(AbortSignal.timeout(12_000));
  if (error) throw Error("Không lưu được snapshot lịch rider vào Supabase thứ hai.");
}

export async function readScheduleArchive(primary: SupabaseClient, month: string, riderCode?: string) {
  try {
    const archive = createOHArchiveClient();
    if (!archive) return null;
    const source = await readScheduleSnapshot(primary, month);
    const { data, error } = await archive.rpc("read_archived_rider_schedule", {
      p_month: `${month}-01`, p_version: source.version, p_code: riderCode ?? null,
    }).abortSignal(AbortSignal.timeout(4_000));
    if (error) return null;
    if (Array.isArray(data) && (riderCode || data.length === source.row_count)) return data as AttendanceLog[];
    if (riderCode) return null;

    // The monthly view refreshes the archive after a schedule change.
    const fresh = await readScheduleSnapshot(primary, month, true);
    await publishScheduleSnapshot(archive, month, fresh).catch(() => undefined);
    return fresh.rows;
  } catch {
    return null;
  }
}

export async function syncScheduleArchive(primary: SupabaseClient, archive: SupabaseClient, apply: boolean) {
  const [source, target] = await Promise.all([
    primary.rpc("rider_schedule_archive_months").abortSignal(AbortSignal.timeout(12_000)),
    archive.from("rider_schedule_archive").select("schedule_month,version,row_count").abortSignal(AbortSignal.timeout(12_000)),
  ]);
  if (target.error?.code === "PGRST205" || target.error?.code === "42P01") return null;
  if (target.error || !target.data) throw Error("Chưa đọc được bảng rider_schedule_archive ở Supabase thứ hai.");
  if (source.error || !Array.isArray(source.data)) throw Error("Chưa đọc được danh sách tháng từ Supabase chính.");

  const saved = new Map(target.data.map(row => [String(row.schedule_month), row]));
  const months = [...new Set([...source.data.map(row => String(row.schedule_month)), ...saved.keys()])].sort();
  let pending = 0;
  let copied = 0;
  let rows = 0;
  for (const date of months) {
    const month = date.slice(0, 7);
    const version = await readScheduleSnapshot(primary, month);
    const existing = saved.get(date);
    if (existing?.version === version.version && existing.row_count === version.row_count) {
      rows += version.row_count;
    } else if (apply) {
      const snapshot = await readScheduleSnapshot(primary, month, true);
      await publishScheduleSnapshot(archive, month, snapshot);
      rows += snapshot.row_count;
      copied++;
    } else {
      rows += version.row_count;
      pending++;
    }
  }
  return { months: months.length, rows, copied, pending };
}
