import "server-only";
import type { LinehaulTrip } from "./model";
import { parseRoadRoute, roadRouteKey, validPoint, type RoadRoute } from "./road-route";

const cache=new Map<string,{until:number;promise:Promise<RoadRoute>}>();
let queue:Promise<unknown>=Promise.resolve(),lastRequest=0;

export async function getRoadRoute(trip:LinehaulTrip):Promise<RoadRoute>{
 if(!["waiting","en_route"].includes(trip.phase)||trip.hub_ata||trip.hub_atd)throw new Error("Chuyến này đã đến hoặc rời hub.");
 if(!validPoint(trip.lat,trip.lng)||!validPoint(trip.hub_lat,trip.hub_lng))throw new Error("SPX chưa cung cấp đủ tọa độ xe và hub.");
 const base=process.env.LINEHAUL_ROUTING_URL?.trim()||"https://router.project-osrm.org";
 const endpoint=new URL(base);
 if(!["https:","http:"].includes(endpoint.protocol)||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw new Error("Cấu hình định tuyến không hợp lệ.");
 const key=roadRouteKey(trip),cacheKey=base+key,cached=cache.get(cacheKey);
 if(cached&&cached.until>Date.now())return cached.promise;
 // shortcut: public OSRM uses a process-local cache/throttle; use a shared limiter or private service when scaling across servers.
 const promise=queue.catch(()=>{}).then(async()=>{
  const wait=1100-(Date.now()-lastRequest);
  if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
  lastRequest=Date.now();
  const url=`${base.replace(/\/$/,"")}/route/v1/driving/${trip.lng},${trip.lat};${trip.hub_lng},${trip.hub_lat}?overview=full&geometries=geojson&steps=false&alternatives=false&radiuses=1000;1000`;
  const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(12000),headers:{"User-Agent":"SDD-Operations-Linehaul/1.0"}});
  if(!response.ok)throw new Error("Dịch vụ định tuyến đang bận hoặc không tìm được đường. Thử lại sau.");
  return parseRoadRoute(await response.json(),key);
 });
 queue=promise;
 if(cache.size>=128)cache.delete(cache.keys().next().value!);
 cache.set(cacheKey,{until:Date.now()+5*60000,promise});
 promise.catch(()=>{if(cache.get(cacheKey)?.promise===promise)cache.delete(cacheKey);});
 return promise;
}
