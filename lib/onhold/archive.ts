import { createClient } from "@supabase/supabase-js";

export function createOHArchiveClient() {
  const url = process.env.SUPABASE_ARCHIVE_URL?.trim();
  const key = process.env.SUPABASE_ARCHIVE_KEY?.trim();
  if (!url || !key) return null;
  const target = new URL(url);
  if (target.protocol !== "https:" || !/^[a-z0-9]+\.supabase\.co$/.test(target.hostname) || target.origin !== url.replace(/\/$/, "")) {
    throw Error("SUPABASE_ARCHIVE_URL phải là Project URL của Supabase.");
  }
  if (target.hostname === new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname) {
    throw Error("Supabase lưu trữ phải là project khác Supabase chính.");
  }
  return createClient(target.origin, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
