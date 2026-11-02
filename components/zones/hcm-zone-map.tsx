"use client";

import { OPERATING_AREAS, normalizeOperatingArea } from "@/lib/locations/operating-areas";
import { buildZoneModel, matchesZoneFilters, INITIAL_ZONE_FILTERS, zoneDistrictsForArea, zoneMapLevel, type BinhChanhPlan } from "@/components/zones/zone-model";
import dynamic from "next/dynamic";
import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { Bike, MapPin, Users, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { ZoneFilterPanel } from "@/components/zones/zone-filter-panel";
import { ZoneLegend } from "@/components/zones/zone-legend";
import { ZoneAddressSearch } from "@/components/zones/zone-address-search";
import {
  AREA_COLORS,
  type LocationMode,
  type AddressPin,
  type ZoneFilters,
  type ZoneRider,
} from "@/components/zones/zone-map-types";

const LeafletMap = dynamic(
  () => import("@/components/zones/hcm-leaflet-map").then((module) => module.HcmLeafletMap),
  { ssr: false, loading: () => <div className="h-[560px] animate-pulse rounded-2xl bg-slate-100 lg:h-[680px]" /> },
);

const modeOptions: Array<{ value: LocationMode; label: string }> = [
  { value: "pickup", label: "Khu vực lấy" },
  { value: "delivery", label: "Khu vực giao" },
  { value: "home", label: "Nơi ở" },
];

const initialFilters = INITIAL_ZONE_FILTERS;

export function HcmZoneMap({ riders, binhChanhPlan }: { riders: ZoneRider[]; binhChanhPlan: BinhChanhPlan }) {
  const areaPickerRef = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<LocationMode>("delivery");
  const [filters, setFilters] = useState<ZoneFilters>(initialFilters);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [addressPin, setAddressPin] = useState<AddressPin | null>(null);

  const deferredFilters = useDeferredValue(filters);
  const { zones, ridersByZone, scopedRiders, unlocatedCount, districtRiderCounts } = useMemo(() => buildZoneModel(riders, mode, filters.area, binhChanhPlan), [riders, mode, filters.area, binhChanhPlan]);
  const filteredZones = useMemo(() => zones.filter((zone) => matchesZoneFilters(zone, deferredFilters)), [deferredFilters, zones]);
  const districtOptions = useMemo(() => zoneDistrictsForArea(filters.area), [filters.area]);
  const visibleRiders = new Set(filteredZones.flatMap((zone) => (ridersByZone.get(zone.id) ?? []).map((rider) => rider.id)));
  const visibleZoneIds = useMemo(() => filteredZones.map((zone) => zone.id), [filteredZones]);
  const visibleSelectedZoneId = selectedZoneId && visibleZoneIds.includes(selectedZoneId) ? selectedZoneId : null;
  const singleSearchMatchId = deferredFilters.query.trim() && filteredZones.length === 1 ? filteredZones[0]?.id ?? null : null;
  const activeSelectedZoneId = visibleSelectedZoneId ?? singleSearchMatchId;
  const selectedZone = zones.find((zone) => zone.id === activeSelectedZoneId) ?? null;
  const selectedZoneRiders = activeSelectedZoneId ? ridersByZone.get(activeSelectedZoneId) ?? [] : [];

  const level = zoneMapLevel(filters, Boolean(addressPin || selectedZoneId));
  const selectedDistrict = districtOptions.find((district) => district.id === filters.districtId);
  const areaCounts = useMemo(() => Object.fromEntries(OPERATING_AREAS.map((area) => [area, new Set(riders.filter((rider) => normalizeOperatingArea(rider.kv) === area).map((rider) => rider.id)).size])), [riders]);

  const changeFilters = (next: ZoneFilters) => {
    setFilters(next);
    setSelectedZoneId(null);
    setAddressPin(null);
  };

  const selectArea = (area: ZoneFilters["area"]) => {
    changeFilters({ ...initialFilters, area });
    areaPickerRef.current?.close();
  };
  const selectDistrict = (districtId: string) => changeFilters({ ...initialFilters, area: filters.area, districtId });

  const selectZone = useCallback((id: string) => {
    setAddressPin(null);
    setSelectedZoneId(id);
  }, []);
  const showAddress = useCallback((pin: AddressPin) => {
    setFilters(initialFilters);
    setSelectedZoneId(null);
    setAddressPin(pin);
  }, []);
  const clearAddress = useCallback(() => {
    setAddressPin(null);
    setSelectedZoneId(null);
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><MapPin size={20} /></span><div><h2 className="font-bold text-slate-950">Zone theo khu vực vận hành</h2><p className="text-sm text-slate-500">Chọn khu vực → quận/huyện → phường/xã để xem quân số</p></div></div>
        <div className="flex w-full rounded-xl bg-slate-100 p-1 lg:w-auto">{modeOptions.map((option) => <button key={option.value} type="button" aria-pressed={mode === option.value} onClick={() => { setMode(option.value); setFilters({ ...filters, wardId: "all" }); setSelectedZoneId(null); setAddressPin(null); }} className={cn("min-h-11 flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm lg:flex-none", mode === option.value ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800")}>{option.label}</button>)}</div>
      </div>

      <nav aria-label="Cấp bản đồ" className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 text-sm">
        <button type="button" aria-current={level === "area" ? "page" : undefined} onClick={() => selectArea("all")} className="min-h-11 rounded-lg px-3 font-semibold text-blue-700 hover:bg-blue-50">5 khu vực</button>
        {filters.area !== "all" ? <><span aria-hidden="true" className="text-slate-400">/</span><button type="button" aria-current={level === "district" ? "page" : undefined} onClick={() => selectArea(filters.area)} className="min-h-11 rounded-lg px-3 font-semibold text-blue-700 hover:bg-blue-50">Khu vực {filters.area.slice(-1)}</button></> : null}
        {selectedDistrict ? <><span aria-hidden="true" className="text-slate-400">/</span><button type="button" aria-current={!selectedZone ? "page" : undefined} onClick={() => selectDistrict(selectedDistrict.id)} className="min-h-11 rounded-lg px-3 font-semibold text-blue-700 hover:bg-blue-50">{selectedDistrict.name}</button></> : null}
        {selectedZone ? <><span aria-hidden="true" className="text-slate-400">/</span><span aria-current="page" className="px-3 font-semibold text-slate-900">{selectedZone.ward}</span></> : null}
      </nav>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric icon={<Users size={16} />} label="Rider trong khu vực" value={scopedRiders.length} />
        <Metric icon={<MapPin size={16} />} label="Quận / huyện" value={districtOptions.length} />
        <Metric icon={<MapPin size={16} />} label={level === "area" ? "Khu vực" : mode === "home" ? "Nhóm nơi ở" : "Phường / xã"} value={level === "area" ? 5 : filteredZones.length} />
        <Metric icon={<Bike size={16} />} label="Rider khớp bộ lọc" value={visibleRiders.size} />
      </div>
      {unlocatedCount > 0 ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{unlocatedCount} rider chưa có đủ quận/phường hoặc địa bàn ngoài kế hoạch của khu vực đang chọn.</p> : null}
      {mode === "home" ? <p className="text-sm text-slate-600">Nơi ở được tổng hợp theo quận/huyện vì hồ sơ chưa có phường cư trú.</p> : null}

      <div className="grid items-start gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
        <div className="space-y-4">
          <ZoneAddressSearch pin={addressPin} matchedZoneName={addressPin ? selectedZone?.name ?? null : null} onResult={showAddress} onClear={clearAddress} />
          <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="font-bold text-slate-950">{filters.area === "all" ? "Chọn khu vực" : `Quận / huyện · ${filters.area}`}</h3>
            <p className="mt-1 text-xs text-slate-500">{filters.area === "all" ? "Bấm vùng trên bản đồ hoặc chọn bên dưới." : "Chọn quận để mở bản đồ phường/xã."}</p>
            <div className="mt-3 max-h-[480px] space-y-2 overflow-y-auto">
              {filters.area === "all" ? OPERATING_AREAS.map((area) => <button key={area} type="button" onClick={() => selectArea(area)} className="flex min-h-16 w-full items-start gap-3 rounded-lg border border-slate-200 p-3 text-left transition hover:bg-slate-50"><span aria-hidden="true" className="mt-1 size-3 shrink-0 rounded-full" style={{ background: AREA_COLORS[area] }} /><span className="min-w-0 flex-1"><strong className="block text-sm text-slate-900">Khu vực {area.slice(-1)}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{zoneDistrictsForArea(area).map((district) => district.shortName).join(" · ")}</span></span><span className="shrink-0 text-right text-sm font-bold tabular-nums text-slate-900">{areaCounts[area]}<span className="block text-xs font-normal text-slate-500">rider</span></span></button>) : districtOptions.map((district) => <button key={district.id} type="button" aria-pressed={filters.districtId === district.id} onClick={() => selectDistrict(district.id)} className={cn("flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm transition", filters.districtId === district.id ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-700 hover:bg-slate-50")}><span className="font-semibold">{district.name}</span><span className="shrink-0 tabular-nums">{districtRiderCounts.get(district.id) ?? 0} rider</span></button>)}
            </div>
          </aside>
          {level === "ward" ? <ZoneFilterPanel filters={filters} districts={districtOptions} zones={zones} matchingZones={filteredZones} resultCount={filteredZones.length} open={filtersOpen} onOpenChange={setFiltersOpen} onChange={changeFilters} onSelectZone={selectZone} /> : null}
        </div>
        <LeafletMap onChooseArea={() => areaPickerRef.current?.showModal()} areaCounts={areaCounts} level={level} area={filters.area} districtId={filters.districtId} onSelectArea={selectArea} onSelectDistrict={selectDistrict} zones={zones} visibleZoneIds={visibleZoneIds} selectedZoneId={activeSelectedZoneId} addressPin={addressPin} onAddressZoneMatch={setSelectedZoneId} onSelectZone={selectZone} />
      </div>

      {level === "ward" ? <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-950">{mode === "home" ? "Nơi ở theo quận / huyện" : "Danh sách phường / xã"}</h3><span role="status" className="text-sm text-slate-500">{filteredZones.length} kết quả · {visibleRiders.size} rider</span></div>
        <p className="mb-3 text-xs text-slate-500">Chỉ hiển thị phường có rider đang hoạt động. Bình Chánh được chia theo phường thuộc KV1/KV3 trong Sheet Plan. Một rider có thể phụ trách nhiều phường.</p>
        <div className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
          {filteredZones.map((zone) => <button key={zone.id} type="button" aria-pressed={activeSelectedZoneId === zone.id} onClick={() => selectZone(zone.id)} className={cn("flex min-h-16 min-w-0 items-center justify-between gap-3 rounded-lg border p-3 text-left transition", activeSelectedZoneId === zone.id ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:bg-slate-50")}><span className="min-w-0"><strong className="block text-sm text-slate-900">{zone.ward}</strong><span className="block text-xs text-slate-500">{zone.districtName} · {zone.area}</span></span><span className="shrink-0 text-right"><strong className="block tabular-nums text-slate-900">{zone.riderCount}</strong><span className="text-xs text-slate-500">rider</span></span></button>)}
        </div>
        {filteredZones.length === 0 ? <div className="py-6 text-center"><p className="text-sm text-slate-600">Không có phường/xã khớp bộ lọc. Hãy thử chọn quận khác hoặc xóa bộ lọc.</p><button type="button" onClick={() => changeFilters(initialFilters)} className="mt-3 min-h-11 rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-900">Xóa bộ lọc</button></div> : null}
      </div> : null}

      {level === "ward" ? <ZoneLegend capacityConfigured={zones.some((zone) => zone.capacity !== null)} /> : <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600"><div className="flex flex-wrap gap-4">{OPERATING_AREAS.map((area) => <span key={area} className="flex items-center gap-2"><span aria-hidden="true" className="size-3 rounded-full" style={{ background: AREA_COLORS[area] }} />Khu vực {area.slice(-1)}</span>)}</div><p className="mt-2 text-xs leading-5">Bình Chánh chia theo phường trong Sheet Plan: KV1 màu xanh, KV3 màu tím. Chỉ hiển thị phường có rider đang hoạt động.</p></div>}

      {selectedZone ? (
        <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold uppercase tracking-wider text-blue-600">{selectedZone.code}</p><h3 className="mt-1 text-xl font-black text-slate-950">{selectedZone.name}</h3><p className="mt-1 text-sm text-slate-500">{selectedZone.area} · {(selectedZone.status === "active" ? "Có rider hoạt động" : "Chưa có rider hoạt động")}</p></div><span className="grid size-12 place-items-center rounded-xl text-white shadow-sm" style={{ backgroundColor: selectedZone.color }}><MapPin size={20} /></span></div>
            <div className="mt-5 grid grid-cols-2 gap-3"><Metric icon={<Users size={16} />} label="Tổng rider" value={selectedZone.riderCount} /><Metric icon={<Bike size={16} />} label="Đang active" value={selectedZone.activeRiderCount} /></div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h4 className="font-bold text-slate-950">Rider trong zone</h4><span className="text-xs font-semibold text-slate-500">{selectedZoneRiders.length} rider</span></div><div className="mt-3 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">{selectedZoneRiders.map((rider) => <div key={rider.id} className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 p-2.5"><span className="shrink-0 rounded-lg bg-white px-2 py-1 font-mono text-xs font-bold text-slate-700 shadow-sm">{rider.rider_code}</span><span className="min-w-0 truncate text-sm font-semibold text-slate-800">{rider.full_name || "Chưa có tên"}</span></div>)}{selectedZoneRiders.length === 0 ? <p className="text-sm text-slate-500">Zone chưa có rider theo chế độ đang xem.</p> : null}</div></div>
        </div>
      ) : null}
      <dialog ref={areaPickerRef} className="zone-area-picker" aria-labelledby="zone-area-picker-title" onClick={(event) => { if (event.target === event.currentTarget) areaPickerRef.current?.close(); }}>
        <div className="zone-area-picker-heading"><div><p>ĐỊA BÀN VẬN HÀNH</p><h2 id="zone-area-picker-title">Chọn khu vực</h2><span>Đổi KV ngay trên bản đồ.</span></div><button type="button" aria-label="Đóng chọn khu vực" onClick={() => areaPickerRef.current?.close()}><X size={20} aria-hidden="true" /></button></div>
        <div className="zone-area-picker-options">
          <button type="button" onClick={() => selectArea("all")} className="zone-area-picker-overview">Xem tổng quan 5 khu vực</button>
          {OPERATING_AREAS.map((area) => <button key={area} type="button" aria-pressed={filters.area === area} onClick={() => selectArea(area)} className="zone-area-picker-option"><span aria-hidden="true" className="zone-area-picker-number" style={{ color: AREA_COLORS[area] }}>{area.slice(-1).padStart(2, "0")}</span><span><strong>Khu vực {area.slice(-1)}</strong><small>{zoneDistrictsForArea(area).map((district) => district.name).join(" · ")}</small></span><span className="zone-area-picker-total">{areaCounts[area]}<small>rider</small></span></button>)}
        </div>
      </dialog>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) { return <div className="rounded-xl border border-slate-200 bg-white p-3"><span className="flex items-center gap-2 text-xs font-semibold text-slate-500">{icon}{label}</span><p className="mt-2 text-2xl font-bold tabular-nums text-slate-950">{value}</p></div>; }
