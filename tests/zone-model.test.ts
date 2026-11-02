import test from "node:test";
import assert from "node:assert/strict";
import { buildBinhChanhPlan, buildZoneModel, INITIAL_ZONE_FILTERS, matchesZoneFilters, zoneDistrictsForArea, zoneMapLevel, zoneDistrictForLocation } from "../components/zones/zone-model.ts";
import { readFileSync } from "node:fs";
import { MAP_DISTRICTS, zoneId } from "../components/zones/zone-map-types.ts";
import type { ZoneRider } from "../components/zones/zone-map-types.ts";

const rider = (extra: Partial<ZoneRider> = {}): ZoneRider => ({ id: "1", rider_code: "R1", full_name: "Rider", kv: "KV5", home_district: "Gò Vấp", cot: "COT1", pickup_district: "Gò Vấp", pickup_ward: "p1", delivery_district: "Gò Vấp", delivery_ward: "p1", status: "active", ...extra });

test("district choices follow the five-area plan even without riders", () => {
  assert.deepEqual(zoneDistrictsForArea("KV1").map((d) => d.shortName).sort(), ["Bình Chánh", "Quận 10", "Quận 11", "Quận 5", "Quận 6", "Quận 8"].sort());
  assert.deepEqual(zoneDistrictsForArea("KV5").map((d) => d.shortName).sort(), ["Gò Vấp", "Quận 12", "Hóc Môn", "Thủ Đức"].sort());
  assert.equal(zoneDistrictsForArea("KV2").some((d) => d.id === "thu-duc"), false);
  assert.ok(zoneDistrictsForArea("KV2").some((d) => d.id === "quan-2"));
  assert.ok(zoneDistrictsForArea("KV2").some((d) => d.id === "quan-9"));
  assert.equal(zoneDistrictsForArea("KV5").find((d) => d.id === "thu-duc")?.name, "Quận Thủ Đức");
  assert.ok(zoneDistrictsForArea("KV3").some((d) => d.id === "binh-chanh"));
  assert.equal(buildZoneModel([], "delivery", "KV5").zones.length, 0, "empty wards never appear");
});

test("canonical and source wards are both retained, aliases do not duplicate a rider", () => {
  const result = buildZoneModel([rider({ delivery_ward: "p1, Phường 1, Phường mới" })], "delivery", "KV5");
  assert.equal(result.ridersByZone.get("go-vap:1")?.length, 1);
  assert.equal(result.ridersByZone.get("go-vap:moi")?.length, 1);
  assert.equal(result.zones.filter((z) => z.id === "go-vap:1").length, 1);
  assert.equal(result.unlocatedCount, 0);
});

test("shared districts retain area coverage while counts only include the selected KV", () => {
  const rows = [rider({ kv: "KV1", delivery_district: "Bình Chánh", delivery_ward: "Bình Hưng" }), rider({ id: "2", kv: "KV3", delivery_district: "Bình Chánh", delivery_ward: "Bình Hưng" }), rider({ id: "3", kv: "KV6" })];
  const all = buildZoneModel(rows, "delivery", "all");
  assert.equal(all.scopedRiders.length, 2);
  assert.equal(all.ridersByZone.get("binh-chanh:binhhung")?.length, 2);
  const kv3 = buildZoneModel(rows, "delivery", "KV3");
  const zone = kv3.zones.find((z) => z.id === "binh-chanh:binhhung")!;
  assert.deepEqual(zone.areas, ["KV3"]);
  assert.equal(zone.riderCount, 1);
  assert.equal(matchesZoneFilters(zone, { ...INITIAL_ZONE_FILTERS, area: "KV3", query: "binh chanh" }), true);
  assert.equal(matchesZoneFilters(zone, { ...INITIAL_ZONE_FILTERS, districtId: "go-vap" }), false);
});

test("city-wide Thu Duc source rows resolve to the three former districts by ward", () => {
  for (const [ward, id] of [["P. An Phú", "quan-2"], ["Long Bình", "quan-9"], ["Phường Linh Trung", "thu-duc"]]) {
    assert.equal(zoneDistrictForLocation("Thành phố Thủ Đức", ward)?.id, id);
  }
  assert.equal(zoneDistrictForLocation("Quận 2", "An Phú")?.id, "quan-2");
  assert.equal(zoneDistrictForLocation("Quận 9", "Long Bình")?.id, "quan-9");
  assert.equal(zoneDistrictForLocation("Quận Thủ Đức", "Linh Trung")?.name, "Quận Thủ Đức");
  const rows = [rider({ kv: "KV2", delivery_district: "TP. Thủ Đức", delivery_ward: "P. An Phú / Long Bình" }), rider({ id: "2", kv: "KV5", delivery_district: "Thủ Đức", delivery_ward: "Linh Trung" })];
  const model = buildZoneModel(rows, "delivery", "all");
  assert.equal(model.ridersByZone.get("quan-2:anphu")?.length, 1);
  assert.equal(model.ridersByZone.get("quan-9:longbinh")?.length, 1);
  assert.equal(model.ridersByZone.get("thu-duc:linhtrung")?.length, 1);
  assert.equal(model.unlocatedCount, 0);
  assert.equal(buildZoneModel(rows, "delivery", "KV2").zones.some((zone) => zone.districtId === "thu-duc"), false);
});

test("missing locations are accounted for and home mode uses district groups", () => {
  const rows = [rider(), rider({ id: "2", delivery_ward: null }), rider({ id: "3", delivery_district: "Quận 1", delivery_ward: "Phường 1" })];
  assert.equal(buildZoneModel(rows, "delivery", "KV5").unlocatedCount, 2);
  const home = buildZoneModel(rows, "home", "KV5");
  assert.equal(home.zones.length, 1);
  assert.equal(home.zones[0].riderCount, 3);
  assert.equal(buildZoneModel([rider({ status: "inactive" })], "pickup", "KV5").zones.length, 0);
  assert.equal(buildZoneModel(rows, "delivery", "KV5").districtRiderCounts.get("go-vap"), 2, "district totals include riders without a ward");
});

test("map starts with five areas, drills down and returns through the same hierarchy", () => {
  assert.equal(zoneMapLevel(INITIAL_ZONE_FILTERS), "area");
  const area = { ...INITIAL_ZONE_FILTERS, area: "KV1" as const };
  assert.equal(zoneMapLevel(area), "district");
  const district = { ...area, districtId: "quan-6" };
  assert.equal(zoneMapLevel(district), "ward");
  assert.equal(zoneMapLevel({ ...district, wardId: "quan-6:1" }), "ward");
  assert.equal(zoneMapLevel({ ...district, districtId: "all", wardId: "all" }), "district");
  assert.equal(zoneMapLevel(INITIAL_ZONE_FILTERS, true), "ward", "address lookup opens ward detail directly");
});

test("every planned district has map geometry and all five area shapes have labels", () => {
  const regions = JSON.parse(readFileSync(new URL("../public/data/hcm-operating-regions.geojson", import.meta.url), "utf8"));
  const areas = regions.features.filter((feature: { properties: { kind: string } }) => feature.properties.kind === "area");
  assert.deepEqual(areas.map((feature: { properties: { id: string } }) => feature.properties.id), ["KV1", "KV2", "KV3", "KV4", "KV5"]);
  const shared = regions.features.filter((feature: { properties: { kind: string } }) => feature.properties.kind === "shared");
  assert.equal(shared.length, 0, "Bình Chánh has no shared grey region");
  for (const area of areas) {
    assert.equal(area.properties.labelPosition.length, 2);
    assert.ok(area.geometry.coordinates.length);
  }
  for (const district of MAP_DISTRICTS) {
    assert.ok(regions.features.some((feature: { properties: { kind: string; id: string } }) => feature.properties.kind === "district" && feature.properties.id === district.id), district.id);
    assert.ok(district.wards.length > 0, district.id);
  }
  const wards = JSON.parse(readFileSync(new URL("../public/data/hcm-legacy-wards.geojson", import.meta.url), "utf8"));
  const zones = new Set(MAP_DISTRICTS.flatMap((district) => district.wards.map((ward) => zoneId(district.id, ward))));
  const ids = wards.features.map((feature: { properties: { districtId: string; wardKey: string } }) => zoneId(feature.properties.districtId, feature.properties.wardKey));
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(zones.has(id), id);
});

test("Bình Chánh is assigned by named wards in Plan, excluding backup and rejecting conflicts", () => {
  const planRows = [
    rider({ kv: "KV1", delivery_district: "Bình Chánh", delivery_ward: "Xã Bình Hưng - Xã Phong Phú" }),
    rider({ kv: "KV3", delivery_district: "Huyện Bình Chánh", delivery_ward: "Phạm Văn Hai / Tân Kiên / Vĩnh Lộc A / Vĩnh Lộc B" }),
    rider({ kv: "KV1", delivery_district: "Bình Chánh", delivery_ward: "BACKUP" }),
  ];
  const plan = buildBinhChanhPlan(planRows);
  assert.deepEqual(plan, { binhhung: "KV1", phongphu: "KV1", phamvanhai: "KV3", tankien: "KV3", vinhloca: "KV3", vinhlocb: "KV3" });
  assert.throws(() => buildBinhChanhPlan([...planRows, rider({ kv: "KV3", delivery_district: "Bình Chánh", delivery_ward: "Bình Hưng" })]), /cả KV1 và KV3/);
  const rows = [
    rider({ kv: "KV1", delivery_district: "Bình Chánh", delivery_ward: "Bình Hưng" }),
    rider({ id: "2", kv: "KV3", delivery_district: "Bình Chánh", delivery_ward: "Vĩnh Lộc A" }),
    rider({ id: "3", kv: "KV3", delivery_district: "Bình Chánh", delivery_ward: "Tân Kiên", status: "inactive" }),
    rider({ id: "4", kv: "KV1", delivery_district: "Bình Chánh", delivery_ward: "BACKUP" }),
    rider({ id: "5", kv: "KV1", delivery_district: "Bình Chánh", delivery_ward: "Vĩnh Lộc B" }),
    rider({ id: "6", kv: "KV2", delivery_district: "Quận 9", delivery_ward: "Long Bình" }),
    rider({ id: "7", kv: "KV2", delivery_district: "Quận 9", delivery_ward: "Phú Hữu", status: "inactive" }),
  ];
  const all = buildZoneModel(rows, "delivery", "all", plan);
  assert.deepEqual(all.zones.map((zone) => zone.id).sort(), ["binh-chanh:binhhung", "binh-chanh:vinhloca", "quan-9:longbinh"].sort());
  assert.deepEqual(buildZoneModel(rows, "delivery", "KV1", plan).zones.map((zone) => zone.ward), ["Bình Hưng"]);
  assert.deepEqual(buildZoneModel(rows, "delivery", "KV3", plan).zones.map((zone) => zone.ward), ["Vĩnh Lộc A"]);
  assert.deepEqual(all.zones.find((zone) => zone.ward === "Bình Hưng")?.areas, ["KV1"]);
  assert.deepEqual(all.zones.find((zone) => zone.ward === "Vĩnh Lộc A")?.areas, ["KV3"]);
});
