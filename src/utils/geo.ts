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

function pointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function ringDistancePx(
  map: Map,
  point: { x: number; y: number },
  ring: GeoJSON.Position[],
): number {
  let min = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = map.project(ring[i] as [number, number]);
    const b = map.project(ring[i + 1] as [number, number]);
    min = Math.min(min, pointToSegmentDistance(point.x, point.y, a.x, a.y, b.x, b.y));
  }
  return min;
}

function pointInRing(lng: number, lat: number, ring: GeoJSON.Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Distancia en píxeles del clic a la geometría. 0 si el punto está dentro de un polígono. */
export function distanceToFeaturePx(
  map: Map,
  point: { x: number; y: number },
  feature: GeoJSON.Feature,
): number {
  const geometry = feature.geometry;
  if (!geometry) return Infinity;
  if (geometry.type === "Point") {
    const projected = map.project(geometry.coordinates as [number, number]);
    return Math.hypot(projected.x - point.x, projected.y - point.y);
  }
  if (geometry.type === "MultiPoint") {
    let min = Infinity;
    for (const coords of geometry.coordinates) {
      const projected = map.project(coords as [number, number]);
      min = Math.min(min, Math.hypot(projected.x - point.x, projected.y - point.y));
    }
    return min;
  }
  if (geometry.type === "LineString") {
    return ringDistancePx(map, point, geometry.coordinates);
  }
  if (geometry.type === "MultiLineString") {
    let min = Infinity;
    for (const line of geometry.coordinates) {
      min = Math.min(min, ringDistancePx(map, point, line));
    }
    return min;
  }
  if (geometry.type === "Polygon") {
    const lngLat = map.unproject([point.x, point.y]);
    const rings = geometry.coordinates;
    if (rings[0] && pointInRing(lngLat.lng, lngLat.lat, rings[0])) {
      const inHole = rings.slice(1).some((ring) =>
        pointInRing(lngLat.lng, lngLat.lat, ring),
      );
      if (!inHole) return 0;
    }
    let min = Infinity;
    for (const ring of rings) min = Math.min(min, ringDistancePx(map, point, ring));
    return min;
  }
  if (geometry.type === "MultiPolygon") {
    const lngLat = map.unproject([point.x, point.y]);
    let min = Infinity;
    for (const polygon of geometry.coordinates) {
      if (polygon[0] && pointInRing(lngLat.lng, lngLat.lat, polygon[0])) {
        const inHole = polygon.slice(1).some((ring) =>
          pointInRing(lngLat.lng, lngLat.lat, ring),
        );
        if (!inHole) return 0;
      }
      for (const ring of polygon) {
        min = Math.min(min, ringDistancePx(map, point, ring));
      }
    }
    return min;
  }
  return Infinity;
}

export function boundsOfFeatureCollection(
  fc: GeoJSON.FeatureCollection,
): [number, number, number, number] | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const feature of fc.features) {
    if (!feature.geometry) continue;
    const b = boundsOfGeometry(feature.geometry);
    if (!b) continue;
    minX = Math.min(minX, b[0]);
    minY = Math.min(minY, b[1]);
    maxX = Math.max(maxX, b[2]);
    maxY = Math.max(maxY, b[3]);
  }
  if (!Number.isFinite(minX)) return null;
  return [minX, minY, maxX, maxY];
}

export function zoomToFeatureCollection(
  map: Map,
  fc: GeoJSON.FeatureCollection,
): void {
  const bounds = boundsOfFeatureCollection(fc);
  if (!bounds) return;
  if (bounds[0] === bounds[2] && bounds[1] === bounds[3]) {
    map.easeTo({
      center: [bounds[0], bounds[1]],
      zoom: Math.max(map.getZoom(), 16),
      duration: 400,
    });
    return;
  }
  map.fitBounds(
    [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]],
    ],
    { padding: 72, maxZoom: 17, duration: 400 },
  );
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
