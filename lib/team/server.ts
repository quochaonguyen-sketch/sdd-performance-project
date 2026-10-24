import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Staff, StaffShift } from "./model";
import { addDays } from "./model";
import { loadPlanningSettings } from "./planning-server";

export async function loadTeam(from: string, to: string) {
  const admin = createAdminClient();
  const [{ data: staff, error }, first, last, planning, workload] = await Promise.all([
    admin.from("team_staff").select("*").order("full_name").limit(2000),
    admin.from("team_staff_shifts").select("work_date").order("work_date").limit(1),
    admin.from("team_staff_shifts").select("work_date").order("work_date", { ascending: false }).limit(1),
    loadPlanningSettings(addDays(from,-1), addDays(to,1)),
    admin.rpc("team_daily_workload", { first_day: from, last_day: to }),
  ]);
  if (error || first.error || last.error) throw new Error("Không tải được danh sách nhân sự và lịch làm việc.");
  const shifts: StaffShift[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await admin.from("team_staff_shifts").select("staff_id,work_date,shift,updated_at,template_id")
      .gte("work_date", addDays(from,-1)).lte("work_date", addDays(to,1)).order("work_date").order("staff_id").range(offset, offset + 999);
    if (result.error) throw new Error("Không tải được lịch làm việc.");
    shifts.push(...result.data);
    if (result.data.length < 1000) break;
  }
  return { staff: (staff ?? []) as Staff[], shifts, planning, workload: workload.error ? null : workload.data,
    bounds: { from: first.data?.[0]?.work_date ?? null, to: last.data?.[0]?.work_date ?? null } };
}
