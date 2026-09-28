import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_DOMAIN = "@spxexpress.com";

function redirectWithError(origin: string, code: string) {
  return NextResponse.redirect(new URL(`/login?error=${code}`, origin));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;

  if (!code) return redirectWithError(origin, "oauth_code");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const email = data.user?.email?.trim().toLowerCase() ?? "";

  if (error || !data.user) return redirectWithError(origin, "oauth_exchange");

  if (!email.endsWith(ALLOWED_DOMAIN)) {
    await supabase.auth.signOut();
    return redirectWithError(origin, "domain");
  }

  const admin = createAdminClient();
  const bootstrapEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const [{ data: allowed }, { data: admins }] = await Promise.all([
    admin.from("profiles").select("id, role, full_name").eq("email", email).maybeSingle(),
    admin.from("profiles").select("id").eq("role", "admin").limit(1),
  ]);

  const noAdminYet = !admins?.length;
  const isBootstrapEmail = bootstrapEmail !== "" && email === bootstrapEmail;
  const canCreateAdmin = noAdminYet || isBootstrapEmail;

  if (!allowed && !canCreateAdmin) {
    await supabase.auth.signOut();
    return redirectWithError(origin, "not_allowed");
  }

  const fullName = typeof data.user.user_metadata.full_name === "string"
    ? data.user.user_metadata.full_name
    : allowed?.full_name ?? null;
  const role = allowed?.role ?? "admin";

  const { error: profileError } = await admin
    .from("profiles")
    .upsert({
      id: data.user.id,
      email,
      full_name: fullName,
      role,
    }, { onConflict: "id" });

  if (profileError) {
    await supabase.auth.signOut();
    return redirectWithError(origin, "profile");
  }

  if (!allowed && canCreateAdmin) {
    await admin.auth.admin.updateUserById(data.user.id, {
      app_metadata: {
        permissions: {
          manage_dashboard: true,
          manage_riders: true,
          manage_return: true,
          manage_volume: true,
          manage_performance: true,
        },
      },
    });
  }

  return NextResponse.redirect(new URL("/dashboard", origin));
}
