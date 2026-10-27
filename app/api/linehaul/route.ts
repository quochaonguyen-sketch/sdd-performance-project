import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { sourceAllowed, vietnamDay } from "@/lib/data-sources/catalog";
import type { LinehaulTrip } from "@/lib/linehaul/model";

export async function GET(){
 const context=await getCurrentUserContext();
 if(!context)return Response.json({error:"Chưa đăng nhập"},{status:401});
 if(context.profile.role!=="admin"&&!context.profile.permissions.manage_dashboard)return Response.json({error:"Không có quyền xem LH"},{status:403});
 const day=vietnamDay();
 const {data,error}=await createAdminClient().from("linehaul_snapshots").select("snapshot_at,trips")
  .eq("station_id","4232").eq("report_date",day).maybeSingle();
 if(error)return Response.json({error:"Chưa đọc được dữ liệu LH. Kiểm tra nguồn dữ liệu LH trên máy worker."},{status:503});
 return Response.json({day,snapshotAt:data?.snapshot_at??null,trips:(data?.trips??[]) as LinehaulTrip[],
 canRefresh:sourceAllowed(context.profile.role,context.profile.permissions,"linehaul")},{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(){
 const context=await getCurrentUserContext();
 if(!context)return Response.json({error:"Chưa đăng nhập"},{status:401});
 if(!sourceAllowed(context.profile.role,context.profile.permissions,"linehaul"))return Response.json({error:"Không có quyền đồng bộ LH"},{status:403});
 const {data,error}=await createAdminClient().rpc("control_data_source",{p_source:"linehaul",p_action:"run",p_day:vietnamDay(),p_actor:context.user.id});
 if(error)return Response.json({error:"Chưa gửi được yêu cầu đồng bộ LH."},{status:503});
 return Response.json(data);
}
