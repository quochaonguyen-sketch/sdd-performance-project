"use client";
import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { LinehaulTrip } from "@/lib/linehaul/model";
import { gpsIsStale } from "@/lib/linehaul/model";

export default function LinehaulMap({trip,now}:{trip:LinehaulTrip;now:number}){
 const vehicle=trip.lat!==null&&trip.lng!==null?[trip.lat,trip.lng] as [number,number]:null;
 const hub=trip.hub_lat!==null&&trip.hub_lng!==null?[trip.hub_lat,trip.hub_lng] as [number,number]:null;
 if(!vehicle&&!hub)return <div style={{padding:32,textAlign:"center"}}>SPX chưa cung cấp tọa độ cho chuyến này.</div>;
 return <MapContainer center={vehicle??hub!} zoom={12} style={{height:"100%",width:"100%"}} scrollWheelZoom={false}>
  <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
  <Fit trip={trip}/>
  {hub?<CircleMarker center={hub} radius={8} pathOptions={{color:"#1e344d",fillColor:"#315e91",fillOpacity:1}}><Tooltip>Hub 52-HCM SDD-01</Tooltip></CircleMarker>:null}
  {vehicle?<CircleMarker center={vehicle} radius={10} pathOptions={{color:"white",weight:3,fillColor:gpsIsStale(trip,now)?"#7c8799":"#0f8b70",fillOpacity:1}}><Tooltip permanent>{trip.plate_number||trip.lt_code}{gpsIsStale(trip,now)?" · GPS cũ":" · Xe"}</Tooltip></CircleMarker>:null}
 </MapContainer>;
}
function Fit({trip}:{trip:LinehaulTrip}){
 const map=useMap();
 useEffect(()=>{
  const points:[number,number][]=[];
  if(trip.lat!==null&&trip.lng!==null)points.push([trip.lat,trip.lng]);
  if(trip.hub_lat!==null&&trip.hub_lng!==null)points.push([trip.hub_lat,trip.hub_lng]);
  if(points.length===2)map.fitBounds(points,{padding:[40,40],maxZoom:14});else if(points[0])map.setView(points[0],13);
  map.invalidateSize();
 },[map,trip]);
 return null;
}
