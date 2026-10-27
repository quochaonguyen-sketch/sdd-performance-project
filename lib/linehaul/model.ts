export type LinehaulTrip = {
 trip_id:string;lt_code:string;trip_day:string;vehicle:string;plate_number:string;driver_name:string;
 origin:string;destination:string;direction:"inbound"|"outbound"|"stopover";
 phase:"waiting"|"en_route"|"at_hub"|"departed"|"unloaded";hub_sequence:number;
 source?:"active"|"history"|"dashboard";hub_unloaded_at?:string|null;origin_atd?:string|null;
 hub_eta:string|null;hub_sta:string|null;hub_ata:string|null;hub_atd:string|null;
 orders:number|null;bags:number|null;loose:number|null;load_total:number|null;
 pack_description:string;pack_unknown:string;expected_unload:number|null;unloaded_units:number|null;
 lat:number|null;lng:number|null;gps_at:string|null;hub_lat:number|null;hub_lng:number|null;
 next_station:string|null;location_error:string|null;location_checked_at:string|null;
};
export type LinehaulData={day:string;snapshotAt:string|null;trips:LinehaulTrip[];canRefresh:boolean};
export const LH_PHASES={waiting:"Chờ xuất phát",en_route:"Đang về hub",at_hub:"Đã đến hub",departed:"Đã rời hub",unloaded:"Đã xả tải"};
export function eventOnDay(value:string|null|undefined,day:string){
 const stamp=value?Date.parse(value):NaN;
 return Number.isFinite(stamp)&&new Date(stamp+7*3600000).toISOString().slice(0,10)===day;
}
export function inTodayHistory(trip:LinehaulTrip,day:string){
 return eventOnDay(trip.hub_ata,day)||eventOnDay(trip.hub_unloaded_at,day);
}
export function arrivingSoon(trip:LinehaulTrip,now:number){
 const eta=trip.hub_eta?Date.parse(trip.hub_eta):NaN;
 return trip.phase==="en_route"&&Number.isFinite(eta)&&eta>=now&&eta-now<=30*60000;
}
export function gpsIsStale(trip:LinehaulTrip,now:number){
 return !trip.gps_at||!Number.isFinite(Date.parse(trip.gps_at))||now-Date.parse(trip.gps_at)>15*60000||Date.parse(trip.gps_at)>now+60000;
}
export function sortTrips(trips:LinehaulTrip[]){
 const rank={en_route:0,at_hub:1,waiting:2,departed:3,unloaded:4};
 return [...trips].sort((a,b)=>rank[a.phase]-rank[b.phase]||
  (a.source==="dashboard"&&b.source==="dashboard"?(Date.parse(b.hub_ata??"")||0)-(Date.parse(a.hub_ata??"")||0):
  a.phase==="unloaded"&&b.phase==="unloaded"?(Date.parse(b.hub_unloaded_at??"")||0)-(Date.parse(a.hub_unloaded_at??"")||0):
  (Date.parse(a.hub_eta??a.hub_sta??"")||Infinity)-(Date.parse(b.hub_eta??b.hub_sta??"")||Infinity))||a.lt_code.localeCompare(b.lt_code));
}
