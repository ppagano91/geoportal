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
