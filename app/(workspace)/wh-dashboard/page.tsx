import {redirect,notFound} from "next/navigation";
import {ProtectedPage} from "@/components/layout/protected-page";
import {getCurrentUserContext} from "@/lib/auth/current-user";
import {canViewPage} from "@/lib/auth/page-access";
import {WhDashboard} from "@/components/wh/wh-dashboard";

export default async function WhPage(){
 const context=await getCurrentUserContext();if(!context)redirect("/login");
 if(!canViewPage(context.profile.role,context.profile.page_access,"wh_tracking"))notFound();
 return <ProtectedPage><WhDashboard/></ProtectedPage>;
}
