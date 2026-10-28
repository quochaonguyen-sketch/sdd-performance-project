import {createServerClient} from "@supabase/ssr";
import {NextResponse,type NextRequest} from "next/server";
import {createAdminClient} from "@/lib/supabase/admin";
import {loadRoleAccess} from "@/lib/auth/role-access-server";
import {pageForPath,pagesForApi,canViewPage} from "@/lib/auth/page-access";

export async function proxy(request:NextRequest){
 const path=request.nextUrl.pathname,isApi=path.startsWith("/api/");
 const requirement=isApi?pagesForApi(path,request.method):pageForPath(path);
 if(!requirement)return NextResponse.next();
 let response=NextResponse.next({request});
 const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
  cookies:{getAll:()=>request.cookies.getAll(),setAll:values=>{
   values.forEach(({name,value})=>request.cookies.set(name,value));
   response=NextResponse.next({request});values.forEach(({name,value,options})=>response.cookies.set(name,value,options));
  }},
 });
 function denied(status:number,message:string){
  const result=isApi?NextResponse.json({error:message},{status}):status===401?NextResponse.redirect(new URL("/login",request.url)):
   new NextResponse(`<html lang="vi"><meta charset="utf-8"><title>Không có quyền truy cập</title><body><h1>${message}</h1><p>Liên hệ Admin để được cấp quyền.</p><a href="/">Về trang chính</a></body></html>`,{status,headers:{"Content-Type":"text/html; charset=utf-8"}});
  response.cookies.getAll().forEach(cookie=>result.cookies.set(cookie));return result;
 }
 try{
  const {data,error}=await client.auth.getClaims();
  const id=data?.claims.sub,email=data?.claims.email;
  if(error||!id||typeof email!=="string"||!email.toLowerCase().endsWith("@spxexpress.com"))return denied(401,"Chưa đăng nhập");
  const {data:profile,error:profileError}=await createAdminClient().from("profiles").select("role").eq("id",id).maybeSingle();
  if(profileError)return denied(503,"Chưa kiểm tra được quyền truy cập");
  if(!profile)return denied(403,"Tài khoản chưa được cấp quyền");
  if(profile.role==="admin")return response;
  if(requirement==="admin")return denied(403,"Chỉ Admin được vào trang quản trị này");
  if(profile.role==="viewer")return response;
  const access=await loadRoleAccess(profile.role);
  const keys=Array.isArray(requirement)?requirement:[requirement];
  if(!keys.some(key=>canViewPage(profile.role,access,key)))return denied(403,"Bạn không có quyền truy cập chức năng này");
  return response;
 }catch{return denied(503,"Chưa kiểm tra được quyền truy cập. Vui lòng thử lại.");}
}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|css|js)$).*)"]};
