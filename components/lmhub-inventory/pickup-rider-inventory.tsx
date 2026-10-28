"use client";
import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { PickupOrderDialog } from "./pickup-order-dialog";
import type { PickupOrderScope } from "@/lib/pickup/inventory-orders";
import { heatClass } from "./lmhub-inventory-model";
import type { CotFilter } from "./pickup-inventory-model";

import { inventoryRiders, type RiderInventoryRow } from "@/lib/pickup/inventory-riders";
export function PickupRiderInventory({ area,cot,status,rows,loading,error }: {area:string;cot:CotFilter;status:string;rows:RiderInventoryRow[];loading:boolean;error:string|null}) {
  const [orderScope,setOrderScope]=useState<PickupOrderScope|null>(null);
  const [query,setQuery]=useState("");
  const riders=useMemo(()=>inventoryRiders(rows,area,cot,query),[rows,area,cot,query]);
  function exportImage(){
    const pageSize=30;
    for(let start=0;start<riders.length;start+=pageSize){
      const page=riders.slice(start,start+pageSize),canvas=document.createElement("canvas");canvas.width=1040;canvas.height=125+page.length*39;const ctx=canvas.getContext("2d");if(!ctx)return;
      ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#173454";ctx.fillRect(0,0,1040,77);ctx.fillStyle="#fff";ctx.font="bold 22px Arial";ctx.fillText(`TỒN PICKUP THEO RIDER · ${area==="all"?"KV1–KV5":area} · ${cot.toUpperCase()}`,20,33);ctx.font="13px Arial";ctx.fillText(`${status} · ${new Date().toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}`,20,59);
      ctx.fillStyle="#64748b";ctx.font="bold 13px Arial";["RIDER","COT PHỤ TRÁCH","KHU VỰC","TỒN"].forEach((s,i)=>ctx.fillText(s,[20,540,740,940][i],102));
      page.forEach((r,i)=>{const y=130+i*39;ctx.fillStyle=i%2?"#f8fafc":"#fff";ctx.fillRect(0,y-17,1040,39);ctx.fillStyle="#0f172a";ctx.font="14px Arial";[r.name,r.cot,[...r.areas].join(", "),String(r.visible)].forEach((s,j)=>ctx.fillText(s,[20,540,740,940][j],y,j===0?500:180));});
      const a=document.createElement("a");a.href=canvas.toDataURL("image/png");a.download=`ton-rider-${area}-${start/pageSize+1}.png`;a.click();
    }
  }
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Tồn pickup theo rider">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h2 className="font-bold text-slate-900">Tồn theo tên rider</h2><p className="mt-1 text-xs text-slate-500">{riders.length} rider · {area==="all"?"KV1–KV5":area} · {status}. Lọc theo COT phụ trách của rider; gồm cả đơn từ COT trước. Đơn gán nhiều rider được tính ở từng người, nên không cộng các dòng rider để ra tổng đơn duy nhất.</p></div><div className="flex items-center gap-2"><label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-slate-400"><Search size={15}/><input aria-label="Tìm rider" placeholder="Tên rider, mã zone…" className="w-48 bg-transparent text-xs text-slate-700 outline-none" value={query} onChange={e=>setQuery(e.target.value)}/></label><button disabled={loading||!riders.length} onClick={exportImage} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"><Download size={15}/>Chụp ảnh rider</button></div></div>
    {loading?<p className="p-10 text-center text-sm text-slate-400">Đang tải tồn rider…</p>:error?<p role="alert" className="p-5 text-sm text-red-600">{error}</p>:<div className="max-h-[70vh] overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr>{["Tên rider","COT phụ trách","Khu vực","Mã zone","Tồn đang xem"].map(s=><th key={s} className="px-5 py-3 font-semibold">{s}</th>)}</tr></thead><tbody>{riders.map(r=><tr key={`${r.id}:${r.cot}`} className="border-t border-slate-100 hover:bg-blue-50/30"><td className="px-5 py-3 font-bold text-slate-800"><button onClick={()=>setOrderScope({area,status,cot:"all",rider:r.id,riderCot:r.cot,title:r.name})} className="text-left hover:text-blue-700 hover:underline" title="Xem mã đơn của rider">{r.name}</button><span className="mt-1 block text-[10px] font-normal text-slate-400">{r.id}</span></td><td className="px-5 py-3 font-semibold text-blue-700">{r.cot === "UNKNOWN" ? "Chưa rõ COT" : r.cot}</td><td className="px-5 py-3">{[...r.areas].join(", ")}</td><td className="max-w-80 px-5 py-3 text-slate-500">{[...r.zones].join(", ")}</td><td className="px-5 py-3"><button onClick={()=>setOrderScope({area,status,cot:"all",rider:r.id,riderCot:r.cot,title:r.name})} title="Xem mã đơn của rider" className={`rounded-md px-2 py-1 font-mono font-bold underline decoration-dotted underline-offset-4 hover:ring-2 hover:ring-blue-300 ${heatClass(r.visible)}`}>{r.visible.toLocaleString("vi-VN")}</button></td></tr>)}{!riders.length&&<tr><td colSpan={5} className="p-10 text-center text-slate-400">Không có rider phù hợp bộ lọc.</td></tr>}</tbody></table></div>}
    {orderScope&&<PickupOrderDialog scope={orderScope} onClose={()=>setOrderScope(null)}/>}
  </section>;
}
