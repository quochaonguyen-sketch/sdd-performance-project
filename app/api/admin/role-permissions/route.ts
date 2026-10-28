import {z} from "zod";
import {getCurrentUserContext} from "@/lib/auth/current-user";
import {createAdminClient} from "@/lib/supabase/admin";
import {PAGE_ACCESS_OPTIONS,normalizePageAccess} from "@/lib/auth/page-access";
import {loadRoleAccess} from "@/lib/auth/role-access-server";
import {recordUserActivity} from "@/lib/audit/events";

const schema=z.object({role:z.enum(["member","leader"]),pages:z.object(Object.fromEntries(PAGE_ACCESS_OPTIONS.map(({key})=>[key,z.boolean()]))).strict()}).strict();
export async function GET(){
 const context=await getCurrentUserContext();
 if(!context)return Response.json({error:"Chưa đăng nhập"},{status:401});
 if(context.profile.role!=="admin")return Response.json({error:"Chỉ Admin được cấu hình quyền"},{status:403});
 return Response.json({member:await loadRoleAccess("member"),leader:await loadRoleAccess("leader")},{headers:{"Cache-Control":"private, no-store"}});
}
export async function PATCH(request:Request){
 const context=await getCurrentUserContext();
 if(!context)return Response.json({error:"Chưa đăng nhập"},{status:401});
 if(context.profile.role!=="admin")return Response.json({error:"Chỉ Admin được cấu hình quyền"},{status:403});
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return Response.json({error:"Cấu hình quyền không hợp lệ"},{status:400});
 const {role}=parsed.data,pages=normalizePageAccess(role,parsed.data.pages);
 const {error}=await createAdminClient().from("role_page_permissions").upsert({role,pages,updated_at:new Date().toISOString(),updated_by:context.user.id});
 if(error)return Response.json({error:"Không lưu được cấu hình quyền"},{status:503});
 await recordUserActivity(context.user,{event_type:"permission_change",entity_type:"role_page_permissions",entity_id:role,summary:`Cập nhật quyền xem cho ${role}`,changes:{pages}});
 return Response.json({success:true,pages});
}
