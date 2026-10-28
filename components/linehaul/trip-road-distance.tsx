"use client";
import {useEffect,useState} from "react";
import {gpsIsStale,type LinehaulTrip} from "@/lib/linehaul/model";
import {roadRouteKey,validPoint,type RoadRoute} from "@/lib/linehaul/road-route";
import styles from "./linehaul.module.css";

const km=new Intl.NumberFormat("vi-VN",{maximumFractionDigits:1});

export function TripRoadDistance({trip,now}:{trip:LinehaulTrip;now:number}){
 const key=roadRouteKey(trip);
 const active=["waiting","en_route"].includes(trip.phase)&&!trip.hub_ata&&!trip.hub_atd;
 const hasGps=validPoint(trip.lat,trip.lng)&&validPoint(trip.hub_lat,trip.hub_lng);
 const [result,setResult]=useState<{key:string;distance?:number;error?:string}|null>(null);
 useEffect(()=>{
  if(!active||!hasGps)return;
  const controller=new AbortController();
  void fetch(`/api/linehaul/route?trip_id=${encodeURIComponent(trip.trip_id)}`,{cache:"no-store",signal:controller.signal})
   .then(async response=>{
    const body=await response.json() as RoadRoute&{error?:string};
    if(!response.ok)throw new Error(body.error||"Chưa tính được quãng đường.");
    if(body.key!==key)throw new Error("GPS vừa thay đổi; chờ cập nhật vị trí mới.");
    if(!controller.signal.aborted)setResult({key,distance:body.distanceMeters});
   }).catch(error=>{if(!controller.signal.aborted)setResult({key,error:error instanceof Error?error.message:"Chưa tính được quãng đường."});});
  return()=>controller.abort();
 },[key,active,hasGps,trip.trip_id,now]);
 if(!active)return null;
 const current=result?.key===key?result:null,stale=gpsIsStale(trip,now);
 return <small className={styles.remainingDistance} data-stale={stale}
  title={current?.error??"Quãng đường ô tô ước tính đến hub; có thể khác tuyến xe tải thực tế."}>
  {!hasGps?"Chưa đủ GPS để tính km":current?.distance!==undefined?<>Còn <strong>{km.format(current.distance/1000)} km</strong> đến hub{stale?" · GPS cũ":""}</>:current?.error?"Chưa tính được km":"Đang tính km…"}
 </small>;
}
