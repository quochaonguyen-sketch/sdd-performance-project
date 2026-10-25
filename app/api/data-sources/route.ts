import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { DATA_SOURCES, sourceAllowed, sourceAction } from "@/lib/data-sources/catalog";

export async function GET() {
  const context = await getCurrentUserContext().catch(() => null);
  if (!context) return NextResponse.json({error:"Chưa đăng nhập"},{status:401});
  const sources = DATA_SOURCES.filter(s=>sourceAllowed(context.profile.role,context.profile.permissions,s.id));
  if (!sources.length) return NextResponse.json({error:"Không có quyền quản lý nguồn dữ liệu"},{status:403});
  const db=createAdminClient(), ids=sources.map(s=>s.id);
  const [settings,jobs,workers]=await Promise.all([
    db.from("data_source_settings").select("*").in("source_id",ids),
    db.from("data_source_jobs").select("id,source_id,report_date,status,phase,requested_at,started_at,finished_at,message,events,worker_id").in("source_id",ids).order("requested_at",{ascending:false}).limit(100),
    db.from("data_source_workers").select("id,hostname,version,concurrency,last_seen_at").order("last_seen_at",{ascending:false}).limit(10),
  ]);
  if(settings.error||jobs.error||workers.error) return NextResponse.json({error:"Chưa tải được bảng điều khiển worker. Kiểm tra cấu hình máy chủ."},{status:503});
  return NextResponse.json({sources,settings:settings.data,jobs:jobs.data,workers:workers.data,serverTime:new Date().toISOString()},{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:Request) {
  const context=await getCurrentUserContext().catch(()=>null);
  if(!context) return NextResponse.json({error:"Chưa đăng nhập"},{status:401});
  let command:ReturnType<typeof sourceAction>;
  try { command=sourceAction(await request.json()); }
  catch(error) { return NextResponse.json({error:error instanceof Error?error.message:"Yêu cầu không hợp lệ"},{status:400}); }
  if(!sourceAllowed(context.profile.role,context.profile.permissions,command.source)) return NextResponse.json({error:"Không có quyền điều khiển nguồn này"},{status:403});
  const db=createAdminClient();
  const {data,error}=command.action==="auto"
    ? await db.rpc("configure_data_source_schedule",{p_source:command.source,p_actor:context.user.id,p_enabled:command.enabled,p_mode:command.mode,p_interval:command.interval,p_time:command.time,p_offset:command.offset})
    : await db.rpc("control_data_source",{p_source:command.source,p_action:command.action,p_day:command.day,p_actor:context.user.id,p_enabled:command.enabled,p_interval:command.interval});
  if(error) return NextResponse.json({error:"Không gửi được lệnh. Vui lòng tải lại trạng thái trước khi thử lại."},{status:503});
  return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
}
