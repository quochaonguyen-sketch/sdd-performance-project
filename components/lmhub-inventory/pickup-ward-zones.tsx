"use client";
import { useEffect, useState } from "react";
import type { CotFilter } from "./pickup-inventory-model";
type ZoneRow={zone:string;cot1:number;cot2:number;total:number};
export function PickupWardZones({area,ward,status,cot,snapshotAt}:{area:string;ward:string;status:string;cot:CotFilter;snapshotAt:string|null}) {
  const [rows,setRows]=useState<ZoneRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      setLoading(true);setError("");
      try {
        const params=new URLSearchParams({view:"zones",p_area:area,p_ward:ward,p_status:status});
        const res=await fetch(`/api/pickup-inventory?${params}`,{cache:"no-store",signal:controller.signal}),data=await res.json();
        if(!res.ok||!data.success)throw new Error(data.error??"Không tải được mã zone.");
        if(!controller.signal.aborted)setRows(data.rows??[]);
      }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Không tải được mã zone.");}
      finally{if(!controller.signal.aborted)setLoading(false);}
    },0);
    return()=>{clearTimeout(timer);controller.abort();};
  },[area,ward,status,snapshotAt,retry]);
  const visible=(z:ZoneRow)=>Number(cot==="cot1"?z.cot1:cot==="cot2"?z.cot2:z.total);
  return <div className="rounded-xl border border-blue-100 bg-white p-3" aria-label={`Mã zone ${ward}`}>
    <p className="mb-2 text-xs font-semibold text-blue-800">Mã zone trong {ward}</p>
    {loading?<p className="py-4 text-center text-xs text-slate-400">Đang tải mã zone…</p>:error?<p role="alert" className="py-3 text-xs text-red-600">{error} <button className="underline" onClick={()=>setRetry(n=>n+1)}>Thử lại</button></p>:<table className="w-full text-xs"><thead className="bg-blue-50/70 text-slate-500"><tr><th className="p-2 text-left">Mã zone</th><th className="p-2 text-right">COT 1</th><th className="p-2 text-right">COT 2</th><th className="p-2 text-right">Tồn đang xem</th></tr></thead><tbody>{rows.filter(z=>visible(z)>0).map(z=><tr key={z.zone} className="border-t border-slate-100"><td className="p-2 text-left font-semibold">{z.zone}</td><td className="p-2 text-right font-mono text-blue-700">{Number(z.cot1).toLocaleString("vi-VN")}</td><td className="p-2 text-right font-mono text-emerald-700">{Number(z.cot2).toLocaleString("vi-VN")}</td><td className="p-2 text-right font-mono font-bold">{visible(z).toLocaleString("vi-VN")}</td></tr>)}{!rows.some(z=>visible(z)>0)&&<tr><td colSpan={4} className="p-4 text-center text-slate-400">Không có zone còn tồn trong COT đang chọn.</td></tr>}</tbody></table>}
  </div>;
}
