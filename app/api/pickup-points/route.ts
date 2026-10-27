import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canAccessPickupManagement } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request:Request) {
 const context=await getCurrentUserContext();
 if(!context)return Response.json({error:"Chưa đăng nhập"},{status:401});
 if(!canAccessPickupManagement(context.profile.role,context.profile.permissions))return Response.json({error:"Không có quyền xem Pickup Points"},{status:403});
 const params=new URL(request.url).searchParams;
 const sort=params.get("sort")??"ado_desc";
 if(!["route","ado_desc"].includes(sort))return Response.json({error:"Sắp xếp không hợp lệ"},{status:400});
 const page=Number(params.get("page")??1),size=Number(params.get("size")??80);
 if(!Number.isSafeInteger(page)||page<1||page>100000||!Number.isInteger(size)||size<1||size>1000)return Response.json({error:"Trang không hợp lệ"},{status:400});
 const {data,error}=await createAdminClient().rpc("pickup_points_page",{p_station:"4232",p_query:(params.get("q")??"").trim().slice(0,200),p_route:(params.get("route")??"all").slice(0,200),p_page:page,p_size:size,p_sort:sort});
 if(error)return Response.json({error:"Chưa tải được danh mục PUP."},{status:503});
 return Response.json(data,{headers:{"Cache-Control":"private, no-store"}});
}
