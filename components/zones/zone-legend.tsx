import { ZONE_COLORS } from "@/components/zones/zone-map-types";

export function ZoneLegend({ capacityConfigured }: { capacityConfigured: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Màu zone</p><div className="mt-2 flex flex-wrap gap-1.5">{ZONE_COLORS.map((color) => <span key={color} className="size-4 rounded-full ring-2 ring-white shadow-sm" style={{ backgroundColor: color }} />)}<span className="ml-1 text-xs text-slate-500">Màu theo quận; riêng Bình Chánh theo KV trong Plan</span></div></div>
        <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Quân số</p><div className="mt-2 flex flex-wrap gap-4 text-xs font-semibold text-slate-600"><LegendStatus color="#16a34a" label="Có rider hoạt động" />{capacityConfigured ? <LegendStatus color="#dc2626" label="Đầy tải" /> : null}</div></div>
      </div>
    </div>
  );
}

function LegendStatus({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return <span className="flex items-center gap-2"><span className="size-3.5 rounded border-2" style={{ borderColor: color, backgroundColor: `${color}22`, borderStyle: dashed ? "dashed" : "solid" }} />{label}</span>;
}
