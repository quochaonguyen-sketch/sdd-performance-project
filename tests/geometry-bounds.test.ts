import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { FeatureCollection, Geometry } from "geojson";
import { geometryBounds } from "../components/zones/geometry-bounds.ts";

test("bounds handle nested geometries, holes, empty collections and reuse cached results", () => {
  const geometry: Geometry = { type: "GeometryCollection", geometries: [
    { type: "Point", coordinates: [106, 10, 12] },
    { type: "MultiPolygon", coordinates: [[[[105, 9], [107, 11], [105, 9]], [[106, 10], [106.1, 10.1]]]] },
  ] };
  assert.deepEqual(geometryBounds(geometry), [[9, 105], [11, 107]]);
  assert.equal(geometryBounds(geometry), geometryBounds(geometry));
  assert.equal(geometryBounds({ type: "GeometryCollection", geometries: [] }), null);
  assert.equal(geometryBounds({ type: "Point", coordinates: [NaN, Infinity] }), null);
});

test("every shipped map feature has the same bounds as an independent coordinate scan", () => {
  for (const file of ["hcm-legacy-wards", "hcm-operating-regions"]) {
    const data = JSON.parse(readFileSync(`public/data/${file}.geojson`, "utf8")) as FeatureCollection;
    for (const feature of data.features) {
      const coords = (feature.geometry as Exclude<Geometry, { type: "GeometryCollection" }>).coordinates.flat(Infinity) as number[];
      const lngs = coords.filter((_, i) => i % 2 === 0), lats = coords.filter((_, i) => i % 2 === 1);
      assert.deepEqual(geometryBounds(feature.geometry), [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]]);
    }
  }
});
