"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowUpRight, PackageCheck, Truck } from "lucide-react";
import type { DashboardVolumeData } from "@/lib/dashboard/volume-overview";
import { OPERATING_AREAS } from "@/lib/locations/operating-areas";
import { SpotlightSheen } from "./dashboard-spotlight";
import s from "./dashboard-volume.module.css";

const fmt = (n: number | null | undefined) => n == null ? "—" : n.toLocaleString("vi-VN");
const dateLabel = (day: string) => `${day.slice(8,10)}/${day.slice(5,7)}`;

export function DashboardVolume({ source, loading, children }: { source?: { data: DashboardVolumeData | null; error: string | null }; loading: boolean; children: ReactNode }) {
  const [days,setDays]=useState(7);
  const data=source?.data, delivery=data?.delivery.data?.latest, pickup=data?.pickup.data?.latest;
  const sameDate=!!delivery && !!pickup && delivery.date===pickup.date;
  const total=sameDate ? delivery.total+pickup.total : null;
  const deliveryShare=total && delivery ? delivery.total/total*100 : null;
  const points=(data?.delivery.data?.daily ?? data?.pickup.data?.daily ?? []).slice(-days).map(row=>({date:row.date,delivery:data?.delivery.data?.daily.find(r=>r.date===row.date)?.total ?? null,pickup:data?.pickup.data?.daily.find(r=>r.date===row.date)?.total ?? null}));
  const chartReady = points.some(row => row.delivery !== null || row.pickup !== null);
  const highest = Math.max(1, ...points.flatMap(row => [row.delivery ?? 0, row.pickup ?? 0]));
  const tickUnit = Math.max(1, 10 ** Math.floor(Math.log10(highest / 4)) / 2);
  const step = Math.ceil(highest / (4 * tickUnit)) * tickUnit;
  const chartMax = step * 4;
  return <div className={s.volume}>
    <div className={s.cards}>
      <article className={s.total} data-dashboard-spotlight="volume-total" data-spotlight-value={String(total)}>
        <span>Tổng sản lượng giao nhận</span><strong>{fmt(total)}</strong><small>{sameDate ? `${dateLabel(delivery.date)} · ${delivery.date===data?.today ? "Hôm nay" : "Ngày có dữ liệu gần nhất của hai nguồn"}` : "Tổng chỉ hiển thị khi hai nguồn cùng ngày"}</small>
        <div className={s.share} aria-label={deliveryShare==null?"Chưa có tỷ trọng cùng ngày":`Delivery ${Math.round(deliveryShare)}%, Pickup ${Math.round(100-deliveryShare)}%`}><i style={{width:`${deliveryShare??0}%`}}/><b style={{width:`${deliveryShare==null?0:100-deliveryShare}%`}}/></div>
        <p>{deliveryShare==null?"Chưa có tỷ trọng":"Delivery "+deliveryShare.toFixed(1)+"% · Pickup "+(100-deliveryShare).toFixed(1)+"%"}</p><SpotlightSheen/>
      </article>
      {([{key:"delivery",label:"Delivery Volume",value:delivery,href:"/volume/delivery",icon:Truck},{key:"pickup",label:"Pickup Volume",value:pickup,href:"/volume/pickup",icon:PackageCheck}] as const).map(item=><Link key={item.key} href={item.href} className={s.source} data-series={item.key} data-dashboard-spotlight={`volume-${item.key}`} data-spotlight-value={String(item.value?.total)}><div><span>{item.label}</span><item.icon size={18}/></div><strong>{fmt(item.value?.total)}</strong><small>{item.value ? `${dateLabel(item.value.date)} · ${item.value.date===data?.today?"Hôm nay":"Dữ liệu gần nhất"}` : loading?"Đang tải sản lượng…":"Chưa có dữ liệu sản lượng"}</small><span className={s.open}>Xem chi tiết<ArrowUpRight size={13}/></span><SpotlightSheen/></Link>)}
    </div>
    {(source?.error || data?.delivery.error || data?.pickup.error) && <p className={s.warning} role="status">Chưa tải đủ dữ liệu Volume. Bạn có thể bấm Làm mới để thử lại.</p>}
    <div className={s.analysis}>
      <section className={`${s.panel} ${s.trendPanel}`} aria-label="Xu hướng sản lượng Delivery và Pickup">
        <div className={s.heading}><div><h3>Xu hướng sản lượng</h3><p>Đơn/ngày · KV1–KV5</p></div><div className={s.toggle} role="group" aria-label="Số ngày xem sản lượng">{[7,14].map(n=><button key={n} type="button" aria-pressed={days===n} onClick={()=>setDays(n)}>{n} ngày</button>)}</div></div>
        {chartReady ? <>
          <div className={s.legend}><span><i aria-hidden="true" />Delivery</span><span><i aria-hidden="true" />Pickup</span></div>
          <div className={s.chart} role="region" aria-label="Biểu đồ sản lượng theo ngày" tabIndex={0} style={{ gridTemplateColumns: `52px repeat(${points.length},minmax(52px,1fr))` }}>
            <div className={s.axis} aria-hidden="true">{[4, 3, 2, 1, 0].map(tick => <span key={tick}>{fmt(step * tick)}</span>)}</div>
            {points.map(row => <div key={row.date} className={s.day}>
              <div className={s.values}>
                <span><span className="sr-only">Delivery </span>{fmt(row.delivery)}</span>
                <span><span className="sr-only">Pickup </span>{fmt(row.pickup)}</span>
              </div>
              <div className={s.bars} aria-hidden="true"><i style={{ height: `${(row.delivery ?? 0) / chartMax * 100}%` }} /><b style={{ height: `${(row.pickup ?? 0) / chartMax * 100}%` }} /></div>
              <time dateTime={row.date}>{dateLabel(row.date)}</time>
            </div>)}
          </div>
          <p className={s.caption}>“—” là chưa có số liệu.<span className={s.scrollHint}> Cuộn ngang để xem đủ ngày.</span></p>
        </> : <p className={s.empty} role="status">{loading ? "Đang tải xu hướng…" : "Chưa có dữ liệu trong khoảng ngày này."}</p>}
      </section>
      {children}
      <section className={`${s.panel} ${s.areaPanel}`} aria-label="Sản lượng theo khu vực">
        <div className={s.heading}><div><h3>Volume theo khu vực</h3><p>Ngày gần nhất của từng nguồn</p></div></div>
        <table className={s.table}>
          <thead><tr><th scope="col">Khu vực</th><th scope="col">Delivery<small>{delivery ? dateLabel(delivery.date) : "—"}</small></th><th scope="col">Pickup<small>{pickup ? dateLabel(pickup.date) : "—"}</small></th></tr></thead>
          <tbody>{OPERATING_AREAS.map(area => <tr key={area}>
            <th scope="row"><span className={s.areaCode}>{area}</span></th>
            <td>{fmt(delivery?.areas.find(row => row.area === area)?.orders)}</td><td>{fmt(pickup?.areas.find(row => row.area === area)?.orders)}</td>
          </tr>)}</tbody>
          <tfoot><tr><th scope="row">Tổng</th><td>{fmt(delivery?.total)}</td><td>{fmt(pickup?.total)}</td></tr></tfoot>
        </table>
      </section>
    </div>
  </div>;
}
