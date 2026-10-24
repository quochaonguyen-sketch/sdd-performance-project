import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ShiftTemplate, StaffingTarget } from "./planning";

export type PlanningSettings = { templates: ShiftTemplate[]; targets: StaffingTarget[]; template_version: string; target_version: string };
export async function loadPlanningSettings(from: string, to: string): Promise<PlanningSettings> {
  const { data, error } = await createAdminClient().rpc("team_planning_settings", { first_day: from, last_day: to });
  if (error || !data) throw new Error("Không tải được cấu hình ca và định biên.");
  return data as PlanningSettings;
}
