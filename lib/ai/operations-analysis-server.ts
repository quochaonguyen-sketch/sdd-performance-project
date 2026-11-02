import "server-only";
import type { CurrentUserContext } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getOHPivot } from "@/lib/onhold/server";
import { getReturnWorkspace } from "@/lib/return-orders/workspace-server";
import { getReturnHistory } from "@/lib/return-orders/history-server";
import { readAllPages } from "@/lib/pickup/realtime";
import { TtlCache } from "@/lib/cache/ttl-cache";
import type { OHData } from "@/lib/onhold/model";
import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { addDays } from "@/lib/team/model";
import { todayInVietnam } from "./work-date";
import { analysisAccess } from "./source-access";
import { buildOperationsAnalysis, validateAnalysisScope, type AnalysisInput, type AnalysisScope, type AnalysisHub, type AnalysisOvernightRow, type AnalysisOvernightSnapshot } from "./operations-analysis";
import type { BriefingSource } from "./briefing";
import type { BacklogHourlyDay } from "@/lib/dashboard/backlog-history";
import type { DashboardVolumeRow } from "@/lib/dashboard/volume-overview";

const ohDayCache = new TtlCache<OHData>(60_000, 64);

export async function loadOperationsAnalysis(context: CurrentUserContext, scope: AnalysisScope, signal?: AbortSignal, returnOnly = false) {
  const today=todayInVietnam();validateAnalysisScope(scope,today);
  const access=analysisAccess(context),baseline=addDays(scope.from,-1);
  const input:AnalysisInput={scope,today,now:new Date().toISOString(),sources:[],backlog:null,oh:null,volume:null,overnight:null,hub:null,returns:null};
  let admin:ReturnType<typeof createAdminClient>|undefined;
  const db=()=>admin??=createAdminClient();
  async function source(id:string,label:string,href:string,allowed:boolean,read:(target:BriefingSource)=>Promise<void>){
    if (returnOnly && !id.startsWith("analysis_return")) return;
    const target:BriefingSource={id,label,href,state:allowed?"missing":"forbidden",at:null,note:allowed?"Chưa có dữ liệu trong khoảng ngày.":"Tài khoản không có quyền xem nguồn này."};
    input.sources.push(target);if(!allowed)return;
    try{await read(target);}catch{target.state="error";target.note="Không tải đủ nguồn; phần phân tích này để trống. Mở trang nguồn để kiểm tra hoặc thử lại.";}
  }
  const dates:string[]=[];for(let date=baseline;date<=scope.to;date=addDays(date,1))dates.push(date);
  const readBacklog=(kind:"delivery"|"pickup")=>source(`analysis_backlog_${kind}`,`Backlog ${kind}`,"/backlog-history",access.backlog,async target=>{
    const days:BacklogHourlyDay[]=[];
    for(let offset=0;offset<dates.length;offset+=2){
      const batch=await Promise.all(dates.slice(offset,offset+2).map(async day=>{const {data,error}=await db().rpc("read_backlog_hourly",{p_source:kind,p_day:day}).abortSignal(signal??AbortSignal.timeout(45000));if(error||!data)throw Error("Backlog unavailable");return data as BacklogHourlyDay;}));days.push(...batch);
    }
    input.backlog=[...(input.backlog??[]),...days];
    const stamps=days.filter(day=>day.day>=scope.from).flatMap(day=>day.hours.filter(hour=>hour.hour===scope.hour&&hour.snapshot_id).map(hour=>hour.source_snapshot_at)).filter((at):at is string=>!!at).sort();
    target.state=stamps.length?"ready":"missing";target.at=stamps.at(-1)??null;target.note=`Cùng mốc ${scope.hour}:50; chỉ so biến động giữa các snapshot chính thức. Không lấy snapshot giờ khác để bù ngày thiếu.`;
  });
  await Promise.all([
    readBacklog("delivery"),readBacklog("pickup"),
    source("analysis_oh","OH theo ngày","/onhold",access.oh,async target=>{
      const results: OHData[] = [];
      // Day-sized pivots avoid statement timeouts on multi-day OH aggregates.
      for (const date of dates) {
        signal?.throwIfAborted();
        results.push((await ohDayCache.load(`${context.user.id}:${date}`, () => getOHPivot(date,date))).value);
      }
      input.oh={reports:results.flatMap(result=>result.reports),cells:results.flatMap(result=>result.cells)};
      target.state=input.oh.reports.length?"ready":"missing";target.at=input.oh.reports.map(row=>row.fetched_at).sort().at(-1)??null;target.note="OH gồm trạng thái 1 và 5 của báo cáo; cache theo tài khoản tối đa 60 giây. Ngày chưa chốt có số tạm tính; không kết luận tăng/giảm so ngày đã chốt.";
    }),
    source("analysis_volume","Delivery Volume","/volume/delivery",access.volume,async target=>{
      const client=await createClient();
      input.volume=await readAllPages<DashboardVolumeRow>((from,to)=>client.from("delivery_order").select("report_date,area,total_orders").in("area",OPERATING_AREAS).gte("report_date",baseline).lte("report_date",scope.to).order("report_date").order("id").range(from,to).abortSignal(signal??AbortSignal.timeout(45000)),1000,4);
      target.state=input.volume.length?"ready":"missing";target.at=new Date().toISOString();target.note="Mẫu số tỷ lệ OH: Delivery Volume cùng ngày và KV. Toàn đội cần đủ dữ liệu cả 5 KV; ngày/KV thiếu không coi là 0.";
    }),
    source("analysis_overnight","Giữ hàng qua đêm","/overnight-holds",access.overnight,async target=>{
      const [snapshots,rows]=await Promise.all([
        readAllPages<AnalysisOvernightSnapshot>((from,to)=>db().from("overnight_hold_snapshots").select("cutoff_date,captured_at,status,status_synced_at").eq("status","locked").gte("cutoff_date",baseline).lte("cutoff_date",scope.to).order("cutoff_date").range(from,to),1000),
        readAllPages<AnalysisOvernightRow>((from,to)=>db().from("overnight_hold_orders").select("cutoff_date,area,current_status").eq("is_cutoff_member",true).gte("cutoff_date",baseline).lte("cutoff_date",scope.to).order("cutoff_date").order("order_key").range(from,to).abortSignal(signal??AbortSignal.timeout(45000)),1000,4),
      ]);
      input.overnight={snapshots,rows};target.state=snapshots.length?"ready":"missing";target.at=snapshots.map(row=>row.status_synced_at??row.captured_at).sort().at(-1)??null;target.note="Cohort cutoff 23h đã khóa; số remaining theo trạng thái đồng bộ gần nhất, không phải trạng thái chụp lại tại ngày cũ.";
    }),
    source("analysis_fc","Inbound thực tế & FC HCM","/dashboard#fc-overview",access.fc,async target=>{
      const {GET}=await import("@/app/api/dashboard/hub-sheet/route");const response=await GET(new Request("http://localhost/api/dashboard/hub-sheet"));if(!response.ok)throw Error("Hub unavailable");
      input.hub=await response.json() as AnalysisHub;
      target.state=input.hub.fc?.data?"ready":"missing";target.at=input.hub.fc?.data?.checkedAt??null;target.note=`Actual Total Inbound ngày ${input.hub.date} so FC HCM Total cùng ngày/phạm vi. FC cache nguồn tối đa 15 phút; chưa có Actual lịch sử cho ngày khác.`;
    }),
    source("analysis_return","Return tại snapshot","/return-orders",access.returns,async target=>{
      input.returns=await getReturnWorkspace();target.state=input.returns.snapshotAt?"ready":"missing";target.at=input.returns.snapshotAt;target.note="Snapshot Return mới nhất; lịch sử ngày là nguồn riêng. Phân biệt tồn hub >5 ngày và đang trả >48 giờ; không suy tỷ lệ trả thành công từ số tồn.";
    }),
    source("analysis_return_history","Lịch sử Return theo ngày","/return-orders",access.returns,async target=>{
      input.returnHistory=await getReturnHistory(baseline,scope.to,signal);
      target.state=input.returnHistory.days.some(day=>day.report_date>=scope.from)?"ready":"missing";
      target.at=input.returnHistory.days.map(day=>day.captured_at).sort().at(-1)??null;
      target.note="Lần đồng bộ đầy đủ cuối mỗi ngày; tự lưu khi nguồn Return cập nhật thành công, kể cả khi không mở web. Ngày hiện tại tạm tính; chưa có lịch sử ngày cũ thì để trống.";
    }),
  ]);
  return buildOperationsAnalysis(input);
}
