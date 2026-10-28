import type { LinehaulTrip } from "./model";

export type RoadRoute = { key:string; distanceMeters:number; points:[number,number][] };

export function roadRouteKey(trip:LinehaulTrip){
 return [trip.trip_id,trip.lat,trip.lng,trip.hub_lat,trip.hub_lng,trip.gps_at].join("|");
}

export function validPoint(lat:unknown,lng:unknown):boolean{
 return typeof lat==="number"&&typeof lng==="number"&&Number.isFinite(lat)&&Number.isFinite(lng)
  &&Math.abs(lat)<=90&&Math.abs(lng)<=180&&(lat!==0||lng!==0);
}

export function parseRoadRoute(body:unknown,key:string):RoadRoute{
 const data=body as {code?:string;routes?:{distance?:number;geometry?:{type?:string;coordinates?:unknown[]}}[];waypoints?:{distance?:number}[]};
 const route=data?.routes?.[0],coordinates=route?.geometry?.coordinates;
 if(data?.code!=="Ok"||!route||typeof route.distance!=="number"||!Number.isFinite(route.distance)||route.distance<0
  ||route.geometry?.type!=="LineString"||!Array.isArray(coordinates)||coordinates.length<2||coordinates.length>50000
  ||!Array.isArray(data.waypoints)||data.waypoints.length!==2
  ||data.waypoints.some(point=>typeof point.distance!=="number"||!Number.isFinite(point.distance)||point.distance<0||point.distance>1000)){
  throw new Error("Chưa tìm được tuyến đường bộ phù hợp từ GPS đến hub.");
 }
 const points=coordinates.map(point=>{
  if(!Array.isArray(point)||point.length!==2||!validPoint(point[1],point[0]))throw new Error("Dịch vụ định tuyến trả tọa độ không hợp lệ.");
  return [point[1],point[0]] as [number,number];
 });
 return {key,distanceMeters:route.distance,points};
}
