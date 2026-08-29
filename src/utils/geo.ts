import type { Map } from "maplibre-gl";

function visitPositions(
  coords: unknown,
  visit: (lng: number, lat: number) => void,
): void {
  if (!Array.isArray(coords) || coords.length === 0) return;
  if (typeof coords[0] === "number") {
    const lng = coords[0];
    const lat = coords[1];
    if (Number.isFinite(lng) && Number.isFinite(lat)) visit(lng, lat);
    return;
  }
  for (const child of coords) visitPositions(child, visit);
}

export function boundsOfGeometry(
  geometry: GeoJSON.Geometry,
): [number, number, number, number] | null {
  if (geometry.type === "GeometryCollection") {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const child of geometry.geometries) {
      const b = boundsOfGeometry(child);
      if (!b) continue;
      minX = Math.min(minX, b[0]);
      minY = Math.min(minY, b[1]);
      maxX = Math.max(maxX, b[2]);
      maxY = Math.max(maxY, b[3]);
    }
    if (!Number.isFinite(minX)) return null;
    return [minX, minY, maxX, maxY];
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  visitPositions(
    "coordinates" in geometry ? geometry.coordinates : undefined,
    (lng, lat) => {
    minX = Math.min(minX, lng);
    minY = Math.min(minY, lat);
    maxX = Math.max(maxX, lng);
    maxY = Math.max(maxY, lat);
  });
  if (!Number.isFinite(minX)) return null;
  return [minX, minY, maxX, maxY];
}

export function zoomToFeature(map: Map, feature: GeoJSON.Feature): void {
  const geometry = feature.geometry;
  if (!geometry) return;
  if (geometry.type === "Point") {
    const [lng, lat] = geometry.coordinates;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    map.easeTo({
      center: [lng, lat],
      zoom: Math.max(map.getZoom(), 16),
      duration: 400,
    });
    return;
  }
  const bounds = boundsOfGeometry(geometry);
  if (!bounds) return;
  map.fitBounds(
    [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]],
    ],
    { padding: 72, maxZoom: 17, duration: 400 },
  );
}
