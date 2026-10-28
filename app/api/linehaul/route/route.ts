import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { vietnamDay } from "@/lib/data-sources/catalog";
import type { LinehaulTrip } from "@/lib/linehaul/model";
import { getRoadRoute } from "@/lib/linehaul/routing-server";

export async function GET(request:Request){
 const context=await getCurrentUserContext();
 if(!context)return Response.json({error:"Chưa đăng nhập"},{status:401});
 if(context.profile.role!=="admin"&&!context.profile.permissions.manage_dashboard)return Response.json({error:"Không có quyền xem LH"},{status:403});
 const id=new URL(request.url).searchParams.get("trip_id");
 if(!id||!/^[\w-]{1,100}$/.test(id))return Response.json({error:"Mã chuyến không hợp lệ"},{status:400});
 const {data,error}=await createAdminClient().from("linehaul_snapshots").select("trips")
  .eq("station_id","4232").eq("report_date",vietnamDay()).maybeSingle();
 if(error)return Response.json({error:"Chưa đọc được GPS chuyến LH."},{status:503});
 const trip=(data?.trips as LinehaulTrip[]|undefined)?.find(trip=>trip.trip_id===id);
 if(!trip)return Response.json({error:"Không tìm thấy chuyến trong dữ liệu hôm nay."},{status:404});
 try{
  return Response.json(await getRoadRoute(trip),{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){
  return Response.json({error:error instanceof Error&&error.name==="Error"?error.message:"Không tính được tuyến đường lúc này. Thử lại sau."},{status:503});
 }
}
