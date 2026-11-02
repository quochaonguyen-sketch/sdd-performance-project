"use client";

import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";
import { ChevronDown, LocateFixed, Minus, Plus, RotateCcw, SunMedium } from "lucide-react";
import { CircleMarker, GeoJSON, MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import { divIcon, latLngBounds } from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { regionOutline } from "@/components/zones/region-outline";
import { geometryBounds } from "@/components/zones/geometry-bounds";
import { ZonePolygon } from "@/components/zones/zone-polygon";
import { AREA_COLORS, MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, MAP_FOCUS_PADDING, MAP_MAX_ZOOM, MAP_MIN_ZOOM, ZONE_OPACITY_DEFAULT, ZONE_OPACITY_MAX, ZONE_OPACITY_MIN, compactZoneName, zoneId, type AddressPin, type OperationalZone, type ZoneFilters, type ZoneMapLevel } from "@/components/zones/zone-map-types";
import { zoneDistrictsForArea } from "@/components/zones/zone-model";
import { OPERATING_AREAS, type OperatingArea } from "@/lib/locations/operating-areas";

type WardProperties = { districtId: string; wardKey: string; capacity?: number; source: string };
type WardFeature = Feature<Geometry, WardProperties>;
type RegionProperties = { kind: "area" | "district" | "coverage"; id: string; name: string; area?: OperatingArea; districtId?: string; labelPosition?: [number, number] };

let boundariesRequest: Promise<FeatureCollection<Geometry, WardProperties>> | null = null;
let regionsRequest: Promise<FeatureCollection<Geometry, RegionProperties>> | null = null;

type HcmLeafletMapProps = {
  zones: OperationalZone[];
  visibleZoneIds: string[];
  selectedZoneId: string | null;
  addressPin: AddressPin | null;
  onAddressZoneMatch: (zoneId: string | null) => void;
  onSelectZone: (zoneId: string) => void;
  areaCounts: Record<string, number>;
  level: ZoneMapLevel;
  area: ZoneFilters["area"];
  districtId: string;
  onSelectArea: (area: OperatingArea) => void;
  onSelectDistrict: (id: string) => void;
  onChooseArea: () => void;
};

export function HcmLeafletMap({ zones, visibleZoneIds, selectedZoneId, addressPin, onAddressZoneMatch, onSelectZone, areaCounts, level, area, districtId, onSelectArea, onSelectDistrict, onChooseArea }: HcmLeafletMapProps) {
  const [boundaries, setBoundaries] = useState<FeatureCollection<Geometry, WardProperties> | null>(null);
  const [regions, setRegions] = useState<FeatureCollection<Geometry, RegionProperties> | null>(null);
  const [zoneOpacity, setZoneOpacity] = useState(ZONE_OPACITY_DEFAULT);
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const [boundaryError, setBoundaryError] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([loadBoundaries(), loadRegions()])
      .then(([data, regionData]) => { if (active) { setBoundaries(data); setRegions(regionData); } })
      .catch(() => { if (active) setBoundaryError(true); });
    return () => { active = false; };
  }, []);

  const zoneById = useMemo(() => new Map(zones.map((zone) => [zone.id, zone])), [zones]);
  const visibleIds = useMemo(() => new Set(visibleZoneIds), [visibleZoneIds]);
  const visibleFeatures = useMemo(() => boundaries?.features.flatMap((feature) => { const id = featureZoneId(feature); const zone = zoneById.get(id); return zone && visibleIds.has(id) ? [{ feature, zone }] : []; }) ?? [], [boundaries, visibleIds, zoneById]);
  const selectedFeature = visibleFeatures.find(({ zone }) => zone.id === selectedZoneId)?.feature ?? null;
  const regionFeatures = useMemo(() => {
    const districtIds = new Set(zoneDistrictsForArea(area).map((district) => district.id));
    const base = regions?.features.filter((feature) => level === "area" ? feature.properties.kind === "area" : feature.properties.kind === "district" && feature.properties.id !== "binh-chanh" && districtIds.has(feature.properties.id)) ?? [];
    const coverage: Feature<Geometry, RegionProperties>[] = boundaries?.features.flatMap((feature) => {
      const zone = zoneById.get(featureZoneId(feature));
      if (feature.properties.districtId !== "binh-chanh" || !zone || zone.activeRiderCount === 0 || zone.areas.length !== 1) return [];
      return [{ ...feature, properties: { kind: "coverage" as const, id: zone.id, name: zone.ward, area: zone.areas[0], districtId: "binh-chanh" } }];
    }) ?? [];
    return [...base, ...coverage];
  }, [regions, area, level, boundaries, zoneById]);
  const regionOutlines = useMemo(() => new Map(regionFeatures.map(feature => [feature, regionOutline(feature)])), [regionFeatures]);
  const overviewLabels = useMemo(() => regionFeatures.filter((feature) => feature.properties.kind === "area" && feature.properties.labelPosition && OPERATING_AREAS.includes(feature.properties.id as OperatingArea)).map((feature) => {
    const id = feature.properties.id as OperatingArea;
    return { id, position: feature.properties.labelPosition!, icon: divIcon({
      className: "zone-area-marker",
      iconSize: [100, 48], iconAnchor: [50, 24],
      html: `<span class="zone-area-marker-card" style="--area-color:${AREA_COLORS[id]}"><span class="zone-area-marker-number">0${id.slice(-1)}</span><span class="zone-area-marker-copy"><strong>KV ${id.slice(-1)}</strong><small>${Number(areaCounts[id] ?? 0).toLocaleString("vi-VN")} rider</small></span></span>`,
    }) };
  }), [regionFeatures, areaCounts]);
  const viewportFeatures = useMemo(() => {
    if (level !== "ward") return regionFeatures.map((feature) => ({ feature }));
    if (visibleFeatures.length) return visibleFeatures;
    return regionFeatures.filter((feature) => districtId === "all" || feature.properties.id === districtId).map((feature) => ({ feature }));
  }, [level, regionFeatures, visibleFeatures, districtId]);

  useEffect(() => {
    if (!addressPin || !boundaries) return;
    const matchedFeature = boundaries.features.find((feature) => geometryContainsPoint(feature.geometry, addressPin.lat, addressPin.lng));
    const matchedId = matchedFeature ? featureZoneId(matchedFeature) : null;
    onAddressZoneMatch(matchedId && zoneById.has(matchedId) ? matchedId : null);
  }, [addressPin, boundaries, onAddressZoneMatch, zoneById]);

  return (
    <div className="zone-map-shell min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="zone-map-heading">
        <div><span className="zone-map-eyebrow">Địa bàn vận hành</span><h3>{level === "area" ? "Tổng quan 5 khu vực" : level === "district" ? `Các quận / huyện · ${area}` : "Chi tiết phường / xã"}</h3></div>
        <div className="zone-map-heading-actions"><span className="zone-map-count">{level === "ward" ? `${visibleFeatures.length} phường` : level === "area" ? "5 khu vực" : `${new Set(regionFeatures.map((feature) => feature.properties.districtId ?? feature.properties.id)).size} quận/huyện`}</span><button type="button" className="zone-map-choose-area" aria-haspopup="dialog" onClick={onChooseArea}>Chọn khu vực<ChevronDown size={16} aria-hidden="true" /></button></div>
      </div>
    <div className={`zone-operations-map zone-operations-map--${level} relative h-[480px] sm:h-[560px] lg:h-[640px]`} style={{ "--zone-fill-opacity": zoneOpacity / 100 } as CSSProperties}>
      <MapContainer center={MAP_DEFAULT_CENTER} zoom={MAP_DEFAULT_ZOOM} minZoom={MAP_MIN_ZOOM} maxZoom={MAP_MAX_ZOOM} zoomControl={false} scrollWheelZoom className="h-full w-full">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ViewportController selectedFeature={selectedFeature} addressPin={addressPin} visibleFeatures={viewportFeatures} />
        {level !== "ward" ? regionFeatures.map((feature) => {
          const props = feature.properties;
          const color = props.kind === "coverage" && props.area ? AREA_COLORS[props.area] : props.kind === "area" ? AREA_COLORS[props.id as OperatingArea] : area !== "all" ? AREA_COLORS[area] : AREA_COLORS.KV1;
          const hovered = hoveredRegion === props.id;
          return <Fragment key={`${level}:${props.id}`}>
            <GeoJSON data={feature} style={{ className: `zone-region-fill${hovered ? " zone-region-fill--hovered" : ""}`, stroke: false, fillColor: color }} eventHandlers={{ click: () => { setHoveredRegion(null); if (props.kind === "coverage" && level === "area" && props.area) onSelectArea(props.area); else if (props.kind === "area" && OPERATING_AREAS.includes(props.id as OperatingArea)) onSelectArea(props.id as OperatingArea); else onSelectDistrict(props.districtId ?? props.id); }, mouseover: () => setHoveredRegion(props.id), mouseout: () => setHoveredRegion(null) }}>
              {props.kind === "district" ? <Tooltip permanent direction="center" className="zone-district-label"><strong>{props.name}</strong></Tooltip> : null}
              {props.kind === "coverage" ? <Tooltip direction="center" className="zone-district-label"><strong>{props.name} · {props.area}</strong><br />Bình Chánh · Theo Sheet Plan</Tooltip> : null}
            </GeoJSON>
            <GeoJSON data={regionOutlines.get(feature)!} interactive={false} style={{ className: "zone-region-outline", color: "#ffffff", weight: 5.5, opacity: 1, fill: false, lineCap: "round", lineJoin: "round" }} />
            <GeoJSON data={regionOutlines.get(feature)!} interactive={false} style={{ className: "zone-region-outline", color, weight: hovered ? 2.8 : 2, opacity: 0.95, fill: false, lineCap: "round", lineJoin: "round" }} />
          </Fragment>;
        }) : visibleFeatures.map(({ feature, zone }) => <ZonePolygon key={zone.id} feature={feature} zone={zone} selected={zone.id === selectedZoneId} onSelect={onSelectZone} />)}
        {level === "area" ? overviewLabels.map((label) => <Marker key={label.id} position={label.position} icon={label.icon} title={`Khu vực ${label.id.slice(-1)} · Xem quận/huyện`} alt={`Khu vực ${label.id.slice(-1)}`} keyboard eventHandlers={{ click: () => { setHoveredRegion(null); onSelectArea(label.id); }, mouseover: () => setHoveredRegion(label.id), mouseout: () => setHoveredRegion(null) }} />) : null}
        {addressPin ? <>
          <CircleMarker center={[addressPin.lat, addressPin.lng]} radius={15} interactive={false} pathOptions={{ className: "address-pin-pulse", color: "#fb7185", fillColor: "#fb7185", fillOpacity: 0.18, opacity: 0.5, weight: 1 }} />
          <CircleMarker center={[addressPin.lat, addressPin.lng]} radius={6} pathOptions={{ className: "address-pin-dot", color: "#ffffff", fillColor: "#e11d48", fillOpacity: 1, opacity: 1, weight: 2.5 }}>
            <Tooltip permanent direction="top" offset={[0, -8]} className="address-pin-label">Vị trí tìm được</Tooltip>
          </CircleMarker>
        </> : null}
        <MapControls selectedFeature={selectedFeature} />
      </MapContainer>
    </div>
      <div className="zone-map-footer">
        <p role="status">{boundaryError ? "Không tải được bản đồ. Bạn vẫn có thể chọn trong danh sách." : !boundaries ? "Đang tải ranh giới…" : level === "area" ? "Chọn vùng màu hoặc nhãn khu vực để khám phá." : level === "district" ? "Chọn quận / huyện để xem các phường." : "Chọn phường để xem danh sách rider."}</p>
        <label className="zone-map-opacity"><SunMedium size={15} aria-hidden="true" /><span>Độ đậm</span><input aria-label="Độ đậm màu zone" type="range" min={ZONE_OPACITY_MIN} max={ZONE_OPACITY_MAX} value={zoneOpacity} onChange={(event) => setZoneOpacity(Number(event.target.value))} className="zone-opacity-slider" /><strong>{zoneOpacity}%</strong></label>
      </div>
    </div>

  );
}

function ViewportController({ selectedFeature, addressPin, visibleFeatures }: { selectedFeature: WardFeature | null; addressPin: AddressPin | null; visibleFeatures: Array<{ feature: Feature<Geometry> }> }) {
  const map = useMap();
  const visibleBounds = useMemo(() => {
    const bounds = latLngBounds([]);
    for (const { feature } of visibleFeatures) {
      const points = geometryBounds(feature.geometry);
      if (points) bounds.extend(points);
    }
    return bounds.isValid() ? bounds.toBBoxString() : "";
  }, [visibleFeatures]);
  useEffect(() => {
    if (selectedFeature || addressPin) return;
    if (!visibleBounds) { map.setView(MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM); return; }
    const [west, south, east, north] = visibleBounds.split(",").map(Number);
    map.fitBounds([[south, west], [north, east]], { padding: MAP_FOCUS_PADDING, maxZoom: 14 });
  }, [map, visibleBounds, selectedFeature, addressPin]);
  useEffect(() => { const container = map.getContainer(); const refresh = () => map.invalidateSize({ animate: false }); const frame = requestAnimationFrame(refresh); const observer = new ResizeObserver(refresh); observer.observe(container); return () => { cancelAnimationFrame(frame); observer.disconnect(); }; }, [map]);
  useEffect(() => {
    if (addressPin) {
      map.flyTo([addressPin.lat, addressPin.lng], 16, { duration: 0.65 });
      return;
    }
    if (!selectedFeature) return;
    const points = geometryBounds(selectedFeature.geometry);
    if (!points) return;
    const bounds = latLngBounds(points);
    if (bounds.isValid()) map.flyToBounds(bounds, { duration: 0.55, padding: MAP_FOCUS_PADDING, maxZoom: 15 });
  }, [addressPin, map, selectedFeature]);
  return null;
}

function MapControls({ selectedFeature }: { selectedFeature: WardFeature | null }) {
  const map = useMap();
  const focusSelected = () => { if (!selectedFeature) return; const points = geometryBounds(selectedFeature.geometry); if (points) map.flyToBounds(points, { duration: 0.45, padding: MAP_FOCUS_PADDING, maxZoom: 15 }); };
  return <div className="absolute right-4 top-4 z-[500] flex flex-col gap-2"><div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"><ControlButton label="Phóng to" onClick={() => map.zoomIn()}><Plus size={17} /></ControlButton><ControlButton label="Thu nhỏ" onClick={() => map.zoomOut()} border><Minus size={17} /></ControlButton></div><ControlButton label="Về toàn cảnh" onClick={() => map.flyTo(MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, { duration: 0.5 })} standalone><RotateCcw size={17} /></ControlButton><ControlButton label="Đến phường đang chọn" onClick={focusSelected} disabled={!selectedFeature} standalone><LocateFixed size={17} /></ControlButton></div>;
}

function ControlButton({ label, onClick, disabled = false, border = false, standalone = false, children }: { label: string; onClick: () => void; disabled?: boolean; border?: boolean; standalone?: boolean; children: React.ReactNode }) {
  return <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className={`${standalone ? "rounded-xl border border-slate-200 shadow-lg" : border ? "border-t border-slate-200" : ""} grid size-11 place-items-center bg-white text-slate-700 transition hover:bg-slate-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-300`}>{children}</button>;
}

function featureZoneId(feature: WardFeature) { return zoneId(feature.properties.districtId, compactZoneName(feature.properties.wardKey)); }

function loadBoundaries() {
  boundariesRequest ??= fetch("/data/hcm-legacy-wards.geojson", { cache: "no-cache" }).then((response) => {
    if (!response.ok) throw new Error("Không thể tải ranh giới hành chính");
    return response.json() as Promise<FeatureCollection<Geometry, WardProperties>>;
  }).catch((error) => { boundariesRequest = null; throw error; });
  return boundariesRequest;
}

function loadRegions() {
  regionsRequest ??= fetch("/data/hcm-operating-regions.geojson", { cache: "no-cache" }).then((response) => {
    if (!response.ok) throw new Error("Không thể tải ranh giới khu vực");
    return response.json() as Promise<FeatureCollection<Geometry, RegionProperties>>;
  }).catch((error) => { regionsRequest = null; throw error; });
  return regionsRequest;
}

function geometryContainsPoint(geometry: Geometry, lat: number, lng: number) {
  if (geometry.type === "Polygon") return polygonContainsPoint(geometry.coordinates, lat, lng);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some((polygon) => polygonContainsPoint(polygon, lat, lng));
  return false;
}

function polygonContainsPoint(rings: number[][][], lat: number, lng: number) {
  const [outerRing, ...holes] = rings;
  if (!outerRing || !ringContainsPoint(outerRing, lat, lng)) return false;
  return !holes.some((ring) => ringContainsPoint(ring, lat, lng));
}

function ringContainsPoint(ring: number[][], lat: number, lng: number) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index];
    const before = ring[previous];
    if (!current || !before) continue;
    const [currentLng, currentLat] = current;
    const [beforeLng, beforeLat] = before;
    const crosses = currentLat > lat !== beforeLat > lat;
    if (crosses && lng < ((beforeLng - currentLng) * (lat - currentLat)) / (beforeLat - currentLat) + currentLng) inside = !inside;
  }
  return inside;
}
