"use client";
import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { LinehaulTrip } from "@/lib/linehaul/model";
import { gpsIsStale } from "@/lib/linehaul/model";
import { roadRouteKey, validPoint, type RoadRoute } from "@/lib/linehaul/road-route";
import styles from "./linehaul.module.css";

export default function LinehaulMap({trip,now}:{trip:LinehaulTrip;now:number}){
 const vehicle=validPoint(trip.lat,trip.lng)?[trip.lat!,trip.lng!] as [number,number]:null;
 const hub=validPoint(trip.hub_lat,trip.hub_lng)?[trip.hub_lat!,trip.hub_lng!] as [number,number]:null;
 const key=roadRouteKey(trip),eligible=Boolean(vehicle&&hub&&["waiting","en_route"].includes(trip.phase)&&!trip.hub_ata&&!trip.hub_atd);
 const [result,setResult]=useState<{key:string;route?:RoadRoute;error?:string}|null>(null);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  if(!eligible)return;
  const controller=new AbortController();
  void fetch(`/api/linehaul/route?trip_id=${encodeURIComponent(trip.trip_id)}`,{cache:"no-store",signal:controller.signal})
   .then(async response=>{
    const body=await response.json() as RoadRoute&{error?:string};
    if(!response.ok)throw new Error(body.error||"Chưa tính được quãng đường đến hub.");
    if(body.key!==key)throw new Error("GPS vừa thay đổi. Đang chờ cập nhật vị trí mới.");
    if(!controller.signal.aborted)setResult({key,route:body});
   }).catch(error=>{if(!controller.signal.aborted)setResult({key,error:error instanceof Error?error.message:"Chưa tính được đường đến hub."});});
  return()=>controller.abort();
 },[key,eligible,trip.trip_id,retry]);
 const route=result?.key===key?result.route:undefined,error=result?.key===key?result.error:undefined;
 if(!vehicle&&!hub)return <div style={{padding:32,textAlign:"center"}}>SPX chưa cung cấp tọa độ cho chuyến này.</div>;
 return <div className={styles.routeMap}>
  <div className={styles.roadDistance} role="status" aria-live="polite">
   {eligible?(route?<><span>Còn <strong>{new Intl.NumberFormat("vi-VN",{maximumFractionDigits:1}).format(route.distanceMeters/1000)} km</strong> đến hub</span><small>{gpsIsStale(trip,now)?"Ước tính từ GPS cũ":"Ước tính theo GPS gần nhất"} · Đường ô tô</small><small>Có thể khác tuyến xe tải thực tế.</small></>:error?<><span>{error}</span><button type="button" onClick={()=>{setResult(null);setRetry(value=>value+1);}}>Thử lại</button></>:<span>Đang tính đường bộ đến hub…</span>):<span>{!hub?"SPX chưa cung cấp tọa độ hub để tính đường.":trip.hub_atd||trip.phase==="departed"?"Xe đã rời hub.":trip.hub_ata||trip.phase==="at_hub"?"Xe đã đến hub.":"Chưa đủ GPS để tính đường đến hub."}</span>}
  </div>
 <MapContainer center={vehicle??hub!} zoom={12} style={{flex:1,minHeight:180,width:"100%"}} scrollWheelZoom={false}>
  <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
  <Fit trip={trip} route={eligible?route:undefined}/>
  {eligible&&route?<Polyline positions={route.points} pathOptions={{color:"#315e91",weight:5,opacity:0.85}}><Tooltip>Tuyến đường bộ ước tính đến hub</Tooltip></Polyline>:null}
  {hub?<CircleMarker center={hub} radius={8} pathOptions={{color:"#1e344d",fillColor:"#315e91",fillOpacity:1}}><Tooltip>Hub 52-HCM SDD-01</Tooltip></CircleMarker>:null}
  {vehicle?<CircleMarker center={vehicle} radius={10} pathOptions={{color:"white",weight:3,fillColor:gpsIsStale(trip,now)?"#7c8799":"#0f8b70",fillOpacity:1}}><Tooltip permanent>{trip.plate_number||trip.lt_code}{gpsIsStale(trip,now)?" · GPS cũ":" · Xe"}</Tooltip></CircleMarker>:null}
 </MapContainer></div>;
}
function Fit({trip,route}:{trip:LinehaulTrip;route?:RoadRoute}){
 const map=useMap();
 useEffect(()=>{
  const points:[number,number][]=[...(route?.points??[])];
  if(validPoint(trip.lat,trip.lng))points.push([trip.lat!,trip.lng!]);
  if(validPoint(trip.hub_lat,trip.hub_lng))points.push([trip.hub_lat!,trip.hub_lng!]);
  if(points.length>=2)map.fitBounds(points,{padding:[40,40],maxZoom:14});else if(points[0])map.setView(points[0],13);
  map.invalidateSize();
 },[map,trip.lat,trip.lng,trip.hub_lat,trip.hub_lng,route]);
 return null;
}
