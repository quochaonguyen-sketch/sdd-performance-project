"use client";

import { ArrowUpRight, UserRoundPlus } from "lucide-react";
import type { RiderHiring } from "@/lib/dashboard/rider-hiring";
import { RIDER_PLAN_ID } from "@/lib/google/rider-plan";
import s from "./dashboard-hiring.module.css";

const dateLabel = (date:string) => date.split("-").reverse().join("/");
const monthLabel = (date:string) => `${date.slice(5,7)}/${date.slice(0,4)}`;
export function DashboardHiring({ source }: { source?: {data:RiderHiring|null;error:string|null} }) {
  const data = source?.data;
  const ready = !!data?.validDates;
  const max = Math.max(1,...(data?.areas.flatMap(a=>[a.current,a.previous]) ?? []));
  const delta = data ? data.current-data.previous : 0;
  return <section id="hiring-overview" className={s.panel} aria-label="Rider nhận việc mới">
    <header className={s.header}><div><p className={s.eyebrow}><UserRoundPlus size={15} aria-hidden="true"/> WORKFORCE · TUYỂN MỚI</p><h2>Rider nhận việc mới</h2><p>{data ? `${dateLabel(data.currentStart)} – ${dateLabel(data.today)} · Đối chiếu cùng kỳ tháng trước` : "Theo ngày nhận việc trong Sheet1"}</p></div><a href={`https://docs.google.com/spreadsheets/d/${RIDER_PLAN_ID}/edit#gid=0`} target="_blank" rel="noreferrer">Nguồn Sheet1 <ArrowUpRight size={14} aria-hidden="true"/></a></header>
    {source?.error && <p className={s.error} role="status">{source.error}{data ? " · Đang giữ dữ liệu đã tải." : ""}</p>}
    {!data ? <p className={s.empty}>{source?.error ? "Chưa có dữ liệu nhận việc để đối chiếu." : "Đang đọc ngày nhận việc…"}</p> : <>
      <div className={s.body}>
        <div className={s.summary}><span>THÁNG {monthLabel(data.today)}</span><div className={s.total}><strong>{ready ? data.current.toLocaleString("vi-VN") : "—"}</strong><span>rider mới</span></div><p>Từ đầu tháng đến {dateLabel(data.today)}</p><div className={s.change}>{ready ? `${delta>0?"+":""}${delta} người so với cùng kỳ` : "Chưa có ngày nhận việc hợp lệ"}<small>{ready && data.previous>0 ? `${delta>0?"+":""}${(delta/data.previous*100).toLocaleString("vi-VN",{maximumFractionDigits:1})}% so với tháng trước` : ready ? "Cùng kỳ trước: 0 người · Chưa tính %" : "Kiểm tra cột Ngày nhận việc trên nguồn"}</small></div><dl><div><dt>Cùng kỳ {monthLabel(data.previousStart)}</dt><dd>{ready ? data.previous.toLocaleString("vi-VN") : "—"}</dd></div><div><dt>Khu vực có tuyển mới</dt><dd>{ready ? `${data.areas.filter(a=>a.current>0).length}/5` : "—"}</dd></div></dl></div>
        <div className={s.chart}><div className={s.chartHeading}><h3>Đối chiếu theo khu vực</h3><span>Cùng thang đo · Người</span></div><div className={s.legend}><span><i/>Tháng {monthLabel(data.today)}</span><span><i/>Cùng kỳ {monthLabel(data.previousStart)}</span></div>
          <table className={s.table}><caption>Số rider nhận việc theo KV, tháng này và cùng kỳ tháng trước</caption><thead><tr><th scope="col">Khu vực</th><th scope="col">Tháng {monthLabel(data.today)}</th><th scope="col">Cùng kỳ {monthLabel(data.previousStart)}</th><th scope="col">Chênh lệch</th></tr></thead><tbody>{data.areas.map(area=><tr key={area.area}><th scope="row">{area.area}</th><td><div className={s.bar} aria-hidden="true"><i style={{width:ready?`${area.current/max*100}%`:0}}/></div><span>{ready?area.current:"—"}</span></td><td><div className={s.bar} data-previous="true" aria-hidden="true"><i style={{width:ready?`${area.previous/max*100}%`:0}}/></div><span>{ready?area.previous:"—"}</span></td><td>{ready?`${area.current>area.previous?"+":""}${area.current-area.previous}`:"—"}</td></tr>)}</tbody></table>
          <p className={s.range}>Kỳ trước: {dateLabel(data.previousStart)} – {dateLabel(data.previousEnd)}. Đếm Driver ID duy nhất trong Sheet hiện tại, theo KV đang được phân công.</p>
        </div>
      </div>
      <footer className={s.footer}><span>{data.validDates.toLocaleString("vi-VN")}/{data.validRiders.toLocaleString("vi-VN")} rider có ngày nhận việc hợp lệ · Cache 5 phút</span><details><summary>Phạm vi &amp; chất lượng dữ liệu</summary><p>Ngày nguồn theo MM/DD/YYYY. {data.missingDates} rider thiếu ngày; {data.invalidDates} ngày không hợp lệ; {data.futureDates} ngày tương lai chưa tính. Bỏ qua {data.skippedRows} dòng thiếu/sai thông tin hoặc trùng Driver ID theo quy tắc đồng bộ.</p><p>Số nhận việc dựa trên danh sách Sheet1 hiện tại, chưa gồm người đã bị xóa khỏi Sheet; không phải tổng lịch sử tuyển dụng đầy đủ. Không lọc theo trạng thái active.</p></details></footer>
    </>}
  </section>;
}
