"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {PAGE_ACCESS_OPTIONS,defaultPageAccess,type PageAccess,type ConfigurableRole} from "@/lib/auth/page-access";
import {Button} from "@/components/ui/button";

export function RolePermissions({initial}:{initial:Record<ConfigurableRole,PageAccess>}){
 const [values,setValues]=useState(initial),[busy,setBusy]=useState<ConfigurableRole|null>(null),[message,setMessage]=useState(""),[error,setError]=useState("");
 const router=useRouter();
 async function save(role:ConfigurableRole){
  setBusy(role);setMessage("");setError("");
  try{
   const response=await fetch("/api/admin/role-permissions",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({role,pages:values[role]})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||"Không lưu được quyền");
   setMessage(`Đã lưu quyền ${role=== "member"?"Member":"Leader"}. Áp dụng từ lần tải trang hoặc yêu cầu tiếp theo.`);router.refresh();
  }catch(error){setError(error instanceof Error?error.message:"Không lưu được quyền");}finally{setBusy(null);}
 }
 return <div className="space-y-5">
  {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  {message&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-sm"><caption className="sr-only">Quyền xem các trang theo vai trò</caption><thead className="bg-slate-50"><tr><th className="p-4 text-left">Trang / chức năng</th><th scope="col" className="p-4 text-center">Member</th><th scope="col" className="p-4 text-center">Leader</th></tr></thead><tbody>
   {PAGE_ACCESS_OPTIONS.map(item=><tr key={item.key} className="border-t border-slate-100"><th scope="row" className="px-4 py-2 text-left font-medium">{item.label}</th>{(["member","leader"] as const).map(role=><td key={role} className="text-center"><label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center"><input type="checkbox" className="h-5 w-5 accent-blue-700" checked={values[role][item.key]} disabled={!!busy} aria-label={`${role=== "member"?"Member":"Leader"} được xem ${item.label}`} onChange={event=>setValues(previous=>({...previous,[role]:{...previous[role],[item.key]:event.target.checked}}))}/></label></td>)}</tr>)}
  </tbody></table></div>
  <div className="flex flex-wrap gap-3">{(["member","leader"] as const).map(role=><div key={role} className="flex gap-2"><Button disabled={!!busy} onClick={()=>void save(role)}>{busy===role?"Đang lưu…":`Lưu quyền ${role=== "member"?"Member":"Leader"}`}</Button><Button variant="outline" disabled={!!busy} onClick={()=>setValues(previous=>({...previous,[role]:defaultPageAccess(role)}))}>Mặc định {role=== "member"?"Member":"Leader"}</Button></div>)}</div>
 </div>;
}
