"use client";
import { useEffect, useState } from "react";
import { DashboardHiring } from "@/components/dashboard/dashboard-hiring";
import type { RiderHiring } from "@/lib/dashboard/rider-hiring";

export function RiderHiringSection({refreshKey}:{refreshKey:number}) {
  const [source,setSource] = useState<{data:RiderHiring|null;error:string|null}>({data:null,error:null});
  useEffect(()=>{
    const controller=new AbortController();
    let inFlight=false;
    async function load(force=false) {
      if(inFlight)return;
      inFlight=true;
      try {
        const response=await fetch("/api/riders/hiring",{cache:"no-store",headers:force?{"x-dashboard-refresh":"1"}:undefined,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});
        const payload=await response.json();
        if(controller.signal.aborted)return;
        if(!response.ok)throw Error(payload.error||"Không tải được ngày nhận việc");
        setSource({data:payload,error:null});
      } catch(e) {
        if(!controller.signal.aborted)setSource(previous=>({...previous,error:e instanceof Error?e.message:"Không tải được ngày nhận việc"}));
      } finally {inFlight=false;}
    }
    void load(refreshKey>0);
    const timer=setInterval(()=>{if(!document.hidden)void load();},60000);
    return ()=>{controller.abort();clearInterval(timer);};
  },[refreshKey]);
  return <div className="my-5"><DashboardHiring source={source}/></div>;
}
