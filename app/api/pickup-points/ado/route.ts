import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canAccessPickupManagement } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const context = await getCurrentUserContext();
  if (!context) return Response.json({error:"Chưa đăng nhập"},{status:401});
  if (!canAccessPickupManagement(context.profile.role,context.profile.permissions)) return Response.json({error:"Không có quyền xem Pickup Points"},{status:403});
  const {data,error}=await createAdminClient().rpc("pickup_shop_ado",{p_station:"4232"});
  if(error) return Response.json({error:"Chưa tải được ADO theo shop."},{status:503});
  return Response.json(data,{headers:{"Cache-Control":"private, no-store"}});
}
