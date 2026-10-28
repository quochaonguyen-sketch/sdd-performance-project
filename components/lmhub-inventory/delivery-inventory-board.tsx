"use client";

import { useId, useState, type CSSProperties } from "react";
import { ArrowUpRight, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";
import { addCounts, deliveryDistrictLabel, emptyCounts, heatClass, sameFocus, visibleCount, visibleTotal, type CotFilter, type DistrictAgg, type InventoryFocus } from "./lmhub-inventory-model";

export function DeliveryInventoryBoard({ districts, cot, selected, onSelect, forceExpanded = false, kind="Delivery" }: {
  kind?:"Delivery"|"Pickup";
  districts: DistrictAgg[]; cot: CotFilter; selected: InventoryFocus | null;
  onSelect: (focus: InventoryFocus) => void; forceExpanded?: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [closedAreas, setClosedAreas] = useState<Record<string, boolean>>({});
  const boardId = useId();
  const total = districts.reduce((sum, district) => addCounts(sum, district.totals), emptyCounts());
  const groups = Array.from(new Set(districts.map(district => district.area))).sort((a,b)=>a.localeCompare(b,"vi",{numeric:true})).map(area=>{
    const items = districts.filter(district => district.area === area);
    return {area, districts:items, totals:items.reduce((sum,district)=>addCounts(sum,district.totals),emptyCounts()), wards:items.reduce((sum,district)=>sum+district.wards.length,0)};
  });
  const allOpen = forceExpanded || (districts.length > 0 && groups.every(group=>!closedAreas[group.area]) && districts.every((district) => collapsed[`${district.area}:${district.district}`] === false));

  return <section aria-label={`Tồn ${kind} trong phạm vi đã chọn`} className="space-y-3">
    <header className="delivery-board-heading flex flex-wrap items-center justify-between gap-3 text-xs">
      <div><h2 className="text-sm font-bold text-slate-900">Tồn theo khu vực và địa bàn</h2><p className="mt-1 text-xs text-slate-500">{groups.length} khu vực · {districts.length} địa bàn quận/huyện · <span className="tabular-nums">{visibleTotal(total, cot).toLocaleString("vi-VN")}</span> đơn · Mở khu vực → quận/huyện → phường.</p></div>
      <button type="button" disabled={forceExpanded || !districts.length} onClick={() => {setClosedAreas(Object.fromEntries(groups.map(group=>[group.area,allOpen])));setCollapsed(Object.fromEntries(districts.map((district) => [`${district.area}:${district.district}`, allOpen])));}} className="min-h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">{allOpen ? "Thu tất cả" : "Mở tất cả"}</button>
    </header>
    {!districts.length ? <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center"><p className="text-sm font-semibold text-slate-700">Không có tồn phù hợp</p><p className="mt-1 text-xs text-slate-500">Thử mở rộng địa bàn, đổi COT hoặc đặt lại bộ lọc.</p></div> : null}
    <div className="delivery-area-groups">
      {groups.map(group=>{
        const areaOpen = forceExpanded || !closedAreas[group.area];
        const areaId = `${boardId}-${group.area}`;
        return <section key={group.area} data-area={group.area} className="delivery-area-group" aria-label={`Tồn ${group.area}`}>
          <header className="delivery-area-group-header">
            <button type="button" aria-expanded={areaOpen} aria-controls={areaId} disabled={forceExpanded} onClick={()=>setClosedAreas(current=>({...current,[group.area]:areaOpen}))}>
              {areaOpen?<ChevronDown size={17} aria-hidden="true"/>:<ChevronRight size={17} aria-hidden="true"/>}
              <span className="delivery-group-identity"><strong>{group.area}</strong><small>{group.districts.length} quận/huyện · {group.wards} phường</small></span>
            </button>
            <dl className="delivery-area-group-totals">
              <div><dt>COT 1</dt><dd>{visibleCount(group.totals,"cot1",cot).toLocaleString("vi-VN")}</dd></div>
              <div><dt>COT 2</dt><dd>{visibleCount(group.totals,"cot2",cot).toLocaleString("vi-VN")}</dd></div>
              <div className="delivery-area-group-total"><dt>Tổng tồn</dt><dd>{visibleTotal(group.totals,cot).toLocaleString("vi-VN")} <small>đơn</small></dd></div>
            </dl>
          </header>
          <div id={areaId} hidden={!areaOpen} className="delivery-area-group-body">
          <div className={cn("grid items-start gap-3", group.districts.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2")}>
      {group.districts.map((district) => {
        const districtName=kind==='Pickup'?district.district:deliveryDistrictLabel(district.district);
        const label = `${district.area} · ${districtName}`;
        const open = forceExpanded || collapsed[`${district.area}:${district.district}`] === false;
        const focus: InventoryFocus = { area: district.area, district: district.district, ward: null };
        return <article key={`${district.area}:${district.district}`} data-area={district.area} className="delivery-district-card min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <header className="delivery-district-header flex items-center gap-1 border-b px-3 py-2">
            <button type="button" aria-expanded={open} aria-label={`${open ? "Thu gọn" : "Mở"} ${label}`} disabled={forceExpanded} onClick={() => setCollapsed((current) => ({ ...current, [`${district.area}:${district.district}`]: open }))} className="flex min-h-7 min-w-0 flex-1 items-center gap-1 text-left text-xs font-bold text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-600">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<span className="delivery-district-title"><strong>{districtName}</strong><small>{district.wards.length} phường</small></span></button>
            <button type="button" aria-label={`Xem đơn ${label}`} disabled={!visibleTotal(district.totals, cot)} onClick={() => onSelect(focus)} className="flex min-h-7 items-center gap-1 rounded px-1 text-xs font-bold tabular-nums text-blue-800 hover:bg-blue-100 disabled:opacity-40"><span>{visibleTotal(district.totals, cot).toLocaleString("vi-VN")}</span><ArrowUpRight size={13} /></button>
          </header>
          {open ? <div className="delivery-district-scroll" style={{"--delivery-rendered-wards":Math.max(1,district.wards.length)} as CSSProperties} role="region" aria-label={`Danh sách phường ${label}`} tabIndex={0}>
            <table className="w-full table-fixed text-left text-[12px] leading-4">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] text-slate-500"><tr><th scope="col" className="px-2 py-1.5 font-medium">Phường</th><th scope="col" className="w-10 px-1 py-1.5 text-right font-medium">COT 1</th><th scope="col" className="w-10 px-1 py-1.5 text-right font-medium">COT 2</th><th scope="col" className="w-12 px-1.5 py-1.5 text-right font-semibold">Tổng</th></tr></thead>
              <tbody>
                {!district.wards.length ? <tr><td colSpan={4} className="px-3 py-4 text-[11px] leading-4 text-slate-500">{district.district === "Thủ Đức" ? "Chưa có dữ liệu thuộc 12 phường Thủ Đức cũ." : "Chưa có đơn khớp bộ lọc."}</td></tr> : null}
                {district.wards.map((ward) => {
                  const wardFocus: InventoryFocus = { area: ward.area, district: ward.district, ward: ward.ward };
                  return <tr key={ward.ward} data-selected={sameFocus(selected, wardFocus)} className="delivery-ward-row border-t border-slate-100">
                    <th scope="row" className="px-2 py-0.5 font-normal"><button type="button" title={ward.ward} aria-label={`Xem đơn ${ward.ward}, ${label}`} onClick={() => onSelect(wardFocus)} className="min-h-7 w-full text-left leading-4 text-slate-700 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">{ward.ward.replace(/^Phường\s+/i, "")}</button></th>
                    <NumberCell value={visibleCount(ward, "cot1", cot)} /><NumberCell value={visibleCount(ward, "cot2", cot)} />
                    <NumberCell value={visibleTotal(ward, cot)} heat onClick={() => onSelect(wardFocus)} label={`Xem ${visibleTotal(ward, cot)} đơn ${ward.ward}, ${label}`} />
                  </tr>;
                })}
                {district.wards.length < 8 ? <tr className="delivery-ward-spacer" aria-hidden="true"><td colSpan={4}/></tr> : null}
              </tbody>
              <tfoot className="sticky bottom-0 border-t border-slate-200 bg-slate-50"><tr><th scope="row" className="px-2 py-1.5 text-[11px] font-semibold text-slate-700">{district.wards.length} phường</th><NumberCell value={visibleCount(district.totals, "cot1", cot)} strong /><NumberCell value={visibleCount(district.totals, "cot2", cot)} strong /><NumberCell value={visibleTotal(district.totals, cot)} strong heat /></tr></tfoot>
            </table>
          </div> : null}
        </article>;
      })}
          </div></div>
        </section>;
      })}
    </div>
  </section>;
}

function NumberCell({ value, strong, heat, onClick, label }: { value: number; strong?: boolean; heat?: boolean; onClick?: () => void; label?: string }) {
  const style = cn("inline-block min-w-6 rounded px-1 py-0.5", heat && heatClass(value), !value && "text-slate-400");
  return <td className={cn("px-1 py-0.5 text-right tabular-nums", strong ? "font-semibold text-slate-900" : "text-slate-600")}>{onClick ? <button type="button" onClick={onClick} aria-label={label} className={cn(style, "min-h-7 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600")}>{value.toLocaleString("vi-VN")}</button> : <span className={style}>{value.toLocaleString("vi-VN")}</span>}</td>;
}
