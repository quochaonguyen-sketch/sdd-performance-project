import test from "node:test";
import assert from "node:assert/strict";
import { regionOutline } from "../components/zones/region-outline.ts";
import type { Feature, Polygon, MultiPolygon } from "geojson";

test("overview outlines hide internal seams without changing source geometry", () => {
  const exterior = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]];
  const hole = [[1, 1], [2, 1], [2, 2], [1, 1]];
  const polygon: Feature<Polygon> = { type: "Feature", properties: { id: "KV1" }, geometry: { type: "Polygon", coordinates: [exterior, hole] } };
  const multi: Feature<MultiPolygon> = { ...polygon, geometry: { type: "MultiPolygon", coordinates: [[exterior, hole], [exterior, hole]] } };
  assert.deepEqual(regionOutline(polygon).geometry, { type: "Polygon", coordinates: [exterior] });
  assert.deepEqual(regionOutline(multi).geometry, { type: "MultiPolygon", coordinates: [[exterior], [exterior]] });
  assert.equal(polygon.geometry.coordinates.length, 2);
  assert.equal(multi.geometry.coordinates[0].length, 2);
});
