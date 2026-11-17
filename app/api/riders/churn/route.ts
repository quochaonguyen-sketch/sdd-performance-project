import { z } from "zod";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canViewPage } from "@/lib/auth/page-access";
import { canManageRiders } from "@/lib/auth/permissions";
import { canEditRiderArea } from "@/lib/auth/rider-scope";
import { invalidateRidersCache } from "@/lib/cache/operations-cache";
import { readChurnedRiderIds } from "@/lib/dashboard/rider-churn";
import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { prisma } from "@/lib/prisma/client";
import { getRiderChurnReport, reconcileRiderChurn } from "@/lib/riders/churn-reconciliation";

const input = z.object({ riderIds: z.array(z.string().regex(/^\d{1,30}$/)).min(1).max(5000) });
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

async function authorize() {
  const context = await getCurrentUserContext();
  if (!context) return reply({ error: "Chưa đăng nhập" }, 401);
  const { role, page_access, permissions, rider_edit_areas } = context.profile;
  if (!canViewPage(role, page_access, "riders")) return reply({ error: "Bạn chưa có quyền xem mục này." }, 403);
  const canManage = canManageRiders(role, permissions);
  const editableAreas = OPERATING_AREAS.filter(area => canEditRiderArea(role, canManage, rider_edit_areas, area));
  return { userId: context.user.id, editableAreas };
}

export async function GET() {
  const context = await authorize();
  if (context instanceof Response) return context;
  try {
    const churnedIds = await readChurnedRiderIds();
    return reply(await getRiderChurnReport(prisma, churnedIds, context.editableAreas));
  } catch (error) {
    console.error("[riders/churn]", error);
    return reply({ error: "Không đối chiếu được tab Info Rider SDD. Hãy thử lại." }, 503);
  }
}

export async function POST(request: Request) {
  const context = await authorize();
  if (context instanceof Response) return context;
  if (!context.editableAreas.length) return reply({ error: "Bạn chưa có quyền cập nhật trạng thái rider." }, 403);
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "Hãy đối chiếu lại để lấy các Rider ID cần cập nhật." }, 400);

  try {
    const churnedIds = await readChurnedRiderIds();
    const result = await reconcileRiderChurn(prisma, churnedIds, parsed.data.riderIds, context.editableAreas, context.userId);
    if (result.updated > 0) invalidateRidersCache();
    return reply(result);
  } catch (error) {
    console.error("[riders/churn]", error);
    return reply({ error: "Không cập nhật được trạng thái rider. Hãy đối chiếu lại rồi thử lại." }, 503);
  }
}
