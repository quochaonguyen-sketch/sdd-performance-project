import { deepStrictEqual, ok } from "node:assert";
import { setTimeout as delay } from "node:timers/promises";
import nextEnv from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createOHArchiveClient } from "../lib/onhold/archive.ts";

const snapshotsTable = "backlog_snapshots";
const rowsTable = "backlog_snapshot_rows";
const rowKey = "snapshot_id,area,district,ward";
const pageSize = 1000;
const groupSize = 32;
const concurrency = 6;
const apply = process.argv.includes("--apply");

type Result<T> = { data: T | null; error: { code: string } | null; status: number };

async function request<T>(label: string, query: () => PromiseLike<Result<T>>) {
  for (let attempt = 0; ; attempt++) {
    const { data, error, status } = await query();
    if (!error) return data;
    if (attempt === 3 || (status >= 400 && status < 500 && status !== 429)) {
      throw Error(`${label} (${error.code || status}).`);
    }
    await delay(500 * 2 ** attempt);
  }
}

async function readSnapshots(client: SupabaseClient, cutoff: string) {
  const snapshots: { id: string }[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await request("Không đọc được backlog_snapshots từ database chính", () =>
      client.from(snapshotsTable).select("*").lte("captured_at", cutoff).order("id")
        .range(offset, offset + pageSize - 1).abortSignal(AbortSignal.timeout(30_000)),
    );
    ok(page, "Database chính trả về danh sách snapshot rỗng bất thường.");
    snapshots.push(...page);
    if (page.length < pageSize) return snapshots;
  }
}

async function readRows(client: SupabaseClient, ids: string[], label: string) {
  const rows: { snapshot_id: string; area: string; district: string; ward: string }[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await request(label, () =>
      client.from(rowsTable).select("*").in("snapshot_id", ids)
        .order("snapshot_id").order("area").order("district").order("ward")
        .range(offset, offset + pageSize - 1).abortSignal(AbortSignal.timeout(30_000)),
    );
    ok(page, label);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function copyGroup(primary: SupabaseClient, archive: SupabaseClient, snapshots: { id: string }[]) {
  const ids = snapshots.map(({ id }) => id);
  const rows = await readRows(primary, ids, "Không đọc được backlog_snapshot_rows từ database chính");

  if (apply) {
    await request("Không ghi được backlog_snapshots vào database thứ hai", () =>
      archive.from(snapshotsTable).upsert(snapshots, { onConflict: "id" })
        .abortSignal(AbortSignal.timeout(30_000)),
    );
    for (let offset = 0; offset < rows.length; offset += pageSize) {
      await request("Không ghi được backlog_snapshot_rows vào database thứ hai", () =>
        archive.from(rowsTable).upsert(rows.slice(offset, offset + pageSize), { onConflict: rowKey })
          .abortSignal(AbortSignal.timeout(30_000)),
      );
    }
  }

  const [savedSnapshots, savedRows] = await Promise.all([
    request("Không đối chiếu được backlog_snapshots tại database thứ hai", () =>
      archive.from(snapshotsTable).select("*").in("id", ids).order("id")
        .abortSignal(AbortSignal.timeout(30_000)),
    ),
    readRows(archive, ids, "Không đối chiếu được backlog_snapshot_rows tại database thứ hai"),
  ]);
  try {
    deepStrictEqual(savedSnapshots, snapshots);
    deepStrictEqual(savedRows, rows);
  } catch {
    throw Error(`Dữ liệu giữa hai database chưa khớp tại nhóm snapshot bắt đầu bằng ${ids[0]}.`);
  }
  return rows.length;
}

async function main() {
  nextEnv.loadEnvConfig(process.cwd(), true);
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  const archive = createOHArchiveClient();
  if (!url || !key || !archive) throw Error("Cần cấu hình đầy đủ hai Supabase.");
  const primary = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  await Promise.all([snapshotsTable, rowsTable].map((table) =>
    request(`Chưa truy cập được ${table} tại database thứ hai`, () =>
      archive.from(table).select("*").limit(1).abortSignal(AbortSignal.timeout(30_000)),
    ),
  ));

  const cutoff = new Date().toISOString();
  const snapshots = await readSnapshots(primary, cutoff);
  let verifiedRows = 0;
  const batchSize = concurrency * groupSize;
  console.log(JSON.stringify({ mode: apply ? "apply" : "check", cutoff, snapshots: snapshots.length }));
  for (let offset = 0; offset < snapshots.length; offset += batchSize) {
    const batch = snapshots.slice(offset, offset + batchSize);
    const counts = await Promise.all(Array.from(
      { length: Math.ceil(batch.length / groupSize) },
      (_, group) => copyGroup(primary, archive, batch.slice(group * groupSize, (group + 1) * groupSize)),
    ));
    verifiedRows += counts.reduce((sum, count) => sum + count, 0);
    console.log(JSON.stringify({ verifiedSnapshots: offset + batch.length, verifiedRows }));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Lỗi khi sao chép backlog.");
  process.exitCode = 1;
});
