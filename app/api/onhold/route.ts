import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { vietnamDay } from "@/lib/data-sources/catalog";
import { ohRange } from "@/lib/onhold/model";
import { getOHPivot } from "@/lib/onhold/server";
export async function GET(request:Request) {
  const context=await getCurrentUserContext();
  if(!context)return NextResponse.json({error:"Chưa đăng nhập"},{status:401});
  if(context.profile.role!=="admin"&&!context.profile.permissions.manage_performance)return NextResponse.json({error:"Không có quyền xem phân tích OH"},{status:403});
  const query=new URL(request.url).searchParams,from=query.get("from")??vietnamDay(),to=query.get("to")??vietnamDay();
  try { ohRange(from,to,vietnamDay()); }catch{return NextResponse.json({error:"Khoảng ngày không hợp lệ (tối đa 93 ngày)"},{status:400});}
  try{return NextResponse.json(await getOHPivot(from,to),{headers:{"Cache-Control":"private, no-store"}});}
  catch{return NextResponse.json({error:"Không tải được pivot OH. Vui lòng thử lại."},{status:503});}
}
