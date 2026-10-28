import {notFound,redirect} from "next/navigation";
import {getCurrentUserContext} from "@/lib/auth/current-user";
import {loadRoleAccess} from "@/lib/auth/role-access-server";
import {RolePermissions} from "@/components/settings/role-permissions";

export default async function RolePermissionsPage(){
 const context=await getCurrentUserContext();
 if(!context)redirect("/login");if(context.profile.role!=="admin")notFound();
 const [member,leader]=await Promise.all([loadRoleAccess("member"),loadRoleAccess("leader")]);
 return <div className="mx-auto max-w-5xl space-y-5"><header><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Administration</p><h1 className="mt-2 text-2xl font-bold">Phân quyền vai trò</h1><p className="mt-2 text-sm text-slate-600">Chọn các trang Member và Leader được xem. Mặc định Member xem mọi trang nghiệp vụ trừ Staffing & Scheduling và Pickup Management; Leader được xem và chỉnh sửa hai trang này.</p><p className="mt-2 text-sm text-slate-600">Quyền xem áp dụng chung theo vai trò. Bật quyền xem cho Member không cấp quyền sửa nhân sự/lịch hoặc Pickup Coverage. Quản trị tài khoản, phân quyền và nhật ký hệ thống chỉ dành cho Admin.</p></header><RolePermissions initial={{member,leader}}/></div>;
}
