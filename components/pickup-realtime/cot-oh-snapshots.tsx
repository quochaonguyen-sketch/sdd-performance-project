"use client";
import { useCallback, useState } from "react";
import { Clock3 } from "lucide-react";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { PICKUP_AREAS } from "@/lib/pickup/realtime";
import { formatDateTime } from "@/components/lmhub-inventory/lmhub-inventory-model";
import s from "./pickup-realtime.module.css";

type Rider = { id: string; name: string; area: string; onhold: number };
type Snapshot = { cot: string; cutoff_at: string; source_started_at: string; snapshot_at: string; riders: Rider[] };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const fmt = (n: number) => n.toLocaleString("vi-VN");

export function CotOhSnapshots({ area }: { area: string }) {
  const [day, setDay] = useState(today);
  const [clock, setClock] = useState(() => Date.now());
  const [result, setResult] = useState<{ day: string; snapshots: Snapshot[] } | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch(`/api/pickup-realtime/cot-snapshots?date=${day}`, { cache: "no-store", signal });
      const body = await response.json();
      if (!response.ok) throw Error(body.error ?? "Chưa tải được snapshot OH.");
      if (!signal.aborted) { setResult(body); setClock(Date.now()); setError(""); }
    } catch (e) { if (!signal.aborted) setError(e instanceof Error ? e.message : "Chưa tải được snapshot OH."); }
  }, [day]);
  useVisiblePolling(load);
  const current = result?.day === day ? result : null;
  return <section className={s.cotSection} aria-label="Snapshot OH theo COT">
    <div className={s.sectionHeading}><div><p>CHỐT OH HẰNG NGÀY</p><h2>OH tại giờ chốt COT</h2></div><label className={s.cotDate}>Ngày xem<input type="date" value={day} max={today()} onChange={e => { if (e.target.value) { setDay(e.target.value); setError(""); } }} /></label></div>
    <p className={s.cotHelp}>COT1 · 13:00 / COT2 · 17:00, giờ Việt Nam. Lưu phiên SPX hoàn chỉnh đầu tiên thu thập sau mốc chốt, tối đa 15 phút; giờ thu thập thực tế hiển thị bên dưới.</p>
    {error && <p role="alert" className={s.error}>{error}</p>}
    <div className={s.cotGrid}>{[["COT1", "13:00"], ["COT2", "17:00"]].map(([cot, hour]) => {
      const snapshot = current?.snapshots.find(row => row.cot === cot);
      const riders = snapshot?.riders.filter(r => area === "all" || r.area === area) ?? [];
      const after = clock >= Date.parse(`${day}T${hour}:00+07:00`);
      return <article key={cot} className={s.cotCard}>
        <header><span><Clock3 size={16} aria-hidden="true" />{cot} · {hour}</span><small>{area === "all" ? "KV1–KV5" : area}</small></header>
        <strong>{snapshot ? fmt(riders.reduce((n, r) => n + r.onhold, 0)) : "—"}<small>lượt OH</small></strong>
        {snapshot ? <><p>Đã lưu cố định · {fmt(riders.length)} rider {cot}</p><p>Thu thập từ {formatDateTime(snapshot.source_started_at)}<br />Lưu lúc {formatDateTime(snapshot.snapshot_at)}</p>
          <div className={s.cotAreas}>{PICKUP_AREAS.filter(kv => area === "all" || kv === area).map(kv => <span key={kv}>{kv}<b>{fmt(riders.filter(r => r.area === kv).reduce((n, r) => n + r.onhold, 0))}</b></span>)}</div>
          <details><summary>Danh sách rider đã chốt ({fmt(riders.length)})</summary><p>Tên, mã rider và KV giữ nguyên tại thời điểm chốt, gồm cả rider có 0 OH.</p><div className={s.cotRiders} aria-label={`Danh sách rider snapshot ${cot}`}><div><b>Rider tại giờ chốt</b><b>OH</b></div>{riders.length ? [...riders].sort((a, b) => b.onhold - a.onhold || a.name.localeCompare(b.name, "vi")).map(r => <div key={r.id}><span>{r.name}<small>{r.id} · {r.area} · {cot}</small></span><b>{fmt(r.onhold)}</b></div>) : <p>Không có rider trong phạm vi đã lưu.</p>}</div></details>
        </> : <p role="status">{!current ? error ? "Chưa đọc được dữ liệu." : "Đang tải snapshot…" : after ? "Chưa có snapshot hợp lệ tại mốc này." : "Chưa tới giờ chốt."}</p>}
      </article>;
    })}</div>
    <p className={s.cotHelp}>Tên, mã rider, COT và KV giữ theo hồ sơ lúc chốt. Chỉ lọc theo khu vực đang chọn; các bộ lọc rider/zone bên dưới không đổi số đã chốt. Đơn gán chung có thể được tính cho nhiều rider. Thiếu snapshot hiển thị “—”, không tính thành 0.</p>
  </section>;
}
