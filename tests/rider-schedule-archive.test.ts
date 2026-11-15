import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { readScheduleArchive } from "../lib/attendance/schedule-archive.ts";

test("the rider schedule reads an exact archive version and refreshes a stale monthly copy", async t => {
  const primaryUrl = "https://riderprimary.supabase.co";
  const targetUrl = "https://riderarchive.supabase.co";
  const config = { NEXT_PUBLIC_SUPABASE_URL: primaryUrl, SUPABASE_ARCHIVE_URL: targetUrl, SUPABASE_ARCHIVE_KEY: "test-key" };
  const previous = new Map(Object.keys(config).map(key => [key, process.env[key]]));
  Object.assign(process.env, config);
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const version = "a".repeat(32);
  const row = { rider_code: "R01", work_date: "2026-11-10", status: "OFF_WEEKLY" };
  const calls: string[] = [];
  let stale = false;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const body = JSON.parse(String(init.body));
    const rpc = url.pathname.split("/").at(-1);
    if (rpc === "rider_schedule_archive_snapshot") {
      assert.equal(url.origin, primaryUrl);
      calls.push(body.p_include_rows ? "full" : "version");
      return Response.json({ version, captured_at: "2026-11-15T00:00:00Z", row_count: 1, rows: body.p_include_rows ? [row] : null });
    }
    assert.equal(url.origin, targetUrl);
    assert.equal(body.p_version, version);
    assert.equal(body.p_month, "2026-11-01");
    if (rpc === "publish_rider_schedule_archive") {
      calls.push("publish");
      assert.deepEqual(body.p_rows, [row]);
      return new Response(null, { status: 204 });
    }
    calls.push(body.p_code ? "rider" : "month");
    return Response.json(stale ? null : [row]);
  });
  const primary = createClient(primaryUrl, "test-key");
  assert.deepEqual(await readScheduleArchive(primary, "2026-11", "R01"), [row]);
  stale = true;
  assert.equal(await readScheduleArchive(primary, "2026-11", "R01"), null);
  assert.deepEqual(await readScheduleArchive(primary, "2026-11"), [row]);
  assert.deepEqual(calls, ["version", "rider", "version", "rider", "version", "month", "full", "publish"]);
});
