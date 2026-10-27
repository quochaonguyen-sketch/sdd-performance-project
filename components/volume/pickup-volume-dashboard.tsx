"use client";
import { useRememberedState } from "@/components/layout/filter-memory";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, CalendarDays, MapPin, PackageCheck, RefreshCcw, Route, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import { OPERATING_AREAS } from "@/lib/locations/operating-areas";

export type PickupCotSummary = {
  cot: string;
  count: number;
};

export type PickupRoute = {
  route: string;
  count: number;
  cots: PickupCotSummary[];
};

export type PickupWard = {
  ward: string;
  count: number;
  cots: PickupCotSummary[];
  routes: PickupRoute[];
};

export type PickupDistrict = {
  area: string;
  district: string;
  count: number;
  cots: PickupCotSummary[];
  wards: PickupWard[];
};

type PickupVolumeDashboardProps = {
  date: string;
  onDateChange: (value: string) => void;
  onRefresh: () => void;
  loading: boolean;
  error: string | null;
  totalOrders: number;
  totalRoutes: number;
  wardCount: number;
  cotVolumes: PickupCotSummary[];
  districts: PickupDistrict[];
};

export function PickupVolumeDashboard({
  date,
  onDateChange,
  onRefresh,
  loading,
  error,
  districts,
}: PickupVolumeDashboardProps) {
  const [area, setArea] = useRememberedState("pickup-volume-dashboard:area", "all");
  const scoped = useMemo(() => districts.filter((item) => area === "all" || item.area === area), [districts, area]);
  const totalOrders = scoped.reduce((sum, item) => sum + item.count, 0);
  const totalRoutes = new Set(scoped.flatMap((item) => item.wards.flatMap((ward) => ward.routes.map((route) => route.route))).filter((route) => route !== "Chưa có mã tuyến")).size;
  const wardCount = scoped.reduce((sum, item) => sum + item.wards.length, 0);
  const cotVolumes = useMemo(() => {
    const cots = new Map<string, number>();
    for (const district of scoped) for (const cot of district.cots) cots.set(cot.cot, (cots.get(cot.cot) ?? 0) + cot.count);
    return Array.from(cots, ([cot, count]) => ({ cot, count }));
  }, [scoped]);
  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Volume theo địa bàn</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Pickup Volume</h1>
          <p className="mt-1 text-sm text-slate-500">Sản lượng theo địa chỉ seller/người gửi, COT và địa bàn lấy hàng.</p>
        </div>
        <VolumeNavigation />
      </header>

      <DateFilter date={date} onDateChange={onDateChange} onRefresh={onRefresh} loading={loading} />

      <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Scope khu vực Pickup">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold text-slate-900">1. Chọn khu vực</h2><p className="text-xs text-slate-500">Khu vực → Quận/huyện → Phường/xã → Mã tuyến</p></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
          {["all", ...OPERATING_AREAS, "UNRESOLVED"].map((value) => {
            const tones: Record<string, string> = { all: "border-slate-300 bg-slate-50", KV1: "border-blue-300 bg-blue-50", KV2: "border-emerald-300 bg-emerald-50", KV3: "border-purple-300 bg-purple-50", KV4: "border-amber-300 bg-amber-50", KV5: "border-pink-300 bg-pink-50", UNRESOLVED: "border-orange-300 bg-orange-50" };
            const count = districts.filter((item) => value === "all" || item.area === value).reduce((sum, item) => sum + item.count, 0);
            return <button key={value} type="button" aria-pressed={area === value} onClick={() => setArea(value)} className={cn("rounded-lg border-t-4 border px-3 py-3 text-left transition hover:-translate-y-0.5 motion-reduce:transform-none", tones[value], area === value && "ring-2 ring-slate-700 ring-offset-2")}><span className="text-xs font-bold text-slate-700">{value === "all" ? "Tất cả khu vực" : value === "UNRESOLVED" ? "Chưa rõ KV" : value}</span><strong className="mt-1 block text-xl tabular-nums text-slate-950">{loading ? "—" : formatNumber(count)}</strong><span className="text-[11px] text-slate-500">đơn pickup</span></button>;
          })}
        </div>
        <p className="mt-3 text-xs font-semibold text-slate-600">Đang xem: {area === "all" ? "Tất cả khu vực" : area === "UNRESOLVED" ? "Chưa rõ khu vực" : area} · {scoped.length} địa bàn quận/huyện · {formatNumber(totalOrders)} đơn</p>
      </section>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          Không tải được dữ liệu: {error}
        </p>
      ) : null}

      <KpiCards
        loading={loading}
        totalOrders={totalOrders}
        totalRoutes={totalRoutes}
        wardCount={wardCount}
        cotCount={cotVolumes.length}
      />

      <CotVolumeCard cotVolumes={cotVolumes} loading={loading} />

      <PickupAreaExplorer
        key={`${date}:${area}`}
        date={date}
        totalOrders={totalOrders}
        totalRoutes={totalRoutes}
        districts={scoped}
        loading={loading}
      />
    </div>
  );
}

function VolumeNavigation() {
  return (
    <nav className="inline-flex self-start rounded-lg bg-slate-100 p-1" aria-label="Loại volume">
      <Link href="/volume/delivery" className="rounded-md px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-900">
        Delivery
      </Link>
      <Link href="/volume/pickup" className="rounded-md bg-white px-4 py-2 text-sm font-bold text-slate-950 shadow-sm">
        Pickup
      </Link>
    </nav>
  );
}

function DateFilter({
  date,
  onDateChange,
  onRefresh,
  loading,
}: {
  date: string;
  onDateChange: (value: string) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-sm font-bold text-slate-900">Bộ lọc báo cáo</h2>
        <p className="mt-0.5 text-xs text-slate-500">Chọn ngày cần kiểm tra sản lượng pickup.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="block min-w-[210px]">
          <span className="mb-1.5 block text-xs font-bold text-slate-600">Ngày báo cáo</span>
          <span className="relative block">
            <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} className="pl-9" />
          </span>
        </label>
        <Button type="button" variant="secondary" onClick={onRefresh} disabled={loading}>
          <RefreshCcw size={16} className={loading ? "animate-spin" : undefined} />
          Làm mới
        </Button>
      </div>
    </section>
  );
}

function KpiCards({
  loading,
  totalOrders,
  totalRoutes,
  wardCount,
  cotCount,
}: {
  loading: boolean;
  totalOrders: number;
  totalRoutes: number;
  wardCount: number;
  cotCount: number;
}) {
  const items = [
    { label: "Tổng đơn", value: totalOrders, icon: PackageCheck, tone: "bg-orange-50 text-orange-700" },
    { label: "Số tuyến", value: totalRoutes, icon: Route, tone: "bg-blue-50 text-blue-700" },
    { label: "Phường/xã", value: wardCount, icon: MapPin, tone: "bg-emerald-50 text-emerald-700" },
    { label: "Số COT", value: cotCount, icon: Building2, tone: "bg-slate-100 text-slate-700" },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Chỉ số pickup">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase text-slate-500">{item.label}</p>
              <span className={cn("grid size-8 place-items-center rounded-md", item.tone)}>
                <Icon size={17} />
              </span>
            </div>
            <p className="mt-3 text-2xl font-black text-slate-950 sm:text-3xl">
              {loading ? "-" : formatNumber(item.value)}
            </p>
          </div>
        );
      })}
    </section>
  );
}

function CotVolumeCard({ cotVolumes, loading }: { cotVolumes: PickupCotSummary[]; loading: boolean }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
        <h2 className="font-bold text-slate-950">Volume theo COT</h2>
        <p className="mt-0.5 text-xs text-slate-500">Phân bổ tổng sản lượng theo nhóm COT.</p>
      </div>
      <div className="grid sm:grid-cols-2 sm:divide-x sm:divide-slate-100">
        {["COT 1", "COT 2"].map((name, index) => (
          <div key={name} className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">{name}</p>
              <p className="mt-1 text-2xl font-black text-slate-950">
                {loading ? "-" : formatNumber(cotValue(cotVolumes, name))}
              </p>
            </div>
            <span className={cn("h-10 w-1 rounded-full", index === 0 ? "bg-blue-500" : "bg-emerald-500")} />
          </div>
        ))}
      </div>
    </section>
  );
}

function PickupAreaExplorer({
  date,
  totalOrders,
  totalRoutes,
  districts,
  loading,
}: {
  date: string;
  totalOrders: number;
  totalRoutes: number;
  districts: PickupDistrict[];
  loading: boolean;
}) {
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [selectedWard, setSelectedWard] = useState<string | null>(null);
  const [routeQuery, setRouteQuery] = useState("");
  const activeDistrict = districts.find((district) => `${district.area}::${district.district}` === selectedDistrict) ?? districts[0] ?? null;
  const activeWard = activeDistrict?.wards.find((ward) => ward.ward === selectedWard) ?? activeDistrict?.wards[0] ?? null;
  const filteredRoutes = useMemo(() => {
    const query = normalizeSearch(routeQuery);
    if (!query) return activeWard?.routes ?? [];
    return activeWard?.routes.filter((route) => normalizeSearch(route.route).includes(query)) ?? [];
  }, [activeWard, routeQuery]);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 className="font-bold text-slate-950">Pickup theo địa bàn ngày {formatVietnameseDate(date)}</h2>
          <p className="mt-0.5 text-sm text-slate-500">Chọn khu vực ở trên, sau đó chọn quận → phường/xã → mã tuyến pickup. Số liệu chỉ tính trong khu vực đang xem.</p>
        </div>
        <div className="flex gap-2 text-xs font-bold">
          <span className="rounded-md bg-slate-100 px-2.5 py-1.5 text-slate-600">{totalRoutes} tuyến</span>
          <span className="rounded-md bg-orange-600 px-2.5 py-1.5 text-white">{formatNumber(totalOrders)} đơn</span>
        </div>
      </div>

      <div className="grid min-h-[560px] xl:grid-cols-[280px_320px_minmax(0,1fr)]">
        <DistrictList
          districts={districts}
          selectedDistrict={activeDistrict ? `${activeDistrict.area}::${activeDistrict.district}` : null}
          loading={loading}
          onSelect={(district) => {
            setSelectedDistrict(district);
            setSelectedWard(null);
            setRouteQuery("");
          }}
        />
        <WardList
          wards={activeDistrict?.wards ?? []}
          selectedWard={activeWard?.ward ?? null}
          onSelect={(ward) => {
            setSelectedWard(ward);
            setRouteQuery("");
          }}
        />
        <RouteTable
          district={activeDistrict ? `${activeDistrict.area === "UNRESOLVED" ? "Chưa rõ KV" : activeDistrict.area} · ${activeDistrict.district}` : null}
          ward={activeWard ?? null}
          routes={filteredRoutes}
          query={routeQuery}
          onQueryChange={setRouteQuery}
        />
      </div>
    </section>
  );
}

function DistrictList({
  districts,
  selectedDistrict,
  loading,
  onSelect,
}: {
  districts: PickupDistrict[];
  selectedDistrict: string | null;
  loading: boolean;
  onSelect: (district: string) => void;
}) {
  return (
    <div className="border-b border-slate-200 xl:border-b-0 xl:border-r">
      <ColumnHeader step="2" title="Chọn quận / huyện" count={districts.length} />
      <div className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto xl:max-h-[720px]">
        {!loading && districts.length === 0 ? <EmptyState text="Chưa có dữ liệu quận/huyện." /> : null}
        {districts.map((district) => (
          <button
            key={`${district.area}::${district.district}`}
            type="button"
            onClick={() => onSelect(`${district.area}::${district.district}`)}
            className={cn(
              "w-full border-l-2 px-4 py-3 text-left transition",
              selectedDistrict === `${district.area}::${district.district}`
                ? "border-orange-500 bg-orange-50/70"
                : "border-transparent hover:bg-slate-50",
            )}
          >
            <ListItemHeader name={district.district} value={district.count} />
            <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{district.area === "UNRESOLVED" ? "Chưa rõ KV" : district.area}</span>
            {district.district === "Chưa rõ địa bàn seller" ? <span className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Cần đối chiếu / fetch lại</span> : null}
            <p className="mt-1 text-xs text-slate-500">
              {district.wards.length} phường/xã · {countDistrictRoutes(district)} tuyến
            </p>
            <CotMetadata cots={district.cots} />
          </button>
        ))}
      </div>
    </div>
  );
}

function WardList({
  wards,
  selectedWard,
  onSelect,
}: {
  wards: PickupWard[];
  selectedWard: string | null;
  onSelect: (ward: string) => void;
}) {
  return (
    <div className="border-b border-slate-200 xl:border-b-0 xl:border-r">
      <ColumnHeader step="3" title="Chọn phường / xã" count={wards.length} />
      <div className="max-h-[400px] divide-y divide-slate-100 overflow-y-auto xl:max-h-[720px]">
        {wards.length === 0 ? <EmptyState text="Chọn quận để xem phường/xã." /> : null}
        {wards.map((ward) => (
          <button
            key={ward.ward}
            type="button"
            onClick={() => onSelect(ward.ward)}
            className={cn(
              "w-full border-l-2 px-4 py-3 text-left transition",
              selectedWard === ward.ward
                ? "border-orange-500 bg-orange-50/70"
                : "border-transparent hover:bg-slate-50",
            )}
          >
            <ListItemHeader name={ward.ward} value={ward.count} />
            <p className="mt-1 text-xs text-slate-500">{ward.routes.filter((route) => route.route !== "Chưa có mã tuyến").length} mã tuyến seller</p>
            <CotMetadata cots={ward.cots} />
          </button>
        ))}
      </div>
    </div>
  );
}

function RouteTable({
  district,
  ward,
  routes,
  query,
  onQueryChange,
}: {
  district: string | null;
  ward: PickupWard | null;
  routes: PickupRoute[];
  query: string;
  onQueryChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-slate-400">4. Mã tuyến trong phường</p>
            <h3 className="mt-1 truncate text-lg font-black text-slate-950">{ward?.ward ?? "Chưa chọn phường"}</h3>
            <p className="truncate text-sm text-slate-500">{district ?? "Chưa chọn quận"}</p>
          </div>
          <label className="relative block w-full sm:w-[280px]">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Tìm mã tuyến"
              className="pl-9"
              disabled={!ward}
            />
          </label>
        </div>
        {ward ? (
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-md bg-slate-100 px-2.5 py-1.5 text-slate-600">{ward.routes.filter((route) => route.route !== "Chưa có mã tuyến").length} tuyến seller</span>
            <span className="rounded-md bg-orange-50 px-2.5 py-1.5 text-orange-700">{formatNumber(ward.count)} đơn</span>
            <span className="rounded-md bg-blue-50 px-2.5 py-1.5 text-blue-700">COT 1: {formatNumber(cotValue(ward.cots, "COT 1"))}</span>
            <span className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-emerald-700">COT 2: {formatNumber(cotValue(ward.cots, "COT 2"))}</span>
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto p-4 sm:p-5">
        <table className="w-full min-w-[620px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase text-slate-500">
              <th className="border-b border-slate-200 bg-slate-50 px-3 py-2.5">Mã tuyến</th>
              <th className="border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-right">Số đơn tổng</th>
              <th className="border-b border-slate-200 bg-blue-50/70 px-3 py-2.5 text-right text-blue-700">COT 1</th>
              <th className="border-b border-slate-200 bg-emerald-50/70 px-3 py-2.5 text-right text-emerald-700">COT 2</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((route, index) => (
              <tr key={route.route} className={cn("transition hover:bg-orange-50/60", index % 2 === 1 && "bg-slate-50/60")}>
                <td className="border-b border-slate-100 px-3 py-3 font-bold text-slate-900">{route.route}</td>
                <td className="border-b border-slate-100 px-3 py-3 text-right font-black text-slate-950">{formatNumber(route.count)}</td>
                <td className="border-b border-slate-100 px-3 py-3 text-right font-semibold text-blue-700">{formatNumber(cotValue(route.cots, "COT 1"))}</td>
                <td className="border-b border-slate-100 px-3 py-3 text-right font-semibold text-emerald-700">{formatNumber(cotValue(route.cots, "COT 2"))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {ward && routes.length === 0 ? <EmptyState text="Không tìm thấy mã tuyến phù hợp." /> : null}
        {!ward ? <EmptyState text="Chọn quận và phường để xem mã tuyến." /> : null}
      </div>
    </div>
  );
}

function ColumnHeader({ step, title, count }: { step: string; title: string; count: number }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
      <span className="text-xs font-bold uppercase text-slate-500">{step}. {title}</span>
      <span className="text-xs font-semibold text-slate-400">{count}</span>
    </div>
  );
}

function ListItemHeader({ name, value }: { name: string; value: number }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="min-w-0 truncate text-sm font-bold text-slate-900">{name}</span>
      <strong className="shrink-0 text-sm text-slate-950">{formatNumber(value)}</strong>
    </div>
  );
}

function CotMetadata({ cots }: { cots: PickupCotSummary[] }) {
  return (
    <div className="mt-1.5 flex gap-3 text-[11px] font-semibold text-slate-500">
      <span>COT 1: {formatNumber(cotValue(cots, "COT 1"))}</span>
      <span>COT 2: {formatNumber(cotValue(cots, "COT 2"))}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="p-6 text-center text-sm text-slate-500">{text}</p>;
}

function countDistrictRoutes(district: PickupDistrict) {
  return new Set(district.wards.flatMap((ward) => ward.routes.map((route) => route.route)).filter((route) => route !== "Chưa có mã tuyến")).size;
}

function cotValue(cots: PickupCotSummary[], name: string) {
  return cots.find((cot) => cot.cot === name)?.count ?? 0;
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim();
}

function formatVietnameseDate(date: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}
