import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseStaffCsv } from "@/lib/team/import";

export async function POST(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (context.profile.role !== "admin") return NextResponse.json({ error: "Chỉ admin được nhập nhân sự và lịch." }, { status: 403 });
  try {
    const form = await request.formData(), file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv") || file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Chọn file CSV tối đa 5 MB." }, { status: 400 });
    const parsed = parseStaffCsv(await file.text(), file.name);
    const summary = { staff: parsed.staff.length, shifts: parsed.shifts.length, from: parsed.start, to: parsed.end, warnings: parsed.warnings };
    if (form.get("preview") === "true") return NextResponse.json(summary);
    const { error } = await createAdminClient().rpc("import_team_roster", { payload: { staff: parsed.staff, shifts: parsed.shifts }, filename: file.name });
    if (error) throw new Error("Không nhập được dữ liệu; toàn bộ lượt nhập đã được hủy.");
    return NextResponse.json({ success: true, ...summary });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "File không hợp lệ" }, { status: 400 }); }
}
