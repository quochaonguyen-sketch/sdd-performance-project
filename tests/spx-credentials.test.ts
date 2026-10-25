import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, privateDecrypt, constants, createDecipheriv } from "node:crypto";
import { encryptSpxCredentials, validCredentialEnvelope } from "../lib/data-sources/spx-credentials.ts";

test("browser envelope hides credentials and is authenticated to the worker and key", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const keyId = "a".repeat(64);
  const envelope = await encryptSpxCredentials("worker", pem, keyId, " test-user ", "dummy-password");
  assert.equal(validCredentialEnvelope(envelope), true);
  assert.equal(JSON.stringify(envelope).includes("dummy-password"), false);
  assert.equal(JSON.stringify(envelope).includes("test-user"), false);
  const key = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(envelope.key, "base64"));
  const decrypt = (aad: string) => {
    const data = Buffer.from(envelope.data, "base64");
    const cipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
    cipher.setAAD(Buffer.from(aad)); cipher.setAuthTag(data.subarray(-16));
    return Buffer.concat([cipher.update(data.subarray(0, -16)), cipher.final()]).toString();
  };
  assert.deepEqual(JSON.parse(decrypt(`worker:${keyId}`)), { username: "test-user", password: "dummy-password" });
  assert.throws(() => decrypt(`other-worker:${keyId}`));
  for (const invalid of [null, {}, { ...envelope, password: "plain" }, { ...envelope, iv: "bad" }, { ...envelope, keyId: "bad" }, { ...envelope, data: "x".repeat(9000) }]) assert.equal(validCredentialEnvelope(invalid), false);
});

test("empty and oversized credentials are rejected before encryption", async () => {
  for (const [name, password] of [["", "pw"], ["user", ""], ["x".repeat(257), "pw"], ["user", "x".repeat(1025)]]) {
    await assert.rejects(encryptSpxCredentials("worker", "", "a".repeat(64), name, password));
  }
});
