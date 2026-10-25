export type CredentialEnvelope = { version: 1; keyId: string; key: string; iv: string; data: string };

export function validCredentialEnvelope(value: unknown): value is CredentialEnvelope {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  const base64 = (v: unknown, min: number, max: number) => typeof v === "string" && v.length >= min && v.length <= max && /^[A-Za-z0-9+/]+={0,2}$/.test(v) && v.length % 4 === 0;
  return Object.keys(e).length === 5 && e.version === 1 && typeof e.keyId === "string" && /^[a-f0-9]{64}$/.test(e.keyId)
    && base64(e.key, 344, 344) && base64(e.iv, 16, 16) && base64(e.data, 24, 8192);
}

export async function encryptSpxCredentials(worker: string, publicKey: string, keyId: string, username: string, password: string): Promise<CredentialEnvelope> {
  const name = username.trim();
  if (!name || name.length > 256 || !password || password.length > 1024) throw new Error("Nhập tài khoản (tối đa 256 ký tự) và mật khẩu SPX (tối đa 1024 ký tự).");
  if (!globalThis.crypto?.subtle) throw new Error("Cần mở website bằng HTTPS hoặc localhost để mã hóa tài khoản SPX.");
  const bytes = Uint8Array.from(atob(publicKey.replace(/-----[^-]+-----|\s/g, "")), c => c.charCodeAt(0));
  const rsa = await crypto.subtle.importKey("spki", bytes, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const aes = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(`${worker}:${keyId}`) }, aes, encoder.encode(JSON.stringify({ username: name, password })));
  const wrapped = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, rsa, await crypto.subtle.exportKey("raw", aes));
  const encode = (v: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(v instanceof Uint8Array ? v.buffer : v)));
  return { version: 1, keyId, key: encode(wrapped), iv: encode(iv), data: encode(data) };
}
