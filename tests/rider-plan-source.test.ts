import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readRiderPlan } from "../lib/google/rider-plan-source.ts";
import { RIDER_PLAN_ID, RIDER_PLAN_TAB } from "../lib/google/rider-plan.ts";

test("manual sync reads the approved source with header mapping and rejects Google errors", async () => {
  const originalFetch = globalThis.fetch;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "test@example.com";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  let denied = false;
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "test-token" });
    assert.ok(url.startsWith(`https://sheets.googleapis.com/v4/spreadsheets/${RIDER_PLAN_ID}/values/`));
    assert.ok(decodeURIComponent(url).includes(`'${RIDER_PLAN_TAB}'!A1:Z5001`));
    assert.equal(options?.cache, "no-store");
    if (denied) return Response.json({ error: { message: "Access denied" } }, { status: 403 });
    return Response.json({ values: [
      ["Summary"],
      ["Driver ID", "Tên tài xế", "Khu vực", "COT", "Quận lấy", "Phường lấy", "Quận giao", "Phường giao"],
      ["12345", "Rider test", "KV1", "COT 1", "", "", "Quận 5", "Phường 1"],
      ["23456", "Invalid area", "KV6", "COT 1"],
    ] });
  };
  try {
    const result = await readRiderPlan();
    assert.equal(result.riders.length, 1);
    assert.equal(result.riders[0].delivery_ward, "Phường 1");
    assert.equal(result.riders[0].cot, "COT1");
    assert.equal("point_name" in result.riders[0], false, "sync must preserve existing pickup point names");
    assert.equal("metadata" in result.riders[0], false, "source metadata must not become a database column");
    assert.equal(result.skipped_rows, 1);
    denied = true;
    await assert.rejects(readRiderPlan(), /Access denied/);
  } finally {
    globalThis.fetch = originalFetch;
    if (email === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    else process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = email;
    if (key === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    else process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = key;
  }
});
