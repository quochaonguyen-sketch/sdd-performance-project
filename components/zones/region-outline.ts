import type { Feature, Geometry } from "geojson";

// Overview outlines omit internal seams; original geometry still controls fill and clicks.
export function regionOutline(feature: Feature<Geometry>): Feature<Geometry> {
  const geometry = feature.geometry;
  if (geometry.type === "Polygon") return { ...feature, geometry: { ...geometry, coordinates: geometry.coordinates.slice(0, 1) } };
  if (geometry.type === "MultiPolygon") return { ...feature, geometry: { ...geometry, coordinates: geometry.coordinates.map((polygon) => polygon.slice(0, 1)) } };
  return feature;
}
