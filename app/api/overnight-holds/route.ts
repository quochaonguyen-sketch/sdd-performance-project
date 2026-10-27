import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { overnightCutoffDay } from "@/lib/overnight-holds/dates";
import { getOvernightHoldData, updateOvernightHoldNote, updateOvernightRiderNote } from "@/lib/overnight-holds/server";

export async function GET(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const query = new URL(request.url).searchParams;
  const day = query.get("day") ?? overnightCutoffDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ error: "Ngày không hợp lệ" }, { status: 400 });
  }

  const area = query.get("area") ?? "all";
  const cutoff_status = query.get("cutoff_status") ?? "all";
  const current_status = query.get("current_status") ?? "all";
  const has_note = query.get("has_note") ?? "all";
  const q = (query.get("q") ?? "").trim();
  const page = Math.max(0, parseInt(query.get("page") ?? "0", 10) || 0);
  const limit = Math.min(200, Math.max(1, parseInt(query.get("limit") ?? "50", 10) || 50));
  const exportAll = query.get("export") === "1" || query.get("export") === "true";

  try {
    const data = await getOvernightHoldData(day, {
      area,
      cutoff_status,
      current_status,
      has_note,
      q,
      page,
      limit,
      exportAll,
    });
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lỗi tải dữ liệu giữ hàng qua đêm." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  try {
    const body = (await request.json().catch(() => null)) as { id?: string; note?: string; day?:string; rider_code?:string } | null;
    const actor = context.profile.full_name || context.user.email || "user";
    if(body?.rider_code!==undefined){
      if(typeof body.rider_code!=="string"||!body.rider_code.trim()||body.rider_code.length>100
        ||typeof body.day!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(body.day)
        ||!Number.isFinite(Date.parse(body.day))||new Date(body.day).toISOString().slice(0,10)!==body.day
        ||typeof body.note!=="string"||body.note.length>2000)
        return NextResponse.json({error:"Ngày, rider hoặc ghi chú không hợp lệ (tối đa 2.000 ký tự)."},{status:400});
      return NextResponse.json(await updateOvernightRiderNote(body.day,body.rider_code,body.note,actor));
    }
    if (!body?.id) {
      return NextResponse.json({ error: "Thiếu ID đơn hàng" }, { status: 400 });
    }

    const result = await updateOvernightHoldNote(body.id, body.note ?? "", actor);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể lưu ghi chú" },
      { status: 500 }
    );
  }
}
