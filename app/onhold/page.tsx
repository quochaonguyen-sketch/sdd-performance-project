import { notFound,redirect } from "next/navigation";
import { ProtectedPage } from "@/components/layout/protected-page";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { vietnamDay } from "@/lib/data-sources/catalog";
import { getOHPivot } from "@/lib/onhold/server";
import { OHWorkspace } from "@/components/onhold/oh-workspace";
import type { OHData } from "@/lib/onhold/model";
export default async function OnholdPage() {
  const context=await getCurrentUserContext();
  if(!context)redirect("/login");
  if(context.profile.role!=="admin"&&!context.profile.permissions.manage_performance)notFound();
  const today=vietnamDay(),from=new Date(Date.parse(today)-13*86400000).toISOString().slice(0,10);
  let data:OHData={reports:[],cells:[]},error="";
  try{data=await getOHPivot(from,today);}catch{error="Không tải được pivot OH. Vui lòng thử lại.";}
  return <ProtectedPage><OHWorkspace initialData={data} initialError={error} from={from} today={today}/></ProtectedPage>;
}
