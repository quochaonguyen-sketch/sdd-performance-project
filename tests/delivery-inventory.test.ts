import test from "node:test";
import assert from "node:assert/strict";
import { THU_DUC_LEGACY_WARDS, legacyThuDucWardName } from "../lib/locations/operational-districts.ts";
import { buildAnalytics, buildDeliveryDistrictBoards, deliveryInventoryRows, districtKey, filterBoard, focusKey, scopeDeliveryBoards, type InventoryRow } from "../components/lmhub-inventory/lmhub-inventory-model.ts";

const order = (ward: string, district = "Thành phố Thủ Đức", cot = "COT1"): InventoryRow => ({
  snapshot_id: "snapshot", snapshot_at: null, shipment_id: ward, received_time: null, ward, district,
  area: "KV5", zone_id: "", status: "Delivering", order_type: "", cot_group: cot,
});

test("the twelve legacy Thu Duc wards keep their source name normalization", () => {
  for (const ward of THU_DUC_LEGACY_WARDS) assert.equal(legacyThuDucWardName(`Phường ${ward}`), ward);
  assert.equal(legacyThuDucWardName("P. LINH XUÂN"), "Linh Xuân");
  assert.equal(legacyThuDucWardName("phuong hiep binh chanh"), "Hiệp Bình Chánh");
  assert.equal(deliveryInventoryRows([order("P. Tam Bình")])[0].ward, "Phường Tam Bình");
});

test("all wards inside a valid KV remain available regardless of the former district coverage", () => {
  const outside = ["Cát Lái", "An Phú", "Thảo Điền", "Phước Long B", "An Khánh", "Phước Long A", "Bình Trưng Tây", "Thạnh Mỹ Lợi", "Phước Bình", "Bình Trưng Đông", "An Lợi Đông", "Thủ Thiêm"];
  const rows = [...outside.map((ward) => order(`Phường ${ward}`)), order("Linh Đông"), order("", "Thủ Đức"), order("Chưa xác định", "Thủ Đức")];
  assert.equal(deliveryInventoryRows(rows).length, rows.length);
});

test("coverage totals include every valid KV without a former geography exclusion", () => {
  const boards = buildDeliveryDistrictBoards([order("Cát Lái"), order("Linh Đông"), order("Tam Phú", "Thủ Đức", "COT2"), order("Phường 1", "Gò Vấp"), order("Hiệp Thành", "Quận 12"), order("Bà Điểm", "Hóc Môn")]);
  assert.equal(boards.length, 5);
  const thuDuc = boards.find((board) => board.district === "Thủ Đức")!;
  assert.equal(thuDuc.totals.total, 2);
  assert.equal(thuDuc.totals.cot1, 1);
  assert.equal(thuDuc.totals.cot2, 1);
  assert.equal(buildAnalytics(boards, [], "all").visible, 6);
});

test("an out-of-scope snapshot contributes no inventory", () => {
  const boards = buildDeliveryDistrictBoards([{ ...order("Cát Lái"), area: "KV6" }, { ...order("Thảo Điền"), area: "BK" }]);
  assert.deepEqual(boards, []);
  assert.equal(buildAnalytics(boards, [], "all").visible, 0);
});

test("search and priority filters recompute totals from the wards actually displayed", () => {
  const boards = buildDeliveryDistrictBoards([order("Linh Đông"), order("Tam Phú", "Thủ Đức", "COT2")]);
  const filtered = filterBoard(boards, "Linh Đông", "all", "all");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].totals.total, 1);
  assert.equal(filtered[0].totals.cot2, 0);
  assert.equal(filterBoard(boards, "", "all", "hot").length, 0);
});

test("geographic scope keeps identically named districts and wards in separate areas", () => {
  const boards = buildDeliveryDistrictBoards([
    { ...order("Phường 1", "Gò Vấp"), area: "KV1" },
    { ...order("Phường 1", "Gò Vấp", "COT2"), area: "KV2" },
    { ...order("Phường 2", "Gò Vấp"), area: "KV2" },
  ]);
  const scoped = scopeDeliveryBoards(boards, "all", districtKey("KV2", "Gò Vấp"), "all");
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0].area, "KV2");
  assert.equal(scoped[0].totals.total, 2);
  const ward = scopeDeliveryBoards(boards, "KV2", "all", focusKey({ area: "KV2", district: "Gò Vấp", ward: "Phường 1" }));
  assert.deepEqual(ward[0].totals, { total: 1, cot1: 0, cot2: 1 });
  assert.deepEqual(scopeDeliveryBoards(boards, "KV1", districtKey("KV2", "Gò Vấp"), "all"), []);
});

test("priority counts, charts and COT totals follow the visible scope", () => {
  const boards = buildDeliveryDistrictBoards([
    ...Array.from({ length: 20 }, () => order("Linh Đông", "Thủ Đức", "COT1")),
    ...Array.from({ length: 20 }, () => order("Linh Đông", "Thủ Đức", "COT2")),
    order("Tam Phú", "Thủ Đức", "COT2"),
  ]);
  assert.equal(buildAnalytics(boards, [], "all").hotWards, 1);
  const analytics = buildAnalytics(filterBoard(boards, "Linh Đông", "cot1", "all"), [], "cot1");
  assert.equal(analytics.visible, 20);
  assert.equal(analytics.cot1, 20);
  assert.equal(analytics.cot2, 0);
  assert.equal(analytics.hotWards, 0);
  assert.equal(analytics.topDistricts[0].value, 20);
  assert.equal(buildAnalytics(filterBoard(boards, "", "cot1", "hot"), [], "cot1").visible, 0);
});
