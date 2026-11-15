import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { readWhSnapshots } from "../lib/wh/archive.ts";
import { operationsArchiveWindow, readOperationsArchive } from "../lib/supabase/operations-archive.ts";

const primaryUrl = "https://primarytest.supabase.co";
const archiveUrl = "https://archivetest.supabase.co";
const day = "2026-11-15";
const snapshot = { report_date: day, snapshot_at: "2026-11-15T03:00:00Z", orders: [{ raw_status: "Onhold" }] };

test("HV archive reads full snapshots from the second project and keeps primary out of the read path", async (t) => {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: primaryUrl,
    SUPABASE_ARCHIVE_URL: archiveUrl,
    SUPABASE_ARCHIVE_KEY: "test-key",
    WH_SUPABASE_ARCHIVE_ENABLED: "1",
  })) {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  }
  t.after(() => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  const urls: URL[] = [];
  const { yesterday } = operationsArchiveWindow();
  const historical = { ...snapshot, report_date: yesterday, snapshot_at: `${yesterday}T03:00:00Z`, job_id: "history-job" };
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    urls.push(url);
    if (url.pathname.endsWith("/rpc/read_operations_archive_versions")) {
      return Response.json([{ report_date: yesterday, version: JSON.stringify([historical.job_id, historical.snapshot_at]) }]);
    }
    if (url.origin === archiveUrl && !url.searchParams.has("version")) {
      return Response.json([{ report_date: yesterday, version: "wh-full:history-job", payload: historical }]);
    }
    return url.origin === archiveUrl
      ? Response.json([{ report_date: day, payload: snapshot }])
      : Response.json([snapshot]);
  });
  const primary = createClient(primaryUrl, "test-key");
  assert.deepEqual(await readWhSnapshots(primary, { from: day, to: day }), [snapshot]);
  assert.equal(urls.length, 1);
  assert.equal(urls[0].pathname, "/rest/v1/operations_archive_days");
  assert.equal(urls[0].searchParams.get("version"), "like.wh-full:%");
  assert.deepEqual(urls[0].searchParams.getAll("report_date"), [`gte.${day}`, `lte.${day}`]);

  process.env.SUPABASE_ARCHIVE_URL = primaryUrl;
  await assert.rejects(readWhSnapshots(primary), /phải là project khác/);
  assert.equal(urls.length, 1);

  process.env.WH_SUPABASE_ARCHIVE_ENABLED = "0";
  assert.deepEqual(await readWhSnapshots(primary), [snapshot]);
  assert.equal(urls[1].origin, primaryUrl);
  assert.equal(urls[1].pathname, "/rest/v1/wh_tracking_snapshots");
  process.env.SUPABASE_ARCHIVE_URL = archiveUrl;
  assert.deepEqual(await readOperationsArchive(primary, "wh", yesterday, yesterday), [historical]);
});
