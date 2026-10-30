import test from "node:test";
import assert from "node:assert/strict";
import { readJsonResponse } from "../lib/http/json-response.ts";

test("HTML 404 and login pages produce a readable error without leaking HTML", async () => {
  for (const status of [200, 404, 502]) {
    await assert.rejects(readJsonResponse(new Response("<!DOCTYPE html><h1>Error</h1>", { status, headers: { "Content-Type": "text/html" } }), "Dashboard"), error => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes(`HTTP ${status}`));
      assert.ok(!error.message.includes("Unexpected token"));
      assert.ok(!error.message.includes("DOCTYPE"));
      return true;
    });
  }
});
test("valid JSON and server errors remain available to the caller", async () => {
  assert.deepEqual(await readJsonResponse(Response.json({ orders: 123 }), "Dashboard"), { orders: 123 });
  const response = Response.json({ error: "Chưa đăng nhập" }, { status: 401 });
  assert.deepEqual(await readJsonResponse(response, "Dashboard"), { error: "Chưa đăng nhập" });
  assert.equal(response.status, 401);
});
test("malformed JSON produces a readable data error", async () => {
  await assert.rejects(readJsonResponse(new Response("{broken", { headers: { "Content-Type": "application/json" } }), "Dashboard"), /Dashboard: phản hồi dữ liệu không hợp lệ/);
});
