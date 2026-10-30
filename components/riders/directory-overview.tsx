"use client";

import { ArrowDownRight, ArrowUpRight, MapPin, Users, Route, CircleHelp } from "lucide-react";
import type { DirectoryAnalysis } from "@/lib/riders/directory-analysis";
import s from "./rider-directory.module.css";

const number = (value: number) => value.toLocaleString("vi-VN");
const percent = (value: number, total: number) => total ? `${(value / total * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%` : "0%";

export function DirectoryOverview({ analysis, selected, onArea, onDistrict }: {
  analysis: DirectoryAnalysis; selected: string; onArea: (area: string) => void; onDistrict: (area: string, district: string) => void;
}) {
  const total = analysis.reduce((sum, area) => sum + area.total, 0);
  const scope = selected === "all" ? analysis : analysis.filter(area => area.area === selected);
  const scopeTotal = scope.reduce((sum, area) => sum + area.total, 0);
  const unassigned = scope.reduce((sum, area) => sum + area.unassigned, 0);
  const cots = scope.reduce((sum, area) => ({ cot1: sum.cot1 + area.cots.cot1, cot2: sum.cot2 + area.cots.cot2, other: sum.other + area.cots.other }), { cot1: 0, cot2: 0, other: 0 });
  const districts = scope.flatMap(area => area.districts.filter(district => district.name !== "Chưa có quận giao").map(district => ({ ...district, area: area.area }))).sort((a, b) => b.total - a.total).slice(0, 5);
  const maxDistrict = Math.max(1, ...districts.map(district => district.total));
  return <section className={s.overview} aria-label="Phân bố rider theo khu vực">
    <div className={s.sectionHeading}><div><p>ĐỘI NGŨ THEO ĐỊA BÀN</p><h2>Rider đang ở khu vực nào?</h2></div><span>Toàn bộ danh bạ KV1–KV5 · Bấm khu vực để lọc danh sách</span></div>
    <div className={s.areas}>
      {analysis.map((area, index) => <button key={area.area} type="button" className={s.area} data-area={index + 1} aria-pressed={selected === area.area} onClick={() => onArea(selected === area.area ? "all" : area.area)}>
        <div className={s.areaTop}><span><MapPin size={14} aria-hidden="true"/>Khu vực {index + 1}</span><ArrowUpRight size={16} aria-hidden="true"/></div>
        <div className={s.areaNumber}><strong>{number(area.total)}</strong><span>rider</span><small>{percent(area.total, total)} đội ngũ</small></div>
        <div className={s.areaTrack} aria-hidden="true"><i style={{ width: percent(area.active, area.total) }}/></div>
        <div className={s.areaFooter}><span><i/>{number(area.active)} hoạt động</span><span>{number(area.inactive)} ngừng</span></div>
      </button>)}
    </div>
    <div className={s.analysisGrid}>
      <article className={s.panel}>
        <div className={s.panelHeading}><div><span><Route size={16} aria-hidden="true"/>PHÂN BỐ ĐỊA BÀN</span><h3>Quận giao có nhiều rider</h3></div><small>{selected === "all" ? "Tất cả khu vực" : selected} · Top 5</small></div>
        {!districts.length ? <p className={s.empty}>Chưa có thông tin quận giao trong phạm vi này.</p> : <div className={s.districts}>{districts.map(district => <button type="button" key={`${district.area}:${district.name}`} onClick={() => onDistrict(district.area, district.name)} aria-label={`Xem ${district.total} rider ${district.area}, ${district.name}`}>
          <span className={s.districtName}>{district.name}<small>{district.area} · {number(district.active)} hoạt động</small></span><span className={s.districtTrack} aria-hidden="true"><i style={{ width: percent(district.total, maxDistrict) }}/></span><strong>{number(district.total)}<ArrowUpRight size={13} aria-hidden="true"/></strong>
        </button>)}</div>}
      </article>
      <article className={s.panel}>
        <div className={s.panelHeading}><div><span><Users size={16} aria-hidden="true"/>CƠ CẤU ĐỘI NGŨ</span><h3>Phân nhóm COT</h3></div><small>{number(scopeTotal)} rider · {selected === "all" ? "KV1–KV5" : selected}</small></div>
        <div className={s.cots}>{[["COT 1", cots.cot1], ["COT 2", cots.cot2], ["Khác / chưa có COT", cots.other]].map(([label, count], index) => <div key={label} data-cot={index}><span>{label}</span><div aria-hidden="true"><i style={{ width: percent(Number(count), scopeTotal) }}/></div><strong>{number(Number(count))}<small>{percent(Number(count), scopeTotal)}</small></strong></div>)}</div>
        <p className={s.note}>COT 1 gồm COT 1.1 và 1.2. Thống kê danh bạ; trạng thái hoạt động không xác nhận rider đang đi làm hôm nay.</p>
        <div className={s.coverage}><CircleHelp size={17} aria-hidden="true"/><span><strong>{number(unassigned)} rider chưa có địa bàn giao</strong><small>Chưa có cả zone và quận giao · cần bổ sung hồ sơ</small></span><ArrowDownRight size={18} aria-hidden="true"/></div>
      </article>
    </div>
  </section>;
}
