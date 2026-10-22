import test from "node:test";
import assert from "node:assert/strict";
import { canManageRiders, canManageReturn, canAccessPickupManagement, normalizePermissions } from "../lib/auth/permissions.ts";

test("leaders inherit operational permissions from the authenticated context", () => {
  const permissions = normalizePermissions(undefined, "leader");
  assert.equal(canManageRiders("leader", permissions), true);
  assert.equal(canManageReturn("leader", permissions), true);
  assert.equal(canAccessPickupManagement("leader", permissions), true);
});
test("explicitly revoked leader permissions stay revoked", () => {
  const permissions = normalizePermissions({ manage_riders: false, manage_return: false, manage_pickup: false }, "leader");
  assert.equal(canManageRiders("leader", permissions), false);
  assert.equal(canManageReturn("leader", permissions), false);
  assert.equal(canAccessPickupManagement("leader", permissions), false);
});
test("members can only manage the specific functions they were granted", () => {
  const permissions = normalizePermissions({ manage_riders: true }, "member");
  assert.equal(canManageRiders("member", permissions), true);
  assert.equal(canAccessPickupManagement("member", permissions), false);
  assert.equal(canManageReturn("member", permissions), false);
});
test("missing permission context does not grant access to non-admin callers", () => {
  for (const role of ["leader", "member", "viewer", undefined]) {
    assert.equal(canManageRiders(role), false);
    assert.equal(canAccessPickupManagement(role), false);
  }
  assert.equal(canManageRiders("admin"), true);
});
