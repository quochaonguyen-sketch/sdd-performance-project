import {getCurrentUserContext} from "@/lib/auth/current-user";
import {canViewPage} from "@/lib/auth/page-access";
import {createAdminClient} from "@/lib/supabase/admin";
import {sourceAllowed,vietnamDay} from "@/lib/data-sources/catalog";

export async function GET(){
 const context=await getCurrentUserContext();
 if(!context)return Response.json({error:"Chưa đăng nhập"},{status:401});
 if(!canViewPage(context.profile.role,context.profile.page_access,"wh_tracking"))return Response.json({error:"Không có quyền xem WH"},{status:403});
 const day=vietnamDay();
 const {data,error}=await createAdminClient().from("wh_tracking_snapshots").select("snapshot_at,orders").eq("station_id","4232").eq("report_date",day).maybeSingle();
 if(error)return Response.json({error:"Chưa đọc được dữ liệu WH. Kiểm tra nguồn WH / iPhone trên máy worker."},{status:503});
 return Response.json({day,snapshotAt:data?.snapshot_at??null,orders:data?.orders??[],canRefresh:sourceAllowed(context.profile.role,context.profile.permissions,"wh_tracking")},{headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(){
 const context=await getCurrentUserContext();
 if(!context)return Response.json({error:"Chưa đăng nhập"},{status:401});
 if(!canViewPage(context.profile.role,context.profile.page_access,"wh_tracking")||!sourceAllowed(context.profile.role,context.profile.permissions,"wh_tracking"))return Response.json({error:"Không có quyền đồng bộ WH"},{status:403});
 const {data,error}=await createAdminClient().rpc("control_data_source",{p_source:"wh_tracking",p_action:"run",p_day:vietnamDay(),p_actor:context.user.id});
 if(error)return Response.json({error:"Chưa gửi được lệnh đồng bộ WH."},{status:503});
 return Response.json(data,{headers:{"Cache-Control":"private, no-store"}});
}
