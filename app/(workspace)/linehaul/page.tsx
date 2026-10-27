import { redirect, notFound } from "next/navigation";
import { ProtectedPage } from "@/components/layout/protected-page";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { LinehaulView } from "@/components/linehaul/linehaul-view";

export default async function LinehaulPage(){
 const context=await getCurrentUserContext();if(!context)redirect("/login");
 if(context.profile.role!=="admin"&&!context.profile.permissions.manage_dashboard)notFound();
 return <ProtectedPage><LinehaulView/></ProtectedPage>;
}
