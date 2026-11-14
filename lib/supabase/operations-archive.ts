import { createOHArchiveClient } from "../onhold/archive.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

export const operationsArchiveKinds = ["return", "pickup_cot", "wh", "backlog_pickup", "backlog_delivery"] as const;
export type OperationsArchiveKind = typeof operationsArchiveKinds[number];

export function operationsArchiveWindow() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const offset = (days: number) => new Date(Date.parse(today) - days * 86_400_000).toISOString().slice(0, 10);
  return { today, since: offset(93), yesterday: offset(1) };
}

export type OperationsArchiveVersion = { report_date: string; version: string };

export async function readOperationsVersions(primary: SupabaseClient, kind: OperationsArchiveKind, from: string, to: string, signal: AbortSignal) {
  const { data, error } = await primary.rpc("read_operations_archive_versions", { p_kind: kind, p_from: from, p_to: to }).abortSignal(signal);
  if (error || !Array.isArray(data)) throw new Error(`Không đọc được phiên bản ${kind} (${error?.code ?? "invalid"}).`);
  return data as OperationsArchiveVersion[];
}

/** Null means use the primary source for the whole historical range. */
export async function readOperationsArchive<T>(primary: SupabaseClient, kind: OperationsArchiveKind, from: string, to: string, signal?: AbortSignal): Promise<T[] | null> {
  const { since, yesterday } = operationsArchiveWindow();
  if (from < since || from > to || to > yesterday) return null;
  try {
    const archive = createOHArchiveClient();
    if (!archive) return null;
    const deadline = AbortSignal.timeout(4_000);
    const request = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const versions = await readOperationsVersions(primary, kind, from, to, request);
    if (!versions.length) return [];
    const { data, error } = await archive.from("operations_archive_days").select("report_date,version,payload")
      .eq("kind", kind).in("report_date", versions.map(row => row.report_date)).order("report_date").abortSignal(request);
    const expected = new Map(versions.map(row => [row.report_date, row.version]));
    if (error || data?.length !== expected.size || data.some(row => row.version !== expected.get(row.report_date))) return null;
    return data.map(row => row.payload as T);
  } catch {
    return null;
  }
}
