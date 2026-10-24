import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTeam } from "@/lib/team/server";
import { staffAreas, STAFF_ROLES } from "@/lib/team/model";
import { templateCode, type ShiftTemplate } from "@/lib/team/planning";

const date = z.iso.date();
const staffSchema = z.object({
  id: z.string().min(1).max(64), full_name: z.string().trim().min(2).max(150),
  ops_id: z.string().trim().max(80), staff_id: z.string().trim().max(80),
  email: z.union([z.email(), z.literal("")]), role: z.enum(STAFF_ROLES),
  coverage: z.string().trim().max(150), status: z.enum(["Active", "Inactive", ""]),
  team: z.string().trim().max(100), vendor: z.string().trim().max(100), archived: z.boolean(),
  review_note: z.string().trim().max(500),
});
const shiftSchema = z.object({ staff_id: z.string().min(1).max(64), work_date: date, shift: z.string().trim().max(100), template_id: z.uuid().nullable().optional() });

export async function GET(request: Request) {
  if (!await getCurrentUserContext()) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const from = date.safeParse(params.get("from")), to = date.safeParse(params.get("to"));
  if (!from.success || !to.success || from.data > to.data || Date.parse(to.data) - Date.parse(from.data) > 31 * 86400000) return NextResponse.json({ error: "Khoảng ngày không hợp lệ, tối đa 31 ngày." }, { status: 400 });
  try { return NextResponse.json(await loadTeam(from.data, to.data), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Không tải được dữ liệu" }, { status: 500 }); }
}

export async function POST(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (context.profile.role !== "admin") return NextResponse.json({ error: "Chỉ admin được chỉnh sửa nhân sự và lịch." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const admin = createAdminClient();
  if (body?.action === "shift") {
    const parsed = shiftSchema.safeParse(body.data);
    if (!parsed.success) return NextResponse.json({ error: "Ca/ngày không hợp lệ." }, { status: 400 });
    const { shift, template_id, ...key } = parsed.data;
    if (template_id) {
      const { data: template, error } = await admin.from("team_shift_templates").select("*").eq("id", template_id).eq("active", true).maybeSingle();
      if (error || !template || templateCode(template as ShiftTemplate) !== shift) return NextResponse.json({ error: "Ca đã thay đổi; chọn lại ca làm việc." }, { status: 409 });
    }
    const result = shift ? await admin.from("team_staff_shifts").upsert({ ...key, shift, template_id: template_id ?? null, source_file: "Chỉnh sửa trên web" }, { onConflict: "staff_id,work_date" })
      : await admin.from("team_staff_shifts").delete().eq("staff_id", key.staff_id).eq("work_date", key.work_date);
    if (result.error) return NextResponse.json({ error: "Không lưu được ca làm việc." }, { status: 400 });
    return NextResponse.json({ success: true });
  }
  const parsed = staffSchema.safeParse(body?.data);
  if (body?.action !== "staff" || !parsed.success) return NextResponse.json({ error: parsed.success ? "Thao tác không hợp lệ" : parsed.error.issues[0]?.message }, { status: 400 });
  const data = parsed.data;
  const result = await admin.from("team_staff").upsert({ ...data, areas: staffAreas(data.coverage) }, { onConflict: "id" });
  if (result.error) return NextResponse.json({ error: result.error.code === "23505" ? "OPS ID này đã có trong danh sách nhân sự." : "Không lưu được nhân sự." }, { status: 400 });
  return NextResponse.json({ success: true });
}
