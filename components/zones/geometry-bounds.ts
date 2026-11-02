import type { Geometry, Position } from "geojson";

type Bounds = [[number, number], [number, number]];
const cache = new WeakMap<Geometry, Bounds | null>();

// Fetched geometries are immutable; cache bounds without allocating Leaflet layers.
export function geometryBounds(geometry: Geometry): Bounds | null {
  if (cache.has(geometry)) return cache.get(geometry)!;
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  function visit(value: Position | Position[] | Position[][] | Position[][][]) {
    if (typeof value[0] === "number") {
      const [lng, lat] = value as Position;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
      west = Math.min(west, lng); south = Math.min(south, lat);
      east = Math.max(east, lng); north = Math.max(north, lat);
    } else for (const child of value) visit(child as Position | Position[] | Position[][]);
  }
  if (geometry.type === "GeometryCollection") {
    for (const child of geometry.geometries) {
      const bounds = geometryBounds(child);
      if (bounds) { visit([bounds[0][1], bounds[0][0]]); visit([bounds[1][1], bounds[1][0]]); }
    }
  } else visit(geometry.coordinates);
  const result: Bounds | null = west === Infinity ? null : [[south, west], [north, east]];
  cache.set(geometry, result);
  return result;
}
