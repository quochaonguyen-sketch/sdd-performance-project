import type { OperationsOverview } from "./operations-overview.ts";
import type { HubSheetData } from "./hub-sheet.ts";
import type { HubRoster } from "./hub-roster.ts";
import type { HubFc } from "./hub-fc.ts";
import type { OHData } from "../onhold/model.ts";
import type { LinehaulData } from "../linehaul/model.ts";
import { linehaulSummary } from "../linehaul/summary.ts";

export type ReportHub = HubSheetData & { roster?: {data:HubRoster|null;error:string|null}; fc?: {data:HubFc|null;error:string|null} };
export function buildDailyReport(day:string, hub:ReportHub|null, operations:OperationsOverview|null, lh:LinehaulData|null, oh:OHData|null, errors:string[]=[]) {
  const issues=[...errors];
  if(operations?.backlog.error)issues.push(operations.backlog.error);
  if(operations?.live.error)issues.push(operations.live.error);
  const onDay=(stamp:string|null|undefined)=>!!stamp&&Number.isFinite(Date.parse(stamp))&&new Date(Date.parse(stamp)+7*3600000).toISOString().slice(0,10)===day;
  const currentHub=hub?.date===day?hub:null;
  const currentLive=operations?.live.workDate===day&&!operations.live.error?operations.live.data:null;
  const backlog=operations?.backlog&&!operations.backlog.error&&onDay(operations.backlog.snapshotAt)?operations.backlog.data:null;
  const roster=hub?.roster?.data?.date===day?hub.roster.data.daily:null;
  const excludedFte=roster?.actual_fte!=null?Math.min(10,roster.actual_fte):null;
  const fte=roster?.actual_fte!=null&&excludedFte!==null?roster.actual_fte-excludedFte:null;
  const forecast=hub?.fc?.data?.rows.find(r=>r.date===day);
  const ohReport=oh?.reports.find(r=>r.report_date===day);
  const unloaded=lh?.day===day&&lh.snapshotAt?linehaulSummary(lh.trips,day).groups.unloaded:null;
  const wh=unloaded&&!unloaded.missing?unloaded.knownOrders:null;
  const inbound=currentHub?.totals.lm_hub_inbounded_order_qty_eod??null;
  const mp=inbound!==null&&wh!==null&&inbound>=wh?inbound-wh:null;
  const onhold=ohReport?.total_orders??null, nonAttempt=backlog?.total??null;
  if(inbound!==null&&wh!==null&&inbound<wh)issues.push("WH Inbound lớn hơn Total Inbound; chưa tính MP Inbound.");
  if(unloaded?.missing)issues.push(`${unloaded.missing} chuyến LH đã xả chưa rõ số đơn; WH/MP Inbound chưa đầy đủ.`);
  if(!currentLive)issues.push("Chưa có Assigned Delivery của hôm nay.");
  if(!backlog)issues.push("Chưa có snapshot Non-attempt hôm nay hoặc thiếu quyền xem.");
  if(!currentHub)issues.push("Chưa có Total Inbound của hôm nay.");
  if(!unloaded)issues.push("Chưa có nguồn LH hôm nay hoặc thiếu quyền xem.");
  if(!ohReport)issues.push("Chưa có báo cáo OH hôm nay.");
  if(!roster)issues.push("Chưa có tổng nhân sự của ngày báo cáo.");
  if(hub?.roster?.error)issues.push(hub.roster.error);
  if(hub?.fc?.error)issues.push(hub.fc.error);
  const metric=(label:string,actual:number|null,fc:number|null=null)=>({label,actual,forecast:fc,rate:actual!==null&&fc!==null&&fc>0?actual/fc*100:null});
  const headcount=currentLive?.headcount??null;
  return {day,createdAt:new Date().toISOString(),issues:[...new Set(issues)],
    metrics:[metric("WH Inbound",wh,forecast?.wh??null),metric("MP Inbound",mp,forecast?.mp??null),metric("Total Inbound",inbound,forecast?.total??null),metric("Outbound Volume",currentLive?.assigned??null),metric("Pending Outbound",onhold!==null&&nonAttempt!==null?onhold+nonAttempt:null),metric("Onhold",onhold),metric("Non-attempt",nonAttempt)],
    staff:[{label:"FTE",value:fte},{label:"BPO",value:roster?.actual_bpo??null},{label:"OS",value:roster?.actual_os??null},{label:"Rider",value:headcount?.total??null},{label:"COT 1",value:headcount?.cot1??null},{label:"COT 2",value:headcount?.cot2??null},{label:"Chưa rõ COT",value:headcount?.unknownCot??null},{label:"Tổng HC",value:roster?.actual_people!=null&&excludedFte!==null&&headcount?Math.max(0,roster.actual_people-excludedFte)+headcount.total:null}],
    areas:headcount?.areas??[],districts:backlog?.districts??[],backlogTotal:nonAttempt,unknownCot:backlog?.unknownCot??null,
    stamps:{hub:currentHub?.stations.map(s=>s.fetchedAt).join(" · ")??null,lh:lh?.snapshotAt??null,delivery:operations?.live.snapshotAt??null,backlog:operations?.backlog.snapshotAt??null,onhold:ohReport?.fetched_at??null,roster:hub?.roster?.data?.fetchedAt??null},
  };
}
export type DailyReport = ReturnType<typeof buildDailyReport>;
