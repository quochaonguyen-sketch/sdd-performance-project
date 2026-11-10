import test from "node:test";
import assert from "node:assert/strict";
import {
  maskDeliveryRow,
  maskPickupMetrics,
  maskPerformanceRow,
  type VolumeMaskScope,
} from "../lib/rider-volume-mask/calculations.ts";

test("maskDeliveryRow reduces volume by factor when rider has active mask", () => {
  const masks = new Map<string, { factor: number; scope: VolumeMaskScope }>([
    ["149603", { factor: 0.5, scope: "all" }],
    ["888999", { factor: 0.7, scope: "delivery" }],
    ["111222", { factor: 0.5, scope: "pickup" }], // scope pickup should NOT affect delivery
  ]);

  const rider1 = {
    driver_id: "149603",
    total_assigned: 50,
    delivered: 40,
    delivering: 6,
    failed: 4,
  };

  const masked1 = maskDeliveryRow(rider1, masks);
  assert.equal(masked1.delivered, 20); // 40 * 0.5
  assert.equal(masked1.delivering, 3); // 6 * 0.5
  assert.equal(masked1.failed, 2); // 4 * 0.5
  assert.equal(masked1.total_assigned, 25); // 50 * 0.5

  // Rider 2 with scope: delivery
  const rider2 = {
    driver_id: "888999",
    total_assigned: 100,
    delivered: 70,
    delivering: 20,
    failed: 10,
  };
  const masked2 = maskDeliveryRow(rider2, masks);
  assert.equal(masked2.delivered, 49); // 70 * 0.7
  assert.equal(masked2.delivering, 14); // 20 * 0.7
  assert.equal(masked2.failed, 7); // 10 * 0.7
  assert.equal(masked2.total_assigned, 70); // 100 * 0.7

  // Rider 3 with scope: pickup should NOT be affected in delivery
  const rider3 = {
    driver_id: "111222",
    total_assigned: 100,
    delivered: 80,
    delivering: 10,
    failed: 10,
  };
  const masked3 = maskDeliveryRow(rider3, masks);
  assert.equal(masked3.delivered, 80);
  assert.equal(masked3.total_assigned, 100);

  // Unmasked rider keeps 100% original numbers
  const unmaskedRider = {
    driver_id: "999999",
    total_assigned: 100,
    delivered: 90,
    delivering: 5,
    failed: 5,
  };
  const resultUnmasked = maskDeliveryRow(unmaskedRider, masks);
  assert.equal(resultUnmasked.delivered, 90);
  assert.equal(resultUnmasked.total_assigned, 100);
});

test("maskPickupMetrics scales pickup numbers according to configured factor", () => {
  const masks = new Map<string, { factor: number; scope: VolumeMaskScope }>([
    ["149603", { factor: 0.5, scope: "all" }],
    ["111222", { factor: 0.3, scope: "pickup" }],
    ["888999", { factor: 0.5, scope: "delivery" }], // delivery scope should not affect pickup
  ]);

  const metrics1 = {
    assigned: 100,
    picked: 90,
    onhold: 10,
  };

  const masked1 = maskPickupMetrics("149603", metrics1, masks);
  assert.equal(masked1?.assigned, 50);
  assert.equal(masked1?.picked, 45);
  assert.equal(masked1?.onhold, 5);

  const metrics2 = {
    assigned: 200,
    picked: 150,
    onhold: 20,
  };
  const masked2 = maskPickupMetrics("111222", metrics2, masks);
  assert.equal(masked2?.assigned, 60); // 200 * 0.3
  assert.equal(masked2?.picked, 45); // 150 * 0.3
  assert.equal(masked2?.onhold, 6); // 20 * 0.3

  // Delivery scope does NOT touch pickup metrics
  const masked3 = maskPickupMetrics("888999", metrics2, masks);
  assert.equal(masked3?.assigned, 200);
  assert.equal(masked3?.picked, 150);
});

test("maskPerformanceRow scales daily driver performance rows", () => {
  const masks = new Map<string, { factor: number; scope: VolumeMaskScope }>([
    ["149603", { factor: 0.5, scope: "all" }],
  ]);

  const row = {
    driver_id: "149603",
    delivery_assigned: 80,
    delivery_delivered: 70,
    pickup_assigned: 40,
    pickup_picked: 36,
  };

  const masked = maskPerformanceRow(row, masks);
  assert.equal(masked.delivery_assigned, 40);
  assert.equal(masked.delivery_delivered, 35);
  assert.equal(masked.pickup_assigned, 20);
  assert.equal(masked.pickup_picked, 18);
});
