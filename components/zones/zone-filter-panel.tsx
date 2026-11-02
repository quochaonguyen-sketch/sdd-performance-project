import { ChevronDown, Filter, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { MapDistrict, OperationalZone, ZoneFilters } from "@/components/zones/zone-map-types";
import { cn } from "@/utils/cn";

type ZoneFilterPanelProps = {
  filters: ZoneFilters;
  districts: MapDistrict[];
  zones: OperationalZone[];
  matchingZones: OperationalZone[];
  resultCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (filters: ZoneFilters) => void;
  onSelectZone: (zoneId: string) => void;
};

export function ZoneFilterPanel({ filters, districts, zones, matchingZones, resultCount, open, onOpenChange, onChange, onSelectZone }: ZoneFilterPanelProps) {
  const districtOptions = districts;
  const wardOptions = zones.filter((zone) => (filters.area === "all" || zone.areas.includes(filters.area)) && (filters.districtId === "all" || zone.districtId === filters.districtId));
  const searchResults = filters.query.trim() ? matchingZones.slice(0, 6) : [];
  const capacityConfigured = zones.some((zone) => zone.capacity !== null);
  const hasFilters = filters.query || filters.area !== "all" || filters.districtId !== "all" || filters.wardId !== "all" || filters.status !== "all";

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" aria-expanded={open} aria-controls="zone-filter-fields" className="flex min-h-11 w-full items-center justify-between gap-3 p-4 text-left" onClick={() => onOpenChange(!open)}>
        <span className="flex items-center gap-2 font-bold text-slate-950"><Filter size={17} className="text-blue-600" /> Bộ lọc khu vực</span>
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-500"><strong className="text-slate-900">{resultCount}</strong> zone <ChevronDown size={16} className={cn("transition lg:hidden", open && "rotate-180")} /></span>
      </button>
      <div id="zone-filter-fields" className={cn("border-t border-slate-100 p-4", !open && "hidden")}>
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Tìm zone</span>
          <span className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><Input value={filters.query} onChange={(event) => onChange({ ...filters, query: event.target.value })} className="pl-9 pr-9" placeholder="Tên hoặc mã zone" />{filters.query ? <button type="button" aria-label="Xóa tìm kiếm" className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" onClick={() => onChange({ ...filters, query: "" })}><X size={15} /></button> : null}</span>
        </label>

        {searchResults.length > 0 ? <div className="mt-2 space-y-1 rounded-xl border border-slate-100 bg-slate-50 p-1.5">{searchResults.map((zone) => <button key={zone.id} type="button" className="flex w-full items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-left text-xs shadow-sm hover:ring-2 hover:ring-blue-100" onClick={() => onSelectZone(zone.id)}><span className="min-w-0 truncate font-semibold text-slate-800">{zone.name}</span><span className="shrink-0 font-mono text-[10px] text-slate-400">{zone.code}</span></button>)}</div> : null}

        <div className="mt-4 space-y-3">
          <FilterSelect label="Quận / huyện" value={filters.districtId} onChange={(value) => onChange({ ...filters, districtId: value, wardId: "all" })}><option value="all">Tất cả quận/huyện</option>{districtOptions.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}</FilterSelect>
          <FilterSelect label="Phường / xã" value={filters.wardId} onChange={(value) => onChange({ ...filters, wardId: value })}><option value="all">{wardOptions.length ? "Tất cả phường/xã" : "Chưa có dữ liệu phường/xã"}</option>{wardOptions.map((zone) => <option key={zone.id} value={zone.id}>{zone.ward} · {zone.districtName}</option>)}</FilterSelect>
          <FilterSelect label="Trạng thái quân số" value={filters.status} onChange={(value) => onChange({ ...filters, status: value as ZoneFilters["status"] })}><option value="all">Tất cả trạng thái</option><option value="active">Có rider hoạt động</option>{capacityConfigured ? <option value="full">Đầy tải</option> : null}</FilterSelect>
        </div>

        {hasFilters ? <button type="button" className="mt-4 min-h-11 w-full rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200" onClick={() => onChange({ query: "", area: "all", districtId: "all", wardId: "all", status: "all" })}>Xóa tất cả bộ lọc</button> : null}
      </div>
    </aside>
  );
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span><Select value={value} onChange={(event) => onChange(event.target.value)}>{children}</Select></label>;
}
