import { getCurrentUserContext } from "@/lib/auth/current-user";
import { todayInVietnam } from "@/lib/ai/work-date";
import { addDays } from "@/lib/team/model";
import { validateAnalysisScope } from "@/lib/ai/operations-analysis";
import { loadOperationsAnalysis } from "@/lib/ai/operations-analysis-server";

export async function GET(request:Request){
  const context=await getCurrentUserContext();if(!context)return Response.json({error:"Chưa đăng nhập"},{status:401});
  const params=new URL(request.url).searchParams,today=todayInVietnam();
  const scope={from:params.get("from")??addDays(today,-6),to:params.get("to")??today,area:params.get("area")??"all",hour:Number(params.get("hour")??23)};
  try{validateAnalysisScope(scope,today);}catch{return Response.json({error:"Chọn tối đa 31 ngày, không ở tương lai; khu vực KV1–KV5 và giờ 0–23."},{status:400});}
  try{return Response.json(await loadOperationsAnalysis(context,scope,request.signal),{headers:{"Cache-Control":"private, no-store"}});}
  catch{return Response.json({error:"Chưa tải được phân tích vận hành. Vui lòng thử lại."},{status:503});}
}
