import "server-only";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

/** Actor is derived from verified session claims, never incoming actor headers. */
export async function auditRequestHeaders(): Promise<Record<string, string>> {
  let requestHeaders: Headers;
  try { requestHeaders = await headers(); } catch { return {}; }
  const client = await createClient();
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims.sub) return {};
  const result: Record<string, string> = { "x-app-actor-id": data.claims.sub };
  const referrer = requestHeaders.get("referer");
  if (referrer) {
    try { result["x-app-audit-path"] = new URL(referrer).pathname.slice(0, 250); } catch { /* No path for malformed referrers. */ }
  }
  return result;
}
