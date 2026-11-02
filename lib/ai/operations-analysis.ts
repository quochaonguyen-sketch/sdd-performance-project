import { addDays } from "../team/model.ts";
import { normalizeOperatingArea, OPERATING_AREAS } from "../locations/operating-areas.ts";
import { validHistoryDay, hourlyValue, type BacklogHourlyDay } from "../dashboard/backlog-history.ts";
import { reasonNameVi, type OHData } from "../onhold/model.ts";
import { returnAge, returnArea, type ReturnWorkspaceData } from "../return-orders/workspace.ts";
import { resolveWorkDateScope } from "./work-date.ts";
import type { BriefingSource } from "./briefing.ts";
import type { DashboardVolumeRow } from "../dashboard/volume-overview.ts";
import { summarizeReturnHistory, type ReturnHistoryData } from "../return-orders/history.ts";

export type AnalysisScope = { from: string; to: string; area: string; hour: number };
export type AnalysisOvernightSnapshot = { cutoff_date: string; captured_at: string; status: string; status_synced_at: string | null };
export type AnalysisOvernightRow = { cutoff_date: string; area: string; current_status: string };
export type AnalysisHub = { date: string; totals: Record<string, number | null>; stations: { fetchedAt: string }[]; fc?: { data: { rows: { date: string; total: number | null; mismatch: boolean }[]; checkedAt: string }; error: string | null } };
export type AnalysisInput = {
  scope: AnalysisScope; today: string; now: string; sources: BriefingSource[];
  backlog: BacklogHourlyDay[] | null; oh: OHData | null; volume: DashboardVolumeRow[] | null;
  overnight: { snapshots: AnalysisOvernightSnapshot[]; rows: AnalysisOvernightRow[] } | null;
  hub: AnalysisHub | null; returns: ReturnWorkspaceData | null; returnHistory?: ReturnHistoryData | null;
};
export function validateAnalysisScope(scope: AnalysisScope, today: string) {
  if (!validHistoryDay(scope.from) || !validHistoryDay(scope.to) || scope.from > scope.to || scope.to > today || Date.parse(scope.to)-Date.parse(scope.from)>30*86400000 || !Number.isInteger(scope.hour) || scope.hour<0 || scope.hour>23 || scope.area !== "all" && !OPERATING_AREAS.includes(scope.area as typeof OPERATING_AREAS[number])) throw Error("Chọn khoảng ngày hợp lệ trong quá khứ/hiện tại, tối đa 31 ngày; KV1–KV5 và giờ 0–23.");
  return scope;
}
export function analysisScopeForQuestion(question: string, today: string): AnalysisScope {
  const clean = question.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g,"d").toLowerCase();
  const count = clean.match(/\b(\d{1,2})\s*ngay\b/);
  const explicit = /\btuan\b|hom qua|hom nay|\d{1,2}[/-]\d{1,2}|\d{4}-\d{2}-\d{2}/.test(clean);
  const resolved = resolveWorkDateScope(question, new Date(`${today}T12:00:00+07:00`));
  const to = explicit && !count ? (resolved.end > today ? today : resolved.end) : today;
  const from = count ? addDays(to, 1 - Number(count[1])) : explicit ? resolved.start : addDays(to, -6);
  const area = /toan bo|toan doi|tat ca|kv1\s*[-–]\s*kv5/.test(clean) ? null : clean.match(/\b(?:kv|khu vuc)\s*([1-5])\b/), hour = clean.match(/\b(\d{1,2})(?:h\b|:(?:00|50)\b)/);
  return validateAnalysisScope({ from, to, area: area ? `KV${area[1]}` : "all", hour: hour ? Number(hour[1]) : 23 }, today);
}
export const needsOperationsAnalysis = (q: string) => /backlog|\boh\b|on.?hold|qua đêm|qua dem|\bvolume\b|\bfc\b|forecast|\breturn\b|hàng trả|hang tra|trả hàng/i.test(q);
export const isReturnOnlyAnalysis = (q: string) => /\breturn\b|hàng trả|hang tra|trả hàng/i.test(q) && !needsOperationsAnalysis(q.replace(/\breturn\b|hàng trả|hang tra|trả hàng/ig, ""));
export function metricChange(value: number | null, previous: number | null, comparable = true) {
  if (!comparable || value === null || previous === null) return null;
  const delta = value - previous;
  return { delta, percent: previous > 0 ? delta / previous * 100 : value === 0 ? 0 : null };
}
const sum = <T>(rows: T[], value: (row: T) => number) => rows.reduce((total,row)=>total+value(row),0);

export function buildOperationsAnalysis(input: AnalysisInput) {
  const { scope, today, now, sources } = input;
  const dates: string[] = []; for(let date=scope.from;date<=scope.to;date=addDays(date,1)) dates.push(date);
  const ready = (id: string) => sources.some(source=>source.id===id&&source.state==="ready");
  const inArea = (value: string) => !!normalizeOperatingArea(value) && (scope.area==="all" || normalizeOperatingArea(value)===scope.area);
  const oh = ready("analysis_oh") ? input.oh : null, volume = ready("analysis_volume") ? input.volume : null;
  const reports = new Map(oh?.reports.map(report=>[report.report_date,report]) ?? []);
  const cells = oh?.cells.filter(cell=>inArea(cell.area)) ?? [];
  const closedOH = (date: string) => { const report=reports.get(date); return !!report && (!!report.finalized_at || report.collection_mode!=="cumulative" && date<today); };
  const ohAt = (date: string) => reports.has(date) ? sum(cells.filter(cell=>cell.report_date===date),cell=>Number(cell.orders)) : null;
  const volumeByDay = new Map<string,Map<string,number>>();
  for(const row of volume ?? []) {
    const area=normalizeOperatingArea(row.area),date=row.report_date?.slice(0,10),count=row.total_orders===null?1:Number(row.total_orders);
    if(!area||!date||!Number.isFinite(count)||count<0)continue;
    const areas=volumeByDay.get(date)??new Map<string,number>();areas.set(area,(areas.get(area)??0)+count);volumeByDay.set(date,areas);
  }
  const volumeAt = (date: string) => { const areas=volumeByDay.get(date); if(!areas)return null;
    if(scope.area!=="all")return areas.get(scope.area)??null;
    return OPERATING_AREAS.every(area=>areas.has(area))?sum([...areas.values()],n=>n):null;
  };
  const rateAt = (date: string) => {const numerator=ohAt(date),denominator=volumeAt(date);return numerator!==null&&denominator!==null&&denominator>0?numerator/denominator*100:null;};
  function backlogAt(source: "delivery"|"pickup", date: string) {
    if(!ready(`analysis_backlog_${source}`))return {value:null,final:false,at:null};
    const point=input.backlog?.find(row=>row.source===source&&row.day===date)?.hours.find(row=>row.hour===scope.hour);
    return { value:hourlyValue(point,"orders",scope.area==="all"?"":scope.area),final:point?.is_final??false,at:point?.source_snapshot_at??null };
  }
  const locked = new Map((ready("analysis_overnight")?input.overnight?.snapshots:[])?.filter(row=>row.status==="locked").map(row=>[row.cutoff_date,row])??[]);
  const overnightRows=(ready("analysis_overnight")?input.overnight?.rows:[])?.filter(row=>inArea(row.area))??[];
  const overnightAt = (date: string) => {
    const snapshot=locked.get(date); if(!snapshot)return null;
    const rows=overnightRows.filter(row=>row.cutoff_date===date),resolved=rows.filter(row=>["Delivered","Returned"].includes(row.current_status)).length;
    return {total:rows.length,resolved,remaining:rows.length-resolved,capturedAt:snapshot.captured_at,statusSyncedAt:snapshot.status_synced_at};
  };
  const daily = dates.map(date=> {
    const previous=addDays(date,-1),delivery=backlogAt("delivery",date),pickup=backlogAt("pickup",date),beforeDelivery=backlogAt("delivery",previous),beforePickup=backlogAt("pickup",previous);
    const orders=ohAt(date),rate=rateAt(date),previousRate=rateAt(previous),comparable=closedOH(date)&&closedOH(previous),held=overnightAt(date),beforeHeld=overnightAt(previous);
    return {date,deliveryBacklog:{...delivery,change:metricChange(delivery.value,beforeDelivery.value,delivery.final&&beforeDelivery.final)},pickupBacklog:{...pickup,change:metricChange(pickup.value,beforePickup.value,pickup.final&&beforePickup.final)},
      volume:volumeAt(date),oh:{orders,rate,denominator:volumeAt(date),partial:reports.has(date)&&!closedOH(date),at:reports.get(date)?.fetched_at??null,change:metricChange(orders,ohAt(previous),comparable),rateChangePp:comparable&&rate!==null&&previousRate!==null?rate-previousRate:null},
      overnight:held?{...held,change:metricChange(held.total,beforeHeld?.total??null)}:null};
  });
  const recentFirst = [...daily].reverse();
  const focus = (recentFirst.find(row => row.oh.rate !== null && !row.oh.partial) ?? recentFirst.find(row => row.oh.orders !== null))?.date ?? scope.to;
  const previousFocus=addDays(focus,-1),focusCells=cells.filter(cell=>cell.report_date===focus),previousCells=cells.filter(cell=>cell.report_date===previousFocus);
  const ohGroups=new Map<string,{area:string;district:string;ward:string;orders:number;previous:number}>();
  for(const [side,rows] of [["orders",focusCells],["previous",previousCells]] as const)for(const cell of rows){const area=normalizeOperatingArea(cell.area)!;const district=cell.district||"Chưa rõ quận",ward=cell.ward||"Chưa rõ phường",key=JSON.stringify([area,district,ward]);const group=ohGroups.get(key)??{area,district,ward,orders:0,previous:0};group[side]+=Number(cell.orders);ohGroups.set(key,group);}
  const focusTotal = ohAt(focus);
  const ohHotspots=[...ohGroups.values()].map(row=>({...row,sharePct:focusTotal!==null&&focusTotal>0?row.orders/focusTotal*100:null,change:metricChange(row.orders,row.previous,closedOH(focus)&&closedOH(previousFocus))})).sort((a,b)=>b.orders-a.orders||a.area.localeCompare(b.area)||a.ward.localeCompare(b.ward)).slice(0,15);
  const ohAreas=OPERATING_AREAS.filter(area=>scope.area==="all"||scope.area===area).map(area=>{const orders=reports.has(focus)?sum(focusCells.filter(row=>normalizeOperatingArea(row.area)===area),row=>Number(row.orders)):null,denominator=volumeByDay.get(focus)?.get(area)??null,previousOrders=reports.has(previousFocus)?sum(previousCells.filter(row=>normalizeOperatingArea(row.area)===area),row=>Number(row.orders)):null,previousDenom=volumeByDay.get(previousFocus)?.get(area)??null,rate=orders!==null&&denominator!==null&&denominator>0?orders/denominator*100:null,previousRate=previousOrders!==null&&previousDenom!==null&&previousDenom>0?previousOrders/previousDenom*100:null;
    return {area,orders,volume:denominator,rate,change:metricChange(orders,previousOrders,closedOH(focus)&&closedOH(previousFocus)),rateChangePp:closedOH(focus)&&closedOH(previousFocus)&&rate!==null&&previousRate!==null?rate-previousRate:null};});
  const reasons=new Map<string,number>();for(const cell of focusCells)reasons.set(cell.reason,(reasons.get(cell.reason)??0)+Number(cell.orders));
  const hub=ready("analysis_fc")?input.hub:null,fcRow=hub?.fc?.data?.rows.find(row=>row.date===hub.date),actual=hub&&hub.date>=scope.from&&hub.date<=scope.to&&scope.area==="all"?hub.totals.lm_hub_inbounded_order_qty_eod??null:null;
  const forecast=hub?{date:hub.date,partial:hub.date>=today,actual,fc:hub.date>=scope.from&&hub.date<=scope.to&&scope.area==="all"?fcRow?.total??null:null,change:metricChange(actual,scope.area==="all"?fcRow?.total??null:null),attainmentPct:actual!==null&&fcRow?.total&&scope.area==="all"?actual/fcRow.total*100:null,mismatch:fcRow?.mismatch??false,at:hub.stations.map(row=>row.fetchedAt).join(" · "),note:scope.area!=="all"?"FC HCM Total không chia KV; không so Volume của một KV với FC toàn HCM.":hub.date<scope.from||hub.date>scope.to?`Ngày hub ${hub.date} ngoài khoảng chọn; chưa có Actual Inbound lịch sử để so FC.`:"Ngày hôm nay là tạm tính. So Total Inbound với FC HCM Total cùng ngày, không dùng Delivery Volume làm Actual Inbound. Nguồn hub chỉ có ngày hiện có; chưa suy lịch sử các ngày khác."}:null;
  const returnData=ready("analysis_return")?input.returns:null;
  const returnHistory = ready("analysis_return_history") && input.returnHistory ? summarizeReturnHistory(input.returnHistory, scope, today) : null;
  const returnRows=returnData?.rows.filter(row=>inArea(row.seller_area))??[];
  const returnGroups=new Map<string,{area:string;district:string;total:number;waiting:number;returning:number;over5Days:number;returningOver48h:number}>();
  let unknownHubAge=0,unknownReturningStart=0;
  for(const row of returnRows){const area=returnArea(row.seller_area),district=row.seller_district||"Chưa rõ quận",key=JSON.stringify([area,district]),group=returnGroups.get(key)??{area,district,total:0,waiting:0,returning:0,over5Days:0,returningOver48h:0};group.total++;group[row.order_status===72?"returning":"waiting"]++;const age=returnAge(row,Date.parse(now));if(age===null)unknownHubAge++;else if(age>5)group.over5Days++;if(row.order_status===72){const start=Date.parse(row.delivering_time??"");if(!Number.isFinite(start))unknownReturningStart++;else if(Date.parse(now)-start>48*3600000)group.returningOver48h++;}returnGroups.set(key,group);}
  const returnHotspots=[...returnGroups.values()].sort((a,b)=>b.over5Days-a.over5Days||b.total-a.total||a.area.localeCompare(b.area));
  const returns=returnData?.snapshotAt?{snapshotAt:returnData.snapshotAt,ageEvaluatedAt:now,total:returnRows.length,waiting:returnRows.filter(row=>row.order_status!==72).length,returning:returnRows.filter(row=>row.order_status===72).length,over5Days:sum(returnHotspots,row=>row.over5Days),returningOver48h:sum(returnHotspots,row=>row.returningOver48h),unknownHubAge,unknownReturningStart,hotspots:returnHotspots.slice(0,15),historyAvailable:!!returnHistory?.latest,note:"Snapshot Return hiện tại (trạng thái 10/67 chờ trả, 72 đang trả); không phải số hàng đã trả thành công. Tăng/giảm tồn theo ngày đọc từ returnHistory nếu có đủ hai ngày liền kề."}:null;
  const latestOvernight=[...daily].reverse().find(row=>row.overnight)?.date;
  const overnightFocus = latestOvernight ? { date: latestOvernight, ...overnightAt(latestOvernight)! } : null;
  const overnightHotspots=latestOvernight?OPERATING_AREAS.filter(area=>scope.area==="all"||scope.area===area).map(area=>{const rows=overnightRows.filter(row=>row.cutoff_date===latestOvernight&&normalizeOperatingArea(row.area)===area);return {date:latestOvernight,area,total:rows.length,remaining:rows.filter(row=>!["Delivered","Returned"].includes(row.current_status)).length};}).sort((a,b)=>b.remaining-a.remaining):[];
  return {scope,backlogCheckpoint:`${scope.hour}:50`,generatedAt:now,sources,daily,ohFocusDate:focus,ohAreas,ohHotspots,ohReasons:[...reasons].map(([code,orders])=>({code,label:reasonNameVi(code),orders})).sort((a,b)=>b.orders-a.orders).slice(0,8),overnightFocus,overnightHotspots,forecast,returns,returnHistory,
    definitions:{ohRate:"Số OH / Delivery Volume cùng ngày, cùng KV × 100. Tỷ trọng quận/phường là số OH điểm đó / tổng OH trong phạm vi; không phải tỷ lệ trên Volume quận/phường.",change:"Δ = hiện tại − ngày trước; % thay đổi = Δ/ngày trước ×100. Mẫu số 0 không tính %. Tỷ lệ OH so bằng điểm phần trăm, không nhầm với % thay đổi số OH.",backlog:`So cùng giờ ${scope.hour}:50 theo checkpoint. Chỉ tính biến động khi hai ngày đều có snapshot chính thức. Ngày thiếu/chưa chốt để trống, không chuyển thành 0.`,overnight:"Số giữ tại cutoff 23h của từng ngày là cohort riêng. Remaining là trạng thái hiện tại của cohort, không phải snapshot trạng thái tại ngày cũ; không suy số đã xử lý từ chênh lệch giữa hai cohort.",limits:"Điểm nóng OH/Return giới hạn 15 dòng, lý do OH 8 dòng; tổng được tính trước khi giới hạn. Dữ liệu lịch sử không áp dụng ngưỡng cũ 20 phút của realtime. FC chỉ so cùng loại sản lượng và cùng phạm vi."}};
}
export type OperationsAnalysis = ReturnType<typeof buildOperationsAnalysis>;
