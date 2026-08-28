import type { Map, StyleSpecification } from "maplibre-gl";
import type { MaplibreTerradrawControl } from "@watergis/maplibre-gl-terradraw";
import type { GeoJSONStoreFeatures } from "terra-draw";
import type { GeoPortalState } from "../../types/geoportal";

export const TERRA_DRAW_LAYER_IDS = [
  "td-polygon",
  "td-polygon-outline",
  "td-linestring",
  "td-point",
  "td-point-marker",
] as const;

const PERSISTED_MODES = new Set([
  "point",
  "linestring",
  "polygon",
  "rectangle",
  "circle",
]);

export type AppDrawMode = GeoPortalState["drawMode"];

export function toTerraDrawMode(mode: AppDrawMode): string {
  switch (mode) {
    case "point":
      return "point";
    case "line":
      return "linestring";
    case "polygon":
      return "polygon";
    case "rectangle":
      return "rectangle";
    case "circle":
      return "circle";
    case "select":
      return "select";
    default:
      return "render";
  }
}

export function snapshotToFeatureCollection(
  snapshot: GeoJSONStoreFeatures[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: snapshot.filter((feature) =>
      PERSISTED_MODES.has(String(feature.properties?.mode ?? "")),
    ),
  };
}

const TERRA_DRAW_GEOMETRY_TYPES = new Set(["Point", "LineString", "Polygon"]);

type TerraDrawLike = {
  enabled: boolean;
  getSnapshot: () => GeoJSONStoreFeatures[];
  addFeatures: (features: GeoJSONStoreFeatures[]) => Array<{
    valid?: boolean;
    reason?: string;
    id?: string | number;
  }>;
};

function inferPersistedMode(feature: GeoJSON.Feature): string | null {
  const mode = feature.properties?.mode;
  if (typeof mode === "string" && PERSISTED_MODES.has(mode)) return mode;
  switch (feature.geometry?.type) {
    case "Point":
      return "point";
    case "LineString":
      return "linestring";
    case "Polygon":
      return "polygon";
    default:
      return null;
  }
}

function toTerraDrawFeature(
  feature: GeoJSON.Feature,
): GeoJSONStoreFeatures | null {
  if (!feature.geometry) return null;
  if (!TERRA_DRAW_GEOMETRY_TYPES.has(feature.geometry.type)) return null;
  const mode = inferPersistedMode(feature);
  if (!mode) return null;
  if (typeof feature.id !== "string" && typeof feature.id !== "number") {
    return null;
  }
  const raw: Record<string, unknown> = { ...(feature.properties ?? {}) };
  delete raw.selected;
  raw.mode = mode;
  let properties: GeoJSONStoreFeatures["properties"];
  try {
    properties = JSON.parse(JSON.stringify(raw)) as GeoJSONStoreFeatures["properties"];
  } catch {
    properties = { mode };
  }
  return {
    type: "Feature",
    id: feature.id,
    geometry: feature.geometry as GeoJSONStoreFeatures["geometry"],
    properties,
  };
}

/** Restaura features en Terra Draw sin duplicar ids ya presentes (StrictMode / style reload). */
export function restoreFeaturesToTerraDraw(
  instance: TerraDrawLike | null | undefined,
  collection: GeoJSON.FeatureCollection,
): void {
  if (!instance?.enabled) return;
  if (collection.features.length === 0) return;
  const existingIds = new Set(
    instance.getSnapshot().map((feature) => String(feature.id)),
  );
  const toAdd: GeoJSONStoreFeatures[] = [];
  const addedIds = new Set<string>();
  for (const feature of collection.features) {
    const next = toTerraDrawFeature(feature);
    if (!next) continue;
    if (next.id != null) {
      const key = String(next.id);
      if (existingIds.has(key) || addedIds.has(key)) continue;
      addedIds.add(key);
    }
    toAdd.push(next);
  }
  if (toAdd.length === 0) return;
  try {
    const results = instance.addFeatures(toAdd);
    const failed = results.filter((result) => result.valid === false);
    if (failed.length > 0) {
      console.warn("[draw] failed to restore features", failed);
    }
  } catch (err) {
    console.warn("[draw] failed to restore features", err);
  }
}

export function moveTerraDrawLayersToTop(map: Map) {
  for (const id of TERRA_DRAW_LAYER_IDS) {
    if (map.getLayer(id)) {
      try {
        map.moveLayer(id);
      } catch {
        /* style may be swapping */
      }
    }
  }
}

export function mergeTerraDrawStyle(
  control: MaplibreTerradrawControl,
  previous: StyleSpecification | undefined,
  next: StyleSpecification,
): StyleSpecification {
  if (!previous) return next;
  try {
    const td = control.cleanStyle(previous, { onlyTerraDrawLayers: true });
    return {
      ...next,
      sources: { ...next.sources, ...td.sources },
      layers: [...next.layers, ...(td.layers ?? [])],
    };
  } catch (err) {
    console.warn("[draw] failed to preserve draw layers in style", err);
    return next;
  }
}

export function logDrawLayerIds(map: Map, reason: string) {
  const ids = (map.getStyle()?.layers ?? [])
    .map((layer) => layer.id)
    .filter((id) => id.startsWith("td-"));
  console.log(`[draw] ${reason}`, ids);
}

/** Style JSON listo para addSource/addLayer. No espera tiles del basemap. */
export function whenStyleJsonReady(map: Map, cb: () => void) {
  const style = (map as any).style;
  if (style?._loaded) {
    cb();
    return;
  }
  map.once("style.load", cb);
}

export function startTerraDraw(control: MaplibreTerradrawControl) {
  try {
    control.activate();
  } catch {
    /* already active */
  }
  const instance = control.getTerraDrawInstance();
  if (instance && !instance.enabled) {
    try {
      instance.start();
    } catch {
      /* already started */
    }
  }
  return instance;
}

export function restartTerraDrawIfLayersMissing(
  map: Map,
  control: MaplibreTerradrawControl,
) {
  const instance = control.getTerraDrawInstance();
  if (!instance) return;
  if (map.getSource("td-point")) {
    moveTerraDrawLayersToTop(map);
    return;
  }
  console.log("[draw] restoring draw layers");
  const snapshot = instance.enabled ? instance.getSnapshot() : [];
  try {
    if (instance.enabled) instance.stop();
  } catch {
    /* layers already gone with the style */
  }
  try {
    instance.start();
  } catch (err) {
    console.warn("[draw] restart failed", err);
  }
  if (snapshot.length > 0) {
    try {
      instance.addFeatures(snapshot);
    } catch (err) {
      console.warn("[draw] failed to restore features", err);
    }
  }
  moveTerraDrawLayersToTop(map);
}
