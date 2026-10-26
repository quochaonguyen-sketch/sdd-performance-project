import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { buildRiderDaily,readDetailRange,riderPerformanceLookup,summarizeRiderDaily,type DetailSource } from "@/lib/performance/rider-detail";

export async function GET(request:Request,context:{params:Promise<{id:string}>}){
  try{return await readPerformance(request,context);}catch{return NextResponse.json({success:false,error:"Không thể tải hoặc xuất Performance. Vui lòng thử lại."},{status:503});}
}
async function readPerformance(request:Request,context:{params:Promise<{id:string}>}){
  const session=await getCurrentUserContext();
  if(!session)return NextResponse.json({success:false,error:"Chưa đăng nhập"},{status:401});
  const {id}=await context.params;
  let lookup;
  try{lookup=riderPerformanceLookup(id);}catch{return NextResponse.json({success:false,error:"ID rider không hợp lệ"},{status:400});}
  const query=new URL(request.url).searchParams;
  let range;
  try{range=readDetailRange(query);}catch(error){return NextResponse.json({success:false,error:error instanceof Error?error.message:"Khoảng ngày không hợp lệ"},{status:400});}
  const admin=createAdminClient();
  const {data:rider,error:riderError}=await admin.from("riders").select("id,rider_code,full_name,avatar_url,kv,cot,status,pickup_district,pickup_ward,delivery_district,delivery_ward").in("kv",OPERATING_AREAS).eq(lookup.column,lookup.value).maybeSingle();
  if(riderError)return NextResponse.json({success:false,error:"Không đọc được hồ sơ rider"},{status:503});
  if(!rider)return NextResponse.json({success:false,error:"Không tìm thấy rider trong KV1–KV5"},{status:404});
  const performance:DetailSource[]=[];
  for(let offset=0;;offset+=500){
    const {data,error}=await admin.from("driver_performance_daily").select("*").eq("driver_id",rider.rider_code).gte("report_date",range.from).lte("report_date",range.to).order("report_date",{ascending:false}).order("performance_id").range(offset,offset+499);
    if(error)return NextResponse.json({success:false,error:"Không tải được dữ liệu Performance"},{status:503});
    performance.push(...(data??[]));if((data?.length??0)<500)break;
  }
  const daily=buildRiderDaily(performance,rider.cot);
  const headers={"Cache-Control":"private, no-store"};
  if(query.get("export")==="xlsx"){
    const {riderPerformanceWorkbook}=await import("@/lib/performance/rider-export");
    const XLSX=await import("xlsx");const workbook=riderPerformanceWorkbook(rider,range,daily);
    const buffer=XLSX.write(workbook,{type:"buffer",bookType:"xlsx",compression:true});
    const code=rider.rider_code.replace(/[^a-zA-Z0-9_-]/g,"_");
    return new Response(new Uint8Array(buffer),{headers:{...headers,"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="performance-${code}-${range.from}-${range.to}.xlsx"`}});
  }
  return NextResponse.json({success:true,rider,range,performance,daily,summary:summarizeRiderDaily(daily)},{headers});
}
