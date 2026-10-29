import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { vietnamDay } from "@/lib/data-sources/catalog";
import { ohRange } from "@/lib/onhold/model";
import { getOHPivot } from "@/lib/onhold/server";
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
    if (request.headers.get("x-dashboard-refresh") === "1") cache.delete(key);
    const result = await cache.load(key, () => getOHPivot(from,to));
    return NextResponse.json(result.value,{headers:{"Cache-Control":"private, no-store", "X-Data-Cache": result.hit ? "HIT" : "MISS", "X-Cache-Expires": String(result.expiresAt)}});
  }
  catch{return NextResponse.json({error:"Không tải được pivot OH. Vui lòng thử lại."},{status:503});}
}
