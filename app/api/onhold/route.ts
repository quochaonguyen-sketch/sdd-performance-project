import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { vietnamDay } from "@/lib/data-sources/catalog";
import { ohRange } from "@/lib/onhold/model";
import { getOHPivot, OHPivotError } from "@/lib/onhold/server";
import { TtlCache } from "@/lib/cache/ttl-cache";
const cache = new TtlCache<Awaited<ReturnType<typeof getOHPivot>>>(120_000, 24);
export async function GET(request:Request) {
  const context=await getCurrentUserContext();
  if(!context)return NextResponse.json({error:"Chưa đăng nhập"},{status:401});
  if(context.profile.role!=="admin"&&!context.profile.permissions.manage_performance)return NextResponse.json({error:"Không có quyền xem phân tích OH"},{status:403});
  const query=new URL(request.url).searchParams,from=query.get("from")??vietnamDay(),to=query.get("to")??vietnamDay();
  try { ohRange(from,to,vietnamDay()); }catch{return NextResponse.json({error:"Khoảng ngày không hợp lệ (tối đa 93 ngày)"},{status:400});}
  try{
    const key = JSON.stringify([context.user.id, context.profile, vietnamDay(), from, to]);
    const refresh = request.headers.get("x-dashboard-refresh") === "1";
    if (refresh) cache.delete(key);
    const result = await cache.load(key, () => getOHPivot(from,to,refresh));
    return NextResponse.json(result.value,{headers:{"Cache-Control":"private, no-store", "X-Data-Cache": result.hit ? "HIT" : "MISS", "X-Cache-Expires": String(result.expiresAt)}});
  }
  catch(error){
    const code = error instanceof OHPivotError ? error.code : "OH_READ_FAILED";
    console.error("[onhold] read failed", { from, to, code, message: error instanceof Error ? error.message : "Unknown error" });
    const timeout = code === "57014" || code === "OH_TIMEOUT" || (error instanceof Error && error.name === "TimeoutError");
    const missing = code === "PGRST202" || code === "42883" || code === "42P01";
    const message = missing ? "Nguồn OH chưa được cấu hình đầy đủ. Cần kiểm tra cấu trúc dữ liệu." : code === "42501" ? "Máy chủ chưa có quyền đọc nguồn OH. Cần kiểm tra cấu hình truy cập." : timeout ? "Nguồn OH phản hồi quá chậm. Vui lòng tải lại báo cáo." : "Tạm thời không kết nối được nguồn OH. Vui lòng tải lại báo cáo.";
    return NextResponse.json({error:message,code},{status:503,headers:{"Cache-Control":"private, no-store"}});
  }
}
