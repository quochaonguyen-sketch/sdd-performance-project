import { createHmac, timingSafeEqual } from "node:crypto";
import type { PlanChange } from "./schema.ts";

function sign(value: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Máy chủ chưa cấu hình Supabase.");
  return createHmac("sha256", secret).update(value).digest("base64url");
}
export function createPlanPreviewToken(userId: string, changes: PlanChange[]) {
  const data = Buffer.from(JSON.stringify({ userId, expires: Date.now() + 600_000, digest: sign(JSON.stringify(changes)) })).toString("base64url");
  return `${data}.${sign(data)}`;
}
export function verifyPlanPreviewToken(token: string, userId: string, changes: PlanChange[]) {
  try {
    const [data, signature] = token.split(".");
    const expected = Buffer.from(sign(data));
    const received = Buffer.from(signature ?? "");
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
    const value = JSON.parse(Buffer.from(data, "base64url").toString());
    return value.userId === userId && value.expires > Date.now() && value.digest === sign(JSON.stringify(changes));
  } catch { return false; }
}
