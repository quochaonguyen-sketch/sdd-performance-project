import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { sourceAllowed, vietnamDay } from "@/lib/data-sources/catalog";
import { parseLinehaulRange, type LinehaulRangeData, type LinehaulTrip } from "@/lib/linehaul/model";

export async function GET(request:Request){
 const context=await getCurrentUserContext();
 if(!context)return Response.json({error:"Chưa đăng nhập"},{status:401});
 if(context.profile.role!=="admin"&&!context.profile.permissions.manage_dashboard)return Response.json({error:"Không có quyền xem LH"},{status:403});
 const today=vietnamDay();
 const range=parseLinehaulRange(new URL(request.url).searchParams,today);
 if(!range)return Response.json({error:"Chọn khoảng ngày vận hành hợp lệ đến hôm nay."},{status:400});
 const {from,to}=range;
 const db=createAdminClient();
 const tripRows:LinehaulTrip[]=[];
 const pageSize=31;
 let snapshotAt:string|null=null,snapshotDays=0;
 for(let offset=0;;offset+=pageSize){
  const {data,error}=await db.from("linehaul_snapshots").select("snapshot_at,trips").eq("station_id","4232")
   .gte("report_date",from).lte("report_date",to).order("report_date",{ascending:false})
   .range(offset,offset+pageSize-1).abortSignal(request.signal);
  if(error||!data)return Response.json({error:"Chưa đọc được dữ liệu LH. Kiểm tra nguồn dữ liệu LH trên máy worker."},{status:503});
  snapshotAt??=data[0]?.snapshot_at??null;
  snapshotDays+=data.length;
  for(const snapshot of data)tripRows.push(...(snapshot.trips as LinehaulTrip[]));
  if(data.length<pageSize)break;
 }
 const payload:LinehaulRangeData={day:to,from,to,snapshotAt,snapshotDays,trips:tripRows,
  canRefresh:from===today&&to===today&&sourceAllowed(context.profile.role,context.profile.permissions,"linehaul")};
 return Response.json(payload,{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(){
 const context=await getCurrentUserContext();
 if(!context)return Response.json({error:"Chưa đăng nhập"},{status:401});
 if(!sourceAllowed(context.profile.role,context.profile.permissions,"linehaul"))return Response.json({error:"Không có quyền đồng bộ LH"},{status:403});
 const {data,error}=await createAdminClient().rpc("control_data_source",{p_source:"linehaul",p_action:"run",p_day:vietnamDay(),p_actor:context.user.id});
 if(error)return Response.json({error:"Chưa gửi được yêu cầu đồng bộ LH."},{status:503});
 return Response.json(data);
}
