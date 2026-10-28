"use client";
import { useId, useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown, ChevronRight, Download, Search, UsersRound } from "lucide-react";
import { PickupOrderDialog } from "./pickup-order-dialog";
import type { PickupOrderScope } from "@/lib/pickup/inventory-orders";
import type { CotFilter } from "./pickup-inventory-model";
import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import "./pickup-rider-inventory.css";

import { inventoryRiders, type RiderInventoryRow } from "@/lib/pickup/inventory-riders";
export function PickupRiderInventory({ area,cot,status,rows,loading,error }: {area:string;cot:CotFilter;status:string;rows:RiderInventoryRow[];loading:boolean;error:string|null}) {
  const [orderScope,setOrderScope]=useState<PickupOrderScope|null>(null);
  const [query,setQuery]=useState("");
  const [closed,setClosed]=useState<Record<string,boolean>>({});
  const boardId=useId();
  const riders=useMemo(()=>inventoryRiders(rows,area,cot,query),[rows,area,cot,query]);
  const groups=useMemo(()=>OPERATING_AREAS.filter(a=>area==='all'||a===area).map(a=>({area:a,riders:inventoryRiders(rows,a,cot,query)})).filter(g=>g.riders.length),[rows,area,cot,query]);
  const allOpen=groups.every(g=>!closed[g.area]);
  const metric=(value:number)=>loading||error?'—':value.toLocaleString('vi-VN');
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
  return <section className="pickup-rider-workbench" aria-label="Tồn pickup theo rider">
    <header className="pickup-rider-heading"><div><span className="pickup-rider-eyebrow">ĐIỀU PHỐI PICKUP</span><h2>Tồn theo rider</h2><p>Nhóm theo khu vực · Rider nhiều tồn xếp trước · {status}</p></div>
      <button type="button" className="pickup-rider-export" disabled={loading||!!error||!riders.length} onClick={exportImage}><Download size={16} aria-hidden="true"/>Chụp ảnh rider</button>
    </header>
    <dl className="pickup-rider-metrics">
      <div><dt>Rider còn tồn</dt><dd>{metric(riders.length)}</dd><small>Theo bộ lọc đang chọn</small></div>
      <div><dt>Rider COT 1</dt><dd>{metric(riders.filter(r=>r.cot==='COT1').length)}</dd><small>COT phụ trách</small></div>
      <div><dt>Rider COT 2</dt><dd>{metric(riders.filter(r=>r.cot==='COT2').length)}</dd><small>COT phụ trách</small></div>
      <div><dt>Khu vực có tồn</dt><dd>{metric(groups.length)}</dd><small>{area==='all'?'Phạm vi KV1–KV5':area}</small></div>
    </dl>
    <div className="pickup-rider-toolbar"><label className="pickup-rider-search"><Search size={17} aria-hidden="true"/><input aria-label="Tìm rider" placeholder="Tìm tên, ID rider hoặc mã zone…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <span>{loading?'Đang cập nhật…':`${riders.length} rider khớp lọc`}</span>
      <button type="button" disabled={loading||!!error||!groups.length} onClick={()=>setClosed(Object.fromEntries(groups.map(g=>[g.area,allOpen])))}>{allOpen?'Thu tất cả':'Mở tất cả'}</button>
    </div>
    <p className="pickup-rider-note">Lọc theo COT phụ trách; số tồn gồm cả đơn từ COT trước. Rider có đơn ở nhiều KV xuất hiện trong từng nhóm. Một đơn gán nhiều rider được tính cho từng người, vì vậy không cộng các dòng để ra số đơn duy nhất.</p>
    {loading?<p className="pickup-rider-empty" role="status">Đang tải tồn rider…</p>:error?<p role="alert" className="pickup-rider-error">{error}</p>:!groups.length?<div className="pickup-rider-empty"><UsersRound size={28} aria-hidden="true"/><h3>Không có rider phù hợp</h3><p>Thử tìm tên khác hoặc mở rộng bộ lọc khu vực/COT.</p></div>:<div className="delivery-area-groups">
      {groups.map(group=>{
        const id=`${boardId}-${group.area}`,open=!closed[group.area];
        const openOrders=(r:typeof riders[number])=>setOrderScope({area:group.area,status,cot:'all',rider:r.id,riderCot:r.cot,title:`${r.name} · ${group.area}`});
        return <section key={group.area} data-area={group.area} className="delivery-area-group pickup-rider-group" aria-label={`Rider ${group.area}`}>
          <header className="delivery-area-group-header"><button type="button" aria-expanded={open} aria-controls={id} onClick={()=>setClosed(current=>({...current,[group.area]:open}))}>{open?<ChevronDown size={17} aria-hidden="true"/>:<ChevronRight size={17} aria-hidden="true"/>}<span className="delivery-group-identity"><strong>{group.area}</strong><small>{group.riders.length} rider còn tồn</small></span></button>
            <span className="pickup-rider-group-caption">COT phụ trách · Sắp xếp tồn giảm dần</span>
          </header>
          <div id={id} hidden={!open} className="pickup-rider-table-scroll" role="region" aria-label={`Danh sách rider ${group.area}`} tabIndex={0}>
            <table className="pickup-rider-table"><thead><tr><th scope="col">Rider</th><th scope="col">COT phụ trách</th><th scope="col">Zone phụ trách</th><th scope="col">Tồn tại {group.area}</th></tr></thead>
              <tbody>{group.riders.map((r,index)=><tr key={`${r.id}:${r.cot}`}>
                <th scope="row"><div className="pickup-rider-identity"><span className="pickup-rider-rank">{String(index+1).padStart(2,'0')}</span><div><button type="button" onClick={()=>openOrders(r)} aria-label={`Xem đơn ${r.name}, ${group.area}`} className="pickup-rider-name">{r.name}</button><small>ID {r.id}</small></div></div></th>
                <td><span className="pickup-rider-cot" data-cot={r.cot}>{r.cot==='UNKNOWN'?'Chưa rõ COT':r.cot.replace('COT','COT ')}</span></td>
                <td><div className="pickup-rider-zones">{[...r.zones].map(zone=><span key={zone}>{zone}</span>)}</div></td>
                <td><button type="button" className="pickup-rider-stock" data-high={r.visible>=36} onClick={()=>openOrders(r)} aria-label={`Xem ${r.visible} đơn ${r.name}, ${group.area}`}><strong>{r.visible.toLocaleString('vi-VN')}</strong><span>đơn</span><ArrowUpRight size={15} aria-hidden="true"/></button></td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>;
      })}
    </div>}
    {orderScope&&<PickupOrderDialog scope={orderScope} onClose={()=>setOrderScope(null)}/>}
  </section>;
}
