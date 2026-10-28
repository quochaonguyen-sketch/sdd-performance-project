import {eventOnDay,type LinehaulTrip} from "./model.ts";

export const LOAD_STAGES={unloaded:"Đã xả",unloading:"Đang xả",incoming:"Đang về hub",loading:"Đang lên hàng",at_hub:"Đang chờ xả"} as const;
export type LoadStage=keyof typeof LOAD_STAGES;
export const LOAD_STAGE_KEYS=Object.keys(LOAD_STAGES) as LoadStage[];
const quantity=(value:number|null|undefined)=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?value:null;

export function fullyUnloaded(trip:LinehaulTrip){
 const total=quantity(trip.load_total),expected=quantity(trip.expected_unload),actual=quantity(trip.unloaded_units);
 return trip.direction!=="outbound"&&trip.phase==="unloaded"&&!!trip.hub_unloaded_at
  &&total!==null&&total>0&&expected===total&&actual!==null&&actual>=total;
}
export function isTripUnloaded(trip:LinehaulTrip){
 return trip.direction!=="outbound"&&trip.phase==="unloaded";
}
export function loadStage(trip:LinehaulTrip):LoadStage|null{
 if(trip.direction==="outbound")return null;
 if(trip.phase==="unloading")return "unloading";
 if(isTripUnloaded(trip))return "unloaded";
 if(trip.phase==="en_route")return "incoming";
 if(trip.phase==="waiting")return "loading";
 if(trip.phase==="at_hub")return "at_hub";
 return null;
}
export function stageOrders(trip:LinehaulTrip,stage:LoadStage){
 if(stage==="unloaded"){
  if(trip.direction!=="outbound"&&trip.phase==="unloaded"&&(fullyUnloaded(trip)||trip.expected_unload===null||trip.unload_confirmation==="active_list_absence"))return quantity(trip.orders);
  if(trip.direction!=="inbound"||!fullyUnloaded(trip))return null;
 }
 return quantity(trip.orders);
}
export function linehaulSummary(trips:LinehaulTrip[],day:string){
 const groups=Object.fromEntries(LOAD_STAGE_KEYS.map(key=>[key,{key,label:LOAD_STAGES[key],trips:[] as LinehaulTrip[],knownOrders:0,missing:0}])) as Record<LoadStage,{key:LoadStage;label:string;trips:LinehaulTrip[];knownOrders:number;missing:number}>;
 const hourly=Array.from({length:24},(_,hour)=>({hour,orders:{unloaded:0,unloading:0,incoming:0,loading:0,at_hub:0},missing:{unloaded:0,unloading:0,incoming:0,loading:0,at_hub:0},trips:[] as LinehaulTrip[]}));
 const unplaced={unloaded:0,unloading:0,incoming:0,loading:0,at_hub:0};
 for(const trip of trips){
  if(trip.trip_day!==day)continue;
  const stage=loadStage(trip);if(!stage)continue;
  if(stage==="unloaded"&&!eventOnDay(trip.hub_unloaded_at??trip.hub_ata,day))continue;
  const group=groups[stage],orders=stageOrders(trip,stage);
  group.trips.push(trip);if(orders===null)group.missing++;else group.knownOrders+=orders;
  const stamp=stage==="unloaded"?trip.hub_unloaded_at:stage==="unloading"?(trip.hub_unseal_at??trip.hub_ata):stage==="at_hub"?trip.hub_ata:trip.hub_sta;
  if(!stamp||!eventOnDay(stamp,day)){unplaced[stage]++;continue;}
  const hour=new Date(Date.parse(stamp)+7*3600000).getUTCHours();
  hourly[hour].trips.push(trip);if(orders!==null)hourly[hour].orders[stage]+=orders;else hourly[hour].missing[stage]++;
 }
 return {groups,hourly,unplaced};
}
