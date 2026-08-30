import type { Layer } from "../types/geoportal";

const GEOJSON_MIME = "application/geo+json;charset=utf-8";
const FALLBACK_FILENAME = "layer.geojson";

const EXPORTABLE_LAYER_TYPES = new Set<Layer["type"]>(["editable", "user"]);

export function isFeatureCollection(
  value: unknown,
): value is GeoJSON.FeatureCollection {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as GeoJSON.GeoJsonObject).type === "FeatureCollection" &&
    Array.isArray((value as GeoJSON.FeatureCollection).features)
  );
}

/** Capas locales con FeatureCollection (editables y GeoJSON cargado). */
export function canExportLayerToGeoJSON(layer: Layer): boolean {
  if (!EXPORTABLE_LAYER_TYPES.has(layer.type)) return false;
  return isFeatureCollection(layer.data);
}

export function geoJSONFilename(name: string | undefined): string {
  const slug = (name ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `${slug}.geojson` : FALLBACK_FILENAME;
}

/**
 * Descarga `layer.data` como GeoJSON estándar.
 * Solo lectura: no muta la capa ni el FeatureCollection.
 */
export function exportLayerToGeoJSON(layer: Layer): boolean {
  if (!canExportLayerToGeoJSON(layer) || !layer.data) return false;

  let serialized: string;
  try {
    serialized = JSON.stringify(layer.data, null, 2);
  } catch {
    return false;
  }
  if (!serialized) return false;

  const blob = new Blob([serialized], { type: GEOJSON_MIME });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = geoJSONFilename(layer.name);
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return true;
}
