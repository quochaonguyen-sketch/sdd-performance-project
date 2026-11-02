import { getCurrentUserContext } from "@/lib/auth/current-user";
import { loadOperationsBriefing } from "@/lib/ai/briefing-server";

export async function GET(request: Request) {
  const context = await getCurrentUserContext();
  if (!context) return Response.json({ error: "Bạn cần đăng nhập để xem trợ lý vận hành." }, { status: 401 });
  try {
    const data = await loadOperationsBriefing(context, "", request.signal);
    return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Chưa tải được trợ lý vận hành. Vui lòng thử lại." }, { status: 503 });
  }
}
