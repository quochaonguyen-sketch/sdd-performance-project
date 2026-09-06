import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type CurrentUserContext = {
  user: {
    id: string;
    email: string;
  };
  profile: {
    full_name: string | null;
    role: string;
  };
};

/**
 * Resolves the signed-in operator once per Server Component render.
 *
 * getClaims verifies the session JWT and avoids an unnecessary Auth server
 * round-trip when the Supabase project uses asymmetric signing keys.
 */
export const getCurrentUserContext = cache(async (): Promise<CurrentUserContext | null> => {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;

  if (claimsError || !userId) {
    return null;
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("full_name, role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Unable to load the signed-in user's profile: ${profileError.message}`);
  }

  const email = typeof claimsData.claims.email === "string" ? claimsData.claims.email : "";

  if (!profile) {
    // Self-heal: user exists in auth.users but has no public.profiles row
    // (e.g. created manually in the dashboard, no signup trigger yet).
    const { data: created, error: upsertError } = await admin
      .from("profiles")
      .upsert({ id: userId, email: email || null, role: "viewer" }, { onConflict: "id" })
      .select("full_name, role")
      .single();

    if (upsertError || !created) {
      throw new Error(
        `Signed-in user has no profile row. Ask an admin to run: insert into public.profiles (id, email, role) values ('${userId}', '${email}', 'viewer'). Cause: ${upsertError?.message ?? "unknown"}`
      );
    }

    return {
      user: { id: userId, email },
      profile: created,
    };
  }

  return {
    user: {
      id: userId,
      email,
    },
    profile,
  };
});
