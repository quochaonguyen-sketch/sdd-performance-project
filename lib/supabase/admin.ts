import "server-only";
import { createClient } from "@supabase/supabase-js";
import { auditRequestHeaders } from "@/lib/audit/actor";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  let actor: Promise<Record<string, string>> | undefined;
  return createClient(url, serviceRoleKey, {
    global: {
      fetch: async (input, init) => {
        const method = (init?.method ?? "GET").toUpperCase();
        if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
          actor ??= auditRequestHeaders();
          const requestHeaders = new Headers(init?.headers);
          requestHeaders.delete("x-app-actor-id");
          requestHeaders.delete("x-app-audit-path");
          for (const [key, value] of Object.entries(await actor)) requestHeaders.set(key, value);
          return fetch(input, { ...init, headers: requestHeaders });
        }
        return fetch(input, init);
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
