import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, vietnamToday } from "@/lib/team/model";
import { duration, suggestShiftPlan, validBreaks, type PlanningStaff, type PlanningShift } from "@/lib/team/planning";
import { loadTeam } from "@/lib/team/server";
const area = z.enum(["KV1","KV2","KV3","KV4","KV5","KV6","SPF"]);
const pool = z.enum(["OPS","FTE","BPO"]);
const breaks = z.array(z.object({ start: z.number().int().min(0), end: z.number().int().max(720) })).max(5);
const templateSchema = z.object({ id: z.uuid().optional(), name: z.string().trim().min(1).max(100), start_minute: z.number().int().min(0).max(1439), end_minute: z.number().int().min(0).max(1440), fte_breaks: breaks, bpo_breaks: breaks, active: z.boolean(), note: z.string().trim().max(500) }).superRefine((t, ctx) => {
  const length = duration(t.start_minute,t.end_minute);
  if (length < 60 || length > 720 || !validBreaks(t.fte_breaks,length) || !validBreaks(t.bpo_breaks,length)) ctx.addIssue({ code: "custom", message: "Ca cần dài 1–12 giờ; giờ nghỉ phải nằm trong ca và không chồng nhau." });
});
const targetSchema = z.object({ area, pool, day_key: z.string().refine(s => /^[0-6]$/.test(s) || z.iso.date().safeParse(s).success), hour: z.number().int().min(0).max(23), required: z.number().min(0).max(100) });
const configSchema = z.object({ day: z.iso.date(), area: z.union([area,z.literal("all")]), pool, restHours: z.number().min(0).max(24), maxMoves: z.number().int().min(1).max(20) });
export async function POST(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (body?.action !== "suggest" && context.profile.role !== "admin") return NextResponse.json({ error: "Chỉ admin được thay đổi ca, định biên và áp dụng phương án." }, { status: 403 });
  const admin = createAdminClient();
  try {
    if (body?.action === "template") {
      const parsed = templateSchema.safeParse(body.data); if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const { error } = await admin.from("team_shift_templates").upsert(parsed.data, { onConflict: "id" });
      if (error) throw new Error("Không lưu được ca làm việc.");
      return NextResponse.json({ success: true });
    }
    if (body?.action === "targets") {
      const parsed = z.array(targetSchema).min(1).max(168).safeParse(body.data); if (!parsed.success) throw new Error("Định biên không hợp lệ.");
      const { error } = await admin.rpc("save_team_staffing_targets", { items: parsed.data });
      if (error) throw new Error("Không lưu được định biên.");
      return NextResponse.json({ success: true });
    }
    if (!["suggest","apply"].includes(body?.action)) throw new Error("Thao tác không hợp lệ.");
    const config = configSchema.safeParse(body.config); if (!config.success) throw new Error("Ngày / cấu hình gợi ý không hợp lệ.");
    const c = config.data, data = await loadTeam(addDays(c.day,-1),addDays(c.day,1));
    const plan = suggestShiftPlan(data.staff as PlanningStaff[],data.shifts as PlanningShift[],data.planning.templates,data.planning.targets,c.day,c.pool,c.area,c.restHours,c.maxMoves);
    const result = { ...plan, template_version: data.planning.template_version, target_version: data.planning.target_version };
    if (body.action === "suggest") return NextResponse.json(result);
    if (c.day < vietnamToday()) throw new Error("Chỉ áp dụng gợi ý cho hôm nay hoặc ngày tương lai.");
    if (!plan.changes.length || body.proposal?.template_version !== result.template_version || body.proposal?.target_version !== result.target_version || JSON.stringify(body.proposal?.changes) !== JSON.stringify(result.changes)) return NextResponse.json({ error: "Lịch, nhân sự hoặc định biên đã thay đổi. Tạo lại gợi ý trước khi áp dụng." }, { status: 409 });
    const { data: applied, error } = await admin.rpc("apply_team_shift_plan", { changes: result.changes, template_version: result.template_version, target_version: result.target_version });
    if (error) return NextResponse.json({ error: error.code === "40001" ? "Dữ liệu vừa thay đổi; hãy tạo lại gợi ý." : "Không áp dụng được phương án; lịch được giữ nguyên." }, { status: 409 });
    return NextResponse.json({ success: true, applied });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Không xử lý được yêu cầu." }, { status: 400 }); }
}
