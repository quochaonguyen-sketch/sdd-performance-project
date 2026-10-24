import test from "node:test";
import assert from "node:assert/strict";
import { canEditRiderArea, normalizeRiderEditAreas } from "../lib/auth/rider-scope.ts";

test("FTE needs both rider permission and the target area", () => {
  assert.equal(canEditRiderArea("member", true, ["KV1"], "KV1"), true);
  assert.equal(canEditRiderArea("member", true, ["KV1"], "KV2"), false);
  assert.equal(canEditRiderArea("member", false, ["KV1"], "KV1"), false);
  assert.equal(canEditRiderArea("leader", true, [], "KV1"), false);
  assert.equal(canEditRiderArea("member", true, ["KV1"], null), false);
});
test("scope accepts only configured operating areas and defaults closed", () => {
  assert.deepEqual(normalizeRiderEditAreas(["KV1", "KV1", "Khu vực 2", "KV6", "all", 1]), ["KV1", "KV2"]);
  assert.deepEqual(normalizeRiderEditAreas(undefined), []);
  assert.deepEqual(normalizeRiderEditAreas("KV1"), []);
  assert.equal(canEditRiderArea("admin", false, [], "KV5"), true);
});
