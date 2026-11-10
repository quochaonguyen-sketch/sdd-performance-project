import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  listAllVolumeMasks,
  upsertVolumeMask,
  deleteVolumeMask,
  toggleVolumeMask,
} from "@/lib/rider-volume-mask/service";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const maskSchema = z.object({
  id: z.string().uuid().optional(),
  rider_code: z.string().trim().min(1, "Mã rider không được để trống"),
  rider_name: z.string().trim().nullable().optional(),
  factor: z.number().min(0, "Tỷ lệ tối thiểu 0%").max(5, "Tỷ lệ tối đa 500%"),
  scope: z.enum(["all", "delivery", "pickup"]).default("all"),
  is_active: z.boolean().default(true),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function GET(request: Request) {
  const session = await getCurrentUserContext().catch(() => null);
  if (!session) {
    return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  }

  // Strictly enforce Super Admin only
  if (!session.profile.is_super_admin) {
    return NextResponse.json(
      { success: false, error: "Chỉ Super Admin mới có quyền truy cập trang và dữ liệu này." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();

  try {
    const admin = createAdminClient();

    // If super admin is searching for riders to add
    if (search && search.length >= 2) {
      const { data: riders, error: riderErr } = await admin
        .from("riders")
        .select("rider_code, full_name, kv, cot, status")
        .or(`rider_code.ilike.%${search}%,full_name.ilike.%${search}%`)
        .limit(20);

      if (riderErr) throw riderErr;
      return NextResponse.json({ success: true, riders: riders ?? [] });
    }

    const masks = await listAllVolumeMasks();
    return NextResponse.json({ success: true, masks });
  } catch (err) {
    console.error("[VolumeMask API GET Error]:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Lỗi tải cấu hình điều chỉnh sản lượng" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await getCurrentUserContext().catch(() => null);
  if (!session) {
    return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!session.profile.is_super_admin) {
    return NextResponse.json(
      { success: false, error: "Chỉ Super Admin mới có quyền cấu hình điều chỉnh sản lượng." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const parsed = maskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" },
        { status: 400 }
      );
    }

    const mask = await upsertVolumeMask({
      id: parsed.data.id,
      rider_code: parsed.data.rider_code,
      rider_name: parsed.data.rider_name,
      factor: parsed.data.factor,
      scope: parsed.data.scope,
      is_active: parsed.data.is_active,
      note: parsed.data.note,
      user_email: session.user.email,
    });

    return NextResponse.json({ success: true, mask });
  } catch (err) {
    console.error("[VolumeMask API POST Error]:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Lỗi lưu cấu hình" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const session = await getCurrentUserContext().catch(() => null);
  if (!session) {
    return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!session.profile.is_super_admin) {
    return NextResponse.json(
      { success: false, error: "Chỉ Super Admin mới có quyền thay đổi trạng thái." },
      { status: 403 }
    );
  }

  try {
    const { id, is_active } = await request.json();
    if (!id || typeof is_active !== "boolean") {
      return NextResponse.json({ success: false, error: "Thiếu id hoặc trạng thái" }, { status: 400 });
    }

    await toggleVolumeMask(id, is_active);
    return NextResponse.json({ success: true, is_active });
  } catch (err) {
    console.error("[VolumeMask API PATCH Error]:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Lỗi cập nhật trạng thái" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const session = await getCurrentUserContext().catch(() => null);
  if (!session) {
    return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!session.profile.is_super_admin) {
    return NextResponse.json(
      { success: false, error: "Chỉ Super Admin mới có quyền xóa cấu hình." },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id") ?? searchParams.get("rider_code");
    if (!id) {
      return NextResponse.json({ success: false, error: "Thiếu ID hoặc mã rider cần xóa" }, { status: 400 });
    }

    await deleteVolumeMask(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[VolumeMask API DELETE Error]:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Lỗi xóa cấu hình" },
      { status: 500 }
    );
  }
}
