import "server-only";
import {createAdminClient} from "@/lib/supabase/admin";
import {normalizePageAccess} from "./page-access";

export async function loadRoleAccess(role:string){
 if(!["member","leader"].includes(role))return normalizePageAccess(role,null);
 const {data,error}=await createAdminClient().from("role_page_permissions").select("pages").eq("role",role).maybeSingle();
 if(error)throw new Error("Không tải được cấu hình phân quyền vai trò.");
 return normalizePageAccess(role,data?.pages);
}
