import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizePermissions, type MemberPermissions } from "@/lib/auth/permissions";
import { normalizeRiderEditAreas } from "@/lib/auth/rider-scope";
import {loadRoleAccess} from "@/lib/auth/role-access-server";
import {viewPermissions,type PageAccess} from "@/lib/auth/page-access";

export type CurrentUserContext = {
  user: {
    id: string;
    email: string;
  };
  profile: {
    full_name: string | null;
    role: string;
    permissions: MemberPermissions;
    rider_edit_areas: string[];
    page_access?: PageAccess;
  };
};

export const getCurrentUserContext = cache(async (): Promise<CurrentUserContext | null> => {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;

  if (claimsError || !userId) {
    return null;
  }

  const email = typeof claimsData.claims.email === "string" ? claimsData.claims.email.trim().toLowerCase() : "";
  if (!email.endsWith("@spxexpress.com")) return null;

  const admin = createAdminClient();
  const [{ data: profile, error: profileError }, { data: authUser, error: authError }] = await Promise.all([
    admin.from("profiles").select("full_name, role, email").eq("id", userId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);

  if (profileError) {
    throw new Error(`Unable to load the signed-in user's profile: ${profileError.message}`);
  }

  const { data: byEmail } = profile
    ? { data: profile }
    : await admin.from("profiles").select("full_name, role, email").eq("email", email).maybeSingle();

  if (!byEmail) return null;

  if (authError || !authUser.user) throw new Error("Không tải được quyền hiện tại của tài khoản.");
  const page_access=await loadRoleAccess(byEmail.role);
  const storedPermissions=normalizePermissions(authUser.user?.app_metadata?.permissions, byEmail.role);
  const permissions = ["member","leader"].includes(byEmail.role)?viewPermissions(storedPermissions,page_access):storedPermissions;

  return {
    user: { id: userId, email },
    profile: {
      full_name: byEmail.full_name,
      role: byEmail.role,
      permissions,
      page_access,
      rider_edit_areas: normalizeRiderEditAreas(authUser.user.app_metadata?.rider_edit_areas),
    },
  };
});
