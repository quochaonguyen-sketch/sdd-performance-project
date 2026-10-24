import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

type UserEvent = {
  event_type: "login" | "logout" | "page_view" | "permission_change" | "member_created" | "member_deleted";
  entity_type?: string; entity_id?: string; path?: string; summary: string;
  event_id?: string; changes?: Record<string, unknown>;
};

export async function recordUserActivity(actor: { id: string }, event: UserEvent) {
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin.from("profiles").select("email,full_name").eq("id", actor.id).maybeSingle();
  if (profileError || !profile) throw new Error("Không xác định được người ghi nhật ký.");
  const { error } = await admin.from("user_activity_logs").insert({
    ...event, actor_id: actor.id, actor_email: profile.email ?? "", actor_name: profile.full_name,
  });
  if (error && error.code !== "23505") throw new Error("Không lưu được nhật ký người dùng.");
}
