import React, {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import maplibregl, { Map, StyleSpecification, SymbolLayerSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  MaplibreMeasureControl,
  MaplibreTerradrawControl,
  defaultMeasureControlOptions,
} from "@watergis/maplibre-gl-terradraw";
import "@watergis/maplibre-gl-terradraw/dist/maplibre-gl-terradraw.css";
import { GeoPortalContext, type DrawEngine, type MeasureEngine } from "../../shell/GeoPortalApp";
import { BaseMapControl } from "./BaseMapControl";
import { FeatureContextMenu } from "./FeatureContextMenu";
import { FeatureInfoDialog } from "./FeatureInfoDialog";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/Dialog";
import { Button } from "../ui/Button";
import type { EditableLayer, FeatureInfoResult, Layer } from "../../types/geoportal";
import { MiniMap } from "./MiniMap";
import { MapControls } from "./MapControls";
import { env } from "../../config/env";
import buildingsIcon from "../../assets/images/buildings.svg";
import reliefIcon from "../../assets/images/relief.svg";
import {
  logDrawLayerIds,
  mergeTerraDrawStyle,
  moveMeasureLayersToTop,
  moveTerraDrawLayersToTop,
  restartMeasureIfLayersMissing,
  restartTerraDrawIfLayersMissing,
  restoreFeaturesToTerraDraw,
  restoreMapCursor,
  snapshotToFeatureCollection,
  startMeasureControl,
  startTerraDraw,
  toMeasureTerraMode,
  toTerraDrawMode,
  whenStyleJsonReady,
  clearMeasureFeatures,
} from "./terraDraw";
import { shouldRenderDrawingLayerAsGeoJson } from "../../persistence/drawingLayers";
import {
  getDrawDocument,
  getEditableLayerById,
  isEditableLayer,
} from "../../persistence/editableLayers";
import { distanceToFeaturePx, zoomToFeature } from "../../utils/geo";
import {
  copyTextToClipboard,
  formatLngLat,
  mergeFeatureInfoResults,
  queryVectorFeatureInfo,
} from "../../utils/featureInfo";
import {
  fetchWmsFeatureInfo,
  isQueryableWmsLayer,
} from "../../utils/wms";

// import MapboxDraw from "@mapbox/mapbox-gl-draw";

// import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

const STYLE_GLYPHS = env.MAPTILER_KEY
  ? `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${env.MAPTILER_KEY}`
  : "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";

const BASEMAPS = {
  streets: {
    version: 8,
    glyphs: STYLE_GLYPHS,
    sources: {
      osm: {
        type: "raster",
        tiles: [
          "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      } as any,
    },
    layers: [{ id: "osm", type: "raster", source: "osm" } as any],
  } as any,
  satellite: {
    version: 8,
    glyphs: STYLE_GLYPHS,
    sources: {
      esri: {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution: "© Esri",
      } as any,
    },
    layers: [{ id: "esri", type: "raster", source: "esri" } as any],
  } as any,
  topo: {
    version: 8,
    glyphs: STYLE_GLYPHS,
    sources: {
      opentopo: {
        type: "raster",
        tiles: [
          "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
          "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
          "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution: "© OpenTopoMap, © OSM contributors",
      } as any,
    },
    layers: [{ id: "opentopo", type: "raster", source: "opentopo" } as any],
  } as any,
  dark: {
    version: 8,
    glyphs: STYLE_GLYPHS,
    sources: {
      carto: {
        type: "raster",
        tiles: [
          "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution: "© Stadia Maps",
      } as any,
    },
    layers: [{ id: "carto", type: "raster", source: "carto" } as any],
  } as any,
} as const;

// const INITIAL_CENTER: [number, number] = [-61.933, -38.378]; // Sierra de la Ventana
const INITIAL_CENTER: [number, number] = [-58.3819, -34.5997]; // Ciudad Autónoma de Buenos Aires
const INITIAL_ZOOM = 12;
const INITIAL_PITCH = 0;
const INITIAL_BEARING = 0;
const MAX_ZOOM = 18;
const MAX_PITCH = 85;
const TERRAIN_EXAGGERATION = 1;
const MAPTILER_KEY = env.MAPTILER_KEY;
const LAYER_CFG_CACHE_KEY = "__layerCfgCache";
const BUILDINGS_3D_SOURCE_ID = "vect-maptiler";
const BUILDINGS_3D_LAYER_ID = "buildings-3d";
const MEASURE_LABEL_TEXT_SIZE = 11;

function withMeasureLabelTextSize(
  spec: SymbolLayerSpecification,
): SymbolLayerSpecification {
  return {
    ...spec,
    layout: {
      ...spec.layout,
      "text-size": MEASURE_LABEL_TEXT_SIZE,
    },
  };
}

function getCfgCache(map: Map): Record<string, string> {
  return ((map as any)[LAYER_CFG_CACHE_KEY] ??= {});
}

function ensureBuildings3DLayer(map: Map) {
  if (!map.getSource(BUILDINGS_3D_SOURCE_ID)) {
    map.addSource(BUILDINGS_3D_SOURCE_ID, {
      type: "vector",
      url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${MAPTILER_KEY}`,
    } as any);
  }
  if (!map.getLayer(BUILDINGS_3D_LAYER_ID)) {
    map.addLayer(
      {
        id: BUILDINGS_3D_LAYER_ID,
        type: "fill-extrusion",
        source: BUILDINGS_3D_SOURCE_ID,
        "source-layer": "building",
        minzoom: 14,
        paint: {
          "fill-extrusion-color": "#aaa",
          "fill-extrusion-opacity": 0.9,
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 0],
          "fill-extrusion-base": 0,
        },
      } as any,
      (map.getStyle() as any)?.layers?.find((l: any) => l.type === "symbol")
        ?.id,
    );
  }
}

function applyBuildings3DState(map: Map, enabled: boolean) {
  if (enabled) {
    ensureBuildings3DLayer(map);
    if (map.getLayer(BUILDINGS_3D_LAYER_ID)) {
      map.setLayoutProperty(BUILDINGS_3D_LAYER_ID, "visibility", "visible");
    }
    return;
  }
  if (map.getLayer(BUILDINGS_3D_LAYER_ID)) {
    map.setLayoutProperty(BUILDINGS_3D_LAYER_ID, "visibility", "none");
  }
}

function addOrUpdateGeoJson(map: Map, layer: Layer) {
  if (!layer.data) return;
  const sourceId = `src-${layer.id}`;
  const pointLayerId = `pt-${layer.id}`; // circle simple
  const pointSymId = `pt-sym-${layer.id}`; // symbol simple
  const ptUnclusterCircleId = `pt-un-${layer.id}`; // circle unclustered
  const ptUnclusterSymbolId = `pt-us-${layer.id}`; // symbol unclustered
  const clusterLayerId = `cl-${layer.id}`;
  const clusterTextId = `cl-t-${layer.id}`;
  const lineLayerId = `ln-${layer.id}`;
  const polyFillId = `pf-${layer.id}`;
  const polyLineId = `pl-${layer.id}`;

  // recreate source if clustering config changed
  const cfgCache = getCfgCache(map);
  const cfgNow = JSON.stringify({
    c: !!layer.cluster?.enabled,
    r: layer.cluster?.radius ?? 50,
    mx: layer.cluster?.maxZoom ?? 14,
    mp: layer.cluster?.minPoints ?? 2,
  });
  const cfgPrev = cfgCache[layer.id];
  const needRecreate = !!map.getSource(sourceId) && cfgPrev !== cfgNow;
  if (needRecreate) {
    // remove dependent layers and source
    const ids = [
      pointLayerId,
      pointSymId,
      ptUnclusterCircleId,
      ptUnclusterSymbolId,
      clusterLayerId,
      clusterTextId,
      lineLayerId,
      polyFillId,
      polyLineId,
    ];
    for (const id of ids) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  }

  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "geojson",
      data: layer.data,
      cluster: layer.cluster?.enabled ?? false,
      clusterRadius: layer.cluster?.radius ?? 50,
      clusterMaxZoom: layer.cluster?.maxZoom ?? 14,
      clusterMinPoints: layer.cluster?.minPoints ?? 2,
    } as any);
    cfgCache[layer.id] = cfgNow;
  } else {
    (map.getSource(sourceId) as any).setData(layer.data);
  }

  // helper for symbol image
  function ensureSymbolImage() {
    const imgName = `img-${layer.id}`;
    const st = layer.pointStyle!;
    const base = 64;
    const canvas = document.createElement("canvas");
    canvas.width = base;
    canvas.height = base;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, base, base);
    ctx.lineWidth = st.strokeWidth;
    ctx.strokeStyle = st.strokeColor;
    ctx.fillStyle = st.color;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const cx = base / 2,
      cy = base / 2;
    const r = base * 0.35;
    switch (st.type) {
      case "square": {
        const s = r * 1.4;
        ctx.beginPath();
        ctx.rect(cx - s / 2, cy - s / 2, s, s);
        ctx.fill();
        ctx.stroke();
        break;
      }
      case "triangle": {
        const s = r * 1.6;
        ctx.beginPath();
        ctx.moveTo(cx, cy - s / 2);
        ctx.lineTo(cx - s / 2, cy + s / 2);
        ctx.lineTo(cx + s / 2, cy + s / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case "star": {
        const spikes = 5;
        const outer = r * 1.6;
        const inner = r * 0.7;
        let rot = (Math.PI / 2) * 3;
        let x = cx;
        let y = cy;
        ctx.beginPath();
        ctx.moveTo(cx, cy - outer);
        for (let i = 0; i < spikes; i++) {
          x = cx + Math.cos(rot) * outer;
          y = cy + Math.sin(rot) * outer;
          ctx.lineTo(x, y);
          rot += Math.PI / 5;
          x = cx + Math.cos(rot) * inner;
          y = cy + Math.sin(rot) * inner;
          ctx.lineTo(x, y);
          rot += Math.PI / 5;
        }
        ctx.lineTo(cx, cy - outer);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case "marker": {
        // simple pin: circle + tail
        const rr = r;
        ctx.beginPath();
        ctx.arc(cx, cy - rr * 0.2, rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy + rr * 0.9);
        ctx.lineTo(cx - rr * 0.5, cy);
        ctx.lineTo(cx + rr * 0.5, cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      default: {
        // circle handled by circle layer, but keep for symbol fallback
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    const img = {
      width: base,
      height: base,
      data: ctx.getImageData(0, 0, base, base).data,
    } as any;
    if (map.hasImage(imgName)) {
      try {
        map.updateImage(imgName, img);
      } catch {
        /* older versions may not support updateImage */
      }
      return imgName;
    }
    map.addImage(imgName, img, { pixelRatio: 2 });
    return imgName;
  }

  // Points (with optional clustering and symbol types)
  if (layer.pointStyle) {
    const isCircle = layer.pointStyle.type === "circle";
    const useCluster = !!layer.cluster?.enabled;
    // cluster layers
    if (useCluster) {
      if (!map.getLayer(clusterLayerId)) {
        map.addLayer({
          id: clusterLayerId,
          type: "circle",
          source: sourceId,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": layer.pointStyle.color,
            "circle-radius": [
              "step",
              ["get", "point_count"],
              Math.max(14, layer.pointStyle.size + 6),
              50,
              Math.max(18, layer.pointStyle.size + 10),
              100,
              Math.max(24, layer.pointStyle.size + 14),
            ],
          },
        });
      } else {
        map.setPaintProperty(
          clusterLayerId,
          "circle-color",
          layer.pointStyle.color,
        );
      }
      if (!map.getLayer(clusterTextId)) {
        map.addLayer({
          id: clusterTextId,
          type: "symbol",
          source: sourceId,
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 12,
          },
          paint: { "text-color": "#ffffff" },
        });
      }
      map.setLayoutProperty(
        clusterLayerId,
        "visibility",
        layer.visible ? "visible" : "none",
      );
      map.setLayoutProperty(
        clusterTextId,
        "visibility",
        layer.visible ? "visible" : "none",
      );
    } else {
      if (map.getLayer(clusterLayerId))
        map.setLayoutProperty(clusterLayerId, "visibility", "none");
      if (map.getLayer(clusterTextId))
        map.setLayoutProperty(clusterTextId, "visibility", "none");
    }

    // unclustered or simple points
    if (isCircle) {
      // hide symbol variants
      if (map.getLayer(pointSymId))
        map.setLayoutProperty(pointSymId, "visibility", "none");
      if (map.getLayer(ptUnclusterSymbolId))
        map.setLayoutProperty(ptUnclusterSymbolId, "visibility", "none");
      if (useCluster) {
        if (!map.getLayer(ptUnclusterCircleId)) {
          map.addLayer({
            id: ptUnclusterCircleId,
            type: "circle",
            source: sourceId,
            filter: [
              "all",
              ["!", ["has", "point_count"]],
              ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
            ],
            paint: {
              "circle-radius": layer.pointStyle.size,
              "circle-color": layer.pointStyle.color,
              "circle-stroke-color": layer.pointStyle.strokeColor,
              "circle-stroke-width": layer.pointStyle.strokeWidth,
            },
          });
        } else {
          map.setPaintProperty(
            ptUnclusterCircleId,
            "circle-radius",
            layer.pointStyle.size,
          );
          map.setPaintProperty(
            ptUnclusterCircleId,
            "circle-color",
            layer.pointStyle.color,
          );
          map.setPaintProperty(
            ptUnclusterCircleId,
            "circle-stroke-color",
            layer.pointStyle.strokeColor,
          );
          map.setPaintProperty(
            ptUnclusterCircleId,
            "circle-stroke-width",
            layer.pointStyle.strokeWidth,
          );
        }
        map.setLayoutProperty(
          ptUnclusterCircleId,
          "visibility",
          layer.visible ? "visible" : "none",
        );
        // hide simple circle
        if (map.getLayer(pointLayerId))
          map.setLayoutProperty(pointLayerId, "visibility", "none");
      } else {
        // simple circle layer
        if (!map.getLayer(pointLayerId)) {
          map.addLayer({
            id: pointLayerId,
            type: "circle",
            source: sourceId,
            filter: [
              "in",
              ["geometry-type"],
              ["literal", ["Point", "MultiPoint"]],
            ],
            paint: {
              "circle-radius": layer.pointStyle.size,
              "circle-color": layer.pointStyle.color,
              "circle-stroke-color": layer.pointStyle.strokeColor,
              "circle-stroke-width": layer.pointStyle.strokeWidth,
            },
          });
        } else {
          map.setPaintProperty(
            pointLayerId,
            "circle-radius",
            layer.pointStyle.size,
          );
          map.setPaintProperty(
            pointLayerId,
            "circle-color",
            layer.pointStyle.color,
          );
          map.setPaintProperty(
            pointLayerId,
            "circle-stroke-color",
            layer.pointStyle.strokeColor,
          );
          map.setPaintProperty(
            pointLayerId,
            "circle-stroke-width",
            layer.pointStyle.strokeWidth,
          );
        }
        map.setLayoutProperty(
          pointLayerId,
          "visibility",
          layer.visible ? "visible" : "none",
        );
        // hide uncluster alternatives
        if (map.getLayer(ptUnclusterCircleId))
          map.setLayoutProperty(ptUnclusterCircleId, "visibility", "none");
      }
    } else {
      // symbol
      const imgName = ensureSymbolImage();
      const iconSize = Math.max(0.25, layer.pointStyle.size / 32); // relative to canvas base
      // hide circle variants
      if (map.getLayer(pointLayerId))
        map.setLayoutProperty(pointLayerId, "visibility", "none");
      if (map.getLayer(ptUnclusterCircleId))
        map.setLayoutProperty(ptUnclusterCircleId, "visibility", "none");
      if (useCluster) {
        if (!map.getLayer(ptUnclusterSymbolId)) {
          map.addLayer({
            id: ptUnclusterSymbolId,
            type: "symbol",
            source: sourceId,
            filter: [
              "all",
              ["!", ["has", "point_count"]],
              ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
            ],
            layout: {
              "icon-image": imgName,
              "icon-size": iconSize,
              "icon-allow-overlap": true,
            },
          });
        } else {
          map.setLayoutProperty(ptUnclusterSymbolId, "icon-image", imgName);
          map.setLayoutProperty(ptUnclusterSymbolId, "icon-size", iconSize);
        }
        map.setLayoutProperty(
          ptUnclusterSymbolId,
          "visibility",
          layer.visible ? "visible" : "none",
        );
        // hide simple symbol
        if (map.getLayer(pointSymId))
          map.setLayoutProperty(pointSymId, "visibility", "none");
      } else {
        if (!map.getLayer(pointSymId)) {
          map.addLayer({
            id: pointSymId,
            type: "symbol",
            source: sourceId,
            filter: [
              "in",
              ["geometry-type"],
              ["literal", ["Point", "MultiPoint"]],
            ],
            layout: {
              "icon-image": imgName,
              "icon-size": iconSize,
              "icon-allow-overlap": true,
            },
          });
        } else {
          map.setLayoutProperty(pointSymId, "icon-image", imgName);
          map.setLayoutProperty(pointSymId, "icon-size", iconSize);
        }
        map.setLayoutProperty(
          pointSymId,
          "visibility",
          layer.visible ? "visible" : "none",
        );
        // hide uncluster symbol
        if (map.getLayer(ptUnclusterSymbolId))
          map.setLayoutProperty(ptUnclusterSymbolId, "visibility", "none");
      }
    }
    // hide cluster layers when invisible
    if (!layer.visible) {
      if (map.getLayer(clusterLayerId))
        map.setLayoutProperty(clusterLayerId, "visibility", "none");
      if (map.getLayer(clusterTextId))
        map.setLayoutProperty(clusterTextId, "visibility", "none");
    }
  }

  // Lines
  if (layer.lineStyle) {
    if (!map.getLayer(lineLayerId)) {
      map.addLayer({
        id: lineLayerId,
        type: "line",
        source: sourceId,
        filter: [
          "in",
          ["geometry-type"],
          ["literal", ["LineString", "MultiLineString"]],
        ],
        layout: {
          "line-cap": layer.lineStyle.lineCap ?? "butt",
        },
        paint: {
          "line-color": layer.lineStyle.color,
          "line-width": layer.lineStyle.width,
        },
      });
    } else {
      map.setPaintProperty(lineLayerId, "line-color", layer.lineStyle.color);
      map.setPaintProperty(lineLayerId, "line-width", layer.lineStyle.width);
      map.setLayoutProperty(
        lineLayerId,
        "line-cap",
        layer.lineStyle.lineCap ?? "butt",
      );
    }
    map.setLayoutProperty(
      lineLayerId,
      "visibility",
      layer.visible ? "visible" : "none",
    );
  }

  // Polygons
  if (layer.polygonStyle) {
    if (!map.getLayer(polyFillId)) {
      map.addLayer({
        id: polyFillId,
        type: "fill",
        source: sourceId,
        filter: [
          "in",
          ["geometry-type"],
          ["literal", ["Polygon", "MultiPolygon"]],
        ],
        paint: {
          "fill-color": layer.polygonStyle.fillColor,
          "fill-opacity": layer.polygonStyle.fillOpacity,
        },
      });
    } else {
      map.setPaintProperty(
        polyFillId,
        "fill-color",
        layer.polygonStyle.fillColor,
      );
      map.setPaintProperty(
        polyFillId,
        "fill-opacity",
        layer.polygonStyle.fillOpacity,
      );
    }
    map.setLayoutProperty(
      polyFillId,
      "visibility",
      layer.visible ? "visible" : "none",
    );

    if (!map.getLayer(polyLineId)) {
      map.addLayer({
        id: polyLineId,
        type: "line",
        source: sourceId,
        filter: [
          "in",
          ["geometry-type"],
          ["literal", ["Polygon", "MultiPolygon"]],
        ],
        paint: {
          "line-color": layer.polygonStyle.strokeColor,
          "line-width": layer.polygonStyle.strokeWidth,
        },
      });
    } else {
      map.setPaintProperty(
        polyLineId,
        "line-color",
        layer.polygonStyle.strokeColor,
      );
      map.setPaintProperty(
        polyLineId,
        "line-width",
        layer.polygonStyle.strokeWidth,
      );
    }
    map.setLayoutProperty(
      polyLineId,
      "visibility",
      layer.visible ? "visible" : "none",
    );
  }
}

function removeGeoJson(map: Map, layerId: string) {
  const ids = [
    `pt-${layerId}`,
    `ln-${layerId}`,
    `pf-${layerId}`,
    `pl-${layerId}`,
  ];
  for (const id of ids) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  const srcId = `src-${layerId}`;
  if (map.getSource(srcId)) map.removeSource(srcId);
  const cache = getCfgCache(map);
  delete cache[layerId];
}

function wmsTileTemplate(url: string, layers: string): string {
  // WMS 1.1.1 with EPSG:3857 tile BBOX template
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}service=WMS&version=1.1.1&request=GetMap&layers=${encodeURIComponent(
    layers,
  )}&styles=&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}`;
}

function addOrUpdateWms(map: Map, layer: Layer) {
  if (!layer.wmsUrl || !layer.wmsLayers) return;
  const sourceId = `wms-src-${layer.id}`;
  const layerId = `wms-${layer.id}`;
  const tiles = [wmsTileTemplate(layer.wmsUrl, layer.wmsLayers)];
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "raster",
      tiles,
      tileSize: 256,
    } as any);
  } else {
    // MapLibre lacks direct setTiles API; remove/readd source if url changed
  }
  if (!map.getLayer(layerId)) {
    map.addLayer({
      id: layerId,
      type: "raster",
      source: sourceId,
    });
  }
  map.setLayoutProperty(
    layerId,
    "visibility",
    layer.visible ? "visible" : "none",
  );
}

function removeWms(map: Map, layerId: string) {
  const lid = `wms-${layerId}`;
  if (map.getLayer(lid)) map.removeLayer(lid);
  const sid = `wms-src-${layerId}`;
  if (map.getSource(sid)) map.removeSource(sid);
}

const SELECTED_FEATURE_SOURCE_ID = "gp-selected-feature";
const SELECTED_FEATURE_LAYER_IDS = [
  "gp-selected-fill",
  "gp-selected-line-halo",
  "gp-selected-line",
  "gp-selected-point-halo",
  "gp-selected-point",
] as const;

function ensureSelectedFeatureLayers(map: Map) {
  if (!map.getSource(SELECTED_FEATURE_SOURCE_ID)) {
    map.addSource(SELECTED_FEATURE_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getLayer("gp-selected-fill")) {
    map.addLayer({
      id: "gp-selected-fill",
      type: "fill",
      source: SELECTED_FEATURE_SOURCE_ID,
      filter: [
        "in",
        ["geometry-type"],
        ["literal", ["Polygon", "MultiPolygon"]],
      ],
      paint: {
        "fill-color": "#facc15",
        "fill-opacity": 0.28,
      },
    });
  }
  if (!map.getLayer("gp-selected-line-halo")) {
    map.addLayer({
      id: "gp-selected-line-halo",
      type: "line",
      source: SELECTED_FEATURE_SOURCE_ID,
      filter: [
        "in",
        ["geometry-type"],
        ["literal", ["LineString", "MultiLineString", "Polygon", "MultiPolygon"]],
      ],
      paint: {
        "line-color": "#ffffff",
        "line-width": 6,
        "line-opacity": 0.9,
      },
    });
  }
  if (!map.getLayer("gp-selected-line")) {
    map.addLayer({
      id: "gp-selected-line",
      type: "line",
      source: SELECTED_FEATURE_SOURCE_ID,
      filter: [
        "in",
        ["geometry-type"],
        ["literal", ["LineString", "MultiLineString", "Polygon", "MultiPolygon"]],
      ],
      paint: {
        "line-color": "#facc15",
        "line-width": 3,
      },
    });
  }
  if (!map.getLayer("gp-selected-point-halo")) {
    map.addLayer({
      id: "gp-selected-point-halo",
      type: "circle",
      source: SELECTED_FEATURE_SOURCE_ID,
      filter: [
        "in",
        ["geometry-type"],
        ["literal", ["Point", "MultiPoint"]],
      ],
      paint: {
        "circle-radius": 11,
        "circle-color": "#ffffff",
        "circle-opacity": 0.95,
      },
    });
  }
  if (!map.getLayer("gp-selected-point")) {
    map.addLayer({
      id: "gp-selected-point",
      type: "circle",
      source: SELECTED_FEATURE_SOURCE_ID,
      filter: [
        "in",
        ["geometry-type"],
        ["literal", ["Point", "MultiPoint"]],
      ],
      paint: {
        "circle-radius": 7,
        "circle-color": "#facc15",
        "circle-stroke-color": "#854d0e",
        "circle-stroke-width": 1.5,
      },
    });
  }
}

function syncSelectedFeatureHighlight(
  map: Map,
  feature: GeoJSON.Feature | null,
) {
  try {
    ensureSelectedFeatureLayers(map);
    const source = map.getSource(SELECTED_FEATURE_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    source?.setData({
      type: "FeatureCollection",
      features:
        feature?.geometry != null
          ? [
              {
                type: "Feature",
                id: feature.id,
                geometry: feature.geometry,
                properties: {},
              },
            ]
          : [],
    });
    for (const id of SELECTED_FEATURE_LAYER_IDS) {
      if (map.getLayer(id)) map.moveLayer(id);
    }
  } catch {
    // style may not be ready
  }
}

function featureIdFromHit(
  hit: maplibregl.MapGeoJSONFeature,
): string | number | undefined {
  if (typeof hit.id === "string" || typeof hit.id === "number") return hit.id;
  const fromProps = hit.properties?.id;
  if (typeof fromProps === "string" || typeof fromProps === "number") {
    return fromProps;
  }
  return undefined;
}

const FEATURE_HIT_PX = 16;
const GEOJSON_LAYER_PREFIXES = [
  "pt-sym-",
  "pt-un-",
  "pt-us-",
  "pt-",
  "ln-",
  "pf-",
  "pl-",
] as const;

function featureFromLayer(
  layer: Layer | undefined,
  featureId: string | number | undefined,
): GeoJSON.Feature | undefined {
  if (!layer?.data || featureId == null) return undefined;
  return layer.data.features.find(
    (feature) => String(feature.id) === String(featureId),
  );
}

function featureFromEditableLayer(
  layer: EditableLayer | undefined,
  featureId: string | number | undefined,
): GeoJSON.Feature | undefined {
  if (!layer || featureId == null) return undefined;
  return layer.data.features.find(
    (feature) => String(feature.id) === String(featureId),
  );
}

function editableLayerFromHit(
  hit: maplibregl.MapGeoJSONFeature,
  layers: Layer[],
  editingLayerId?: string,
): EditableLayer | undefined {
  if (hit.properties?.point_count != null) return undefined;
  const sourceId = hit.source;
  if (typeof sourceId === "string" && sourceId.startsWith("src-")) {
    return getEditableLayerById(layers, sourceId.slice("src-".length));
  }
  const layerId = hit.layer?.id ?? "";
  for (const prefix of GEOJSON_LAYER_PREFIXES) {
    if (layerId.startsWith(prefix)) {
      return getEditableLayerById(layers, layerId.slice(prefix.length));
    }
  }
  if (
    layerId.startsWith("td-") ||
    (typeof sourceId === "string" && sourceId.startsWith("td-"))
  ) {
    return getEditableLayerById(layers, editingLayerId);
  }
  return undefined;
}

function pickFeatureInLayer(
  map: Map,
  point: { x: number; y: number },
  layer: EditableLayer,
  maxPx: number,
): GeoJSON.Feature | undefined {
  let best: GeoJSON.Feature | undefined;
  let bestDistance = maxPx;
  for (const feature of layer.data.features) {
    if (feature.id == null) continue;
    const distance = distanceToFeaturePx(map, point, feature);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = feature;
    }
  }
  return best;
}

function findEditableFeatureAtPoint(
  map: Map,
  point: { x: number; y: number },
  layers: Layer[],
  editingLayerId?: string,
): { layer: EditableLayer; feature: GeoJSON.Feature } | null {
  const pad = FEATURE_HIT_PX;
  const hits = map.queryRenderedFeatures([
    [point.x - pad, point.y - pad],
    [point.x + pad, point.y + pad],
  ]);
  for (const hit of hits) {
    const layer = editableLayerFromHit(hit, layers, editingLayerId);
    if (!layer?.visible) continue;
    const byId = featureFromEditableLayer(layer, featureIdFromHit(hit));
    if (byId?.id != null) return { layer, feature: byId };
    const nearest = pickFeatureInLayer(map, point, layer, 48);
    if (nearest?.id != null) return { layer, feature: nearest };
  }
  for (const layer of layers) {
    if (!isEditableLayer(layer) || !layer.visible) continue;
    const nearest = pickFeatureInLayer(map, point, layer, FEATURE_HIT_PX);
    if (nearest?.id != null) return { layer, feature: nearest };
  }
  return null;
}

export function MapViewer(): JSX.Element {
  const ctx = useContext(GeoPortalContext)!;
  const { state, dispatch, drawEngineRef, measureEngineRef, mapRef } = ctx;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const drawControlRef = useRef<MaplibreTerradrawControl | null>(null);
  const measureControlRef = useRef<MaplibreMeasureControl | null>(null);
  const skipInitialSetStyleRef = useRef(true);
  const drawModeRef = useRef(state.drawMode);
  const measureModeRef = useRef(state.measureMode);
  const suppressDrawSyncRef = useRef(false);
  const terraDrawTargetIdRef = useRef<string | undefined>(undefined);
  const prevDrawTargetRef = useRef<string | undefined | null>(null);
  const knownEditableFeatureIdsRef = useRef<Set<string>>(new Set());
  const featureAttributesOpenRef = useRef(!!state.featureAttributesOpen);
  const attributeTableLayerIdRef = useRef(state.attributeTableLayerId);
  const selectedHighlightRef = useRef<GeoJSON.Feature | null>(null);
  const [mapContextMenu, setMapContextMenu] = useState<{
    x: number;
    y: number;
    lng: number;
    lat: number;
    editable?: { layerId: string; featureId: string | number };
  } | null>(null);
  const [featureInfo, setFeatureInfo] = useState<{
    lng: number;
    lat: number;
    loading: boolean;
    results: FeatureInfoResult[];
    wmsFailureCount: number;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const featureInfoGenRef = useRef(0);
  const featureInfoAbortRef = useRef<AbortController | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    layerId: string;
    featureId: string | number;
  } | null>(null);
  const [terrainOn, setTerrainOn] = useState(false);
  const [buildings3DEnabled, setBuildings3DEnabled] = useState(false);
  const syncOperationalLayersRef = useRef<(map: Map) => void>(() => {});
  const editingLayer = getEditableLayerById(
    state.layers,
    state.editingLayerId,
  );
  const editingLayerId = editingLayer?.id;
  const editingLayerIdRef = useRef(editingLayerId);
  const layersRef = useRef(state.layers);
  const drawDocument = getDrawDocument(state);
  const drawDocumentRef = useRef(drawDocument);
  drawModeRef.current = state.drawMode;
  measureModeRef.current = state.measureMode;
  editingLayerIdRef.current = editingLayerId;
  layersRef.current = state.layers;
  drawDocumentRef.current = drawDocument;
  featureAttributesOpenRef.current = !!state.featureAttributesOpen;
  attributeTableLayerIdRef.current = state.attributeTableLayerId;
  const selectedLayer = state.layers.find(
    (item) => item.id === state.selectedFeatureLayerId,
  );
  selectedHighlightRef.current =
    selectedLayer?.visible
      ? featureFromLayer(selectedLayer, state.selectedFeatureId) ?? null
      : null;

  // const [features, setFeatures] = useState({});

  // const onUpdate = useCallback((e: any) => {
  //   setFeatures((currFeatures) => {
  //     const newFeatures = { ...currFeatures };
  //     for (const f of e.features) {
  //       newFeatures[f.id] = f;
  //     }
  //     return newFeatures;
  //   });
  // }, []);

  // const onDelete = useCallback((e) => {
  //   setFeatures((currFeatures) => {
  //     const newFeatures = { ...currFeatures };
  //     for (const f of e.features) {
  //       delete newFeatures[f.id];
  //     }
  //     return newFeatures;
  //   });
  // }, []);

  const styleUrl = useMemo(() => {
    const selectedBaseMap = BASEMAPS[state.baseMap as keyof typeof BASEMAPS];
    return selectedBaseMap ?? BASEMAPS.streets;
  }, [state.baseMap]);

  const runWhenStyleReady = useCallback((map: Map, cb: () => void) => {
    whenStyleJsonReady(map, cb);
  }, []);

  // Keep map visual state aligned with sidebar state, especially after setStyle().
  syncOperationalLayersRef.current = (map: Map) => {
    // remove missing
    const existingIds = new Set(state.layers.map((l) => l.id));
    // remove geojson
    const currentSources = Object.keys((map as any).style.sourceCaches ?? {})
      .filter((id) => id.startsWith("src-"))
      .map((id) => id.replace(/^src-/, ""));
    for (const id of currentSources) {
      const layer = state.layers.find((item) => item.id === id);
      if (
        !layer ||
        !shouldRenderDrawingLayerAsGeoJson(layer, terraDrawTargetIdRef.current)
      ) {
        removeGeoJson(map, id);
      }
    }
    // remove wms
    const currentWmsSources = Object.keys((map as any).style.sourceCaches ?? {})
      .filter((id) => id.startsWith("wms-src-"))
      .map((id) => id.replace(/^wms-src-/, ""));
    for (const id of currentWmsSources) {
      if (!existingIds.has(id)) {
        removeWms(map, id);
      }
    }
    // upsert
    for (const layer of state.layers) {
      if (layer.type === "wms") {
        addOrUpdateWms(map, layer);
      } else if (
        shouldRenderDrawingLayerAsGeoJson(layer, terraDrawTargetIdRef.current)
      ) {
        addOrUpdateGeoJson(map, layer);
      }
    }
    // reorder map layers to match sidebar (top item should be above others)
    function subIds(l: Layer): string[] {
      const ids: string[] = [];
      ids.push(`pf-${l.id}`, `pl-${l.id}`, `ln-${l.id}`);
      ids.push(
        `cl-${l.id}`,
        `cl-t-${l.id}`,
        `pt-${l.id}`,
        `pt-sym-${l.id}`,
        `pt-un-${l.id}`,
        `pt-us-${l.id}`,
      );
      return ids.filter((id) => map.getLayer(id));
    }
    // move in reverse to keep first item on top
    for (let i = state.layers.length - 1; i >= 0; i--) {
      const ids = subIds(state.layers[i]);
      for (const id of ids) {
        try {
          map.moveLayer(id);
        } catch {}
      }
    }
    moveTerraDrawLayersToTop(map);
    moveMeasureLayersToTop(map);
    syncSelectedFeatureHighlight(map, selectedHighlightRef.current);
  };

  useEffect(() => {
    const container = mapContainerRef.current!;
    const map = new maplibregl.Map({
      container,
      style: styleUrl, // pasar URL directamente para que resuelva correctamente assets relativos
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      pitch: INITIAL_PITCH,
      bearing: INITIAL_BEARING,
      maxZoom: MAX_ZOOM,
      maxPitch: MAX_PITCH,
      attributionControl: false,
    });

    // const draw = new MapboxDraw({
    //   // displayControlsDefault: false,
    //   controls: {
    //     polygon: true,
    //     line_string: true,
    //     point: true,
    //     trash: true,
    //     undo: true,
    //     redo: true,
    //   },
    //   defaultMode: "simple_select",
    // });

    (window as any).maplibreglMap = map;
    mapRef.current = map;

    const handleMapContextMenu = (point: { x: number; y: number }) => {
      const lngLat = map.unproject([point.x, point.y]);
      const editableHit = findEditableFeatureAtPoint(
        map,
        point,
        layersRef.current,
        editingLayerIdRef.current,
      );
      if (editableHit?.feature.id == null) {
        dispatch({ type: "setSelectedFeature", id: undefined });
        setMapContextMenu({
          x: point.x,
          y: point.y,
          lng: lngLat.lng,
          lat: lngLat.lat,
        });
        return;
      }
      setMapContextMenu({
        x: point.x,
        y: point.y,
        lng: lngLat.lng,
        lat: lngLat.lat,
        editable: {
          layerId: editableHit.layer.id,
          featureId: editableHit.feature.id,
        },
      });
      dispatch({
        type: "setSelectedFeature",
        id: editableHit.feature.id,
        layerId: editableHit.layer.id,
      });
    };

    const blockRightButton = (ev: MouseEvent | PointerEvent) => {
      if (ev.button === 2) {
        ev.stopImmediatePropagation();
      }
    };
    const onNativeContextMenu = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      const canvas = map.getCanvas();
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      handleMapContextMenu({ x, y });
    };
    const rightClickGuardOpts: AddEventListenerOptions = { capture: true };
    const removeRightClickGuard = () => {
      const canvas = map.getCanvas();
      canvas.removeEventListener("pointerdown", blockRightButton, rightClickGuardOpts);
      canvas.removeEventListener("pointerup", blockRightButton, rightClickGuardOpts);
      canvas.removeEventListener("mousedown", blockRightButton, rightClickGuardOpts);
      canvas.removeEventListener("mouseup", blockRightButton, rightClickGuardOpts);
      canvas.removeEventListener("auxclick", blockRightButton, rightClickGuardOpts);
      canvas.removeEventListener("contextmenu", onNativeContextMenu, rightClickGuardOpts);
    };
    const installRightClickGuard = () => {
      removeRightClickGuard();
      const canvas = map.getCanvas();
      canvas.addEventListener("pointerdown", blockRightButton, rightClickGuardOpts);
      canvas.addEventListener("pointerup", blockRightButton, rightClickGuardOpts);
      canvas.addEventListener("mousedown", blockRightButton, rightClickGuardOpts);
      canvas.addEventListener("mouseup", blockRightButton, rightClickGuardOpts);
      canvas.addEventListener("auxclick", blockRightButton, rightClickGuardOpts);
      canvas.addEventListener("contextmenu", onNativeContextMenu, rightClickGuardOpts);
    };
    // Registrar en captura ANTES de Terra Draw. Los modos usan
    // pointerEvents.rightClick: true (SelectMode.onRightClick borra vértices;
    // PointMode.onRightClick borra la feature). El primer listener de captura
    // en el canvas gana; stopImmediatePropagation evita que Terra Draw reciba
    // el botón derecho.
    installRightClickGuard();

    const onMapClick = (event: maplibregl.MapMouseEvent) => {
      const tableLayerId = attributeTableLayerIdRef.current;
      if (!tableLayerId) return;
      const mode = drawModeRef.current;
      if (mode !== "none" && mode !== "select") return;
      if (measureModeRef.current !== "none") return;
      const hit = findEditableFeatureAtPoint(
        map,
        event.point,
        layersRef.current,
        editingLayerIdRef.current,
      );
      if (!hit || hit.layer.id !== tableLayerId || hit.feature.id == null) {
        return;
      }
      dispatch({
        type: "setSelectedFeature",
        id: hit.feature.id,
        layerId: hit.layer.id,
      });
    };
    map.on("click", onMapClick);

    const drawControl = new MaplibreTerradrawControl({
      modes: [
        "render",
        "point",
        "linestring",
        "polygon",
        "rectangle",
        "circle",
        "select",
      ],
      open: false,
      showDeleteConfirmation: false,
    });

    const applyDrawMode = () => {
      const instance = drawControl.getTerraDrawInstance();
      if (!instance?.enabled) return;
      const nextMode = toTerraDrawMode(drawModeRef.current);
      if (instance.getMode() !== nextMode) {
        instance.setMode(nextMode);
        console.log("[draw] mode changed:", nextMode);
      }
    };

    const syncDrawingsFromStore = (logCount = false) => {
      if (suppressDrawSyncRef.current) return;
      const instance = drawControl.getTerraDrawInstance();
      if (!instance) return;
      const snapshot = instance.getSnapshot();
      const drawings = snapshotToFeatureCollection(snapshot);
      if (logCount) {
        console.log("[draw] feature count:", drawings.features.length);
      }
      const targetId = terraDrawTargetIdRef.current;
      if (targetId) {
        dispatch({ type: "replaceLayerFeatures", id: targetId, data: drawings });
        return;
      }
      dispatch({ type: "replaceDrawings", drawings });
    };

    const drawEngine: DrawEngine = {
      setMode: (mode) => {
        const instance = drawControl.getTerraDrawInstance();
        if (!instance?.enabled) return;
        const nextMode = toTerraDrawMode(mode);
        instance.setMode(nextMode);
        console.log("[draw] mode changed:", nextMode);
      },
      clear: () => {
        const instance = drawControl.getTerraDrawInstance();
        if (!instance?.enabled) return;
        instance.clear();
        syncDrawingsFromStore(true);
        applyDrawMode();
      },
      deleteSelected: () => {
        const instance = drawControl.getTerraDrawInstance();
        if (!instance?.enabled) return;
        const selected = drawControl.getFeatures(true);
        let ids = (selected?.features ?? [])
          .map((feature) => feature.id)
          .filter((id): id is string | number => id !== undefined);
        if (ids.length === 0) {
          ids = instance
            .getSnapshot()
            .filter((feature) => feature.properties?.selected)
            .map((feature) => feature.id)
            .filter((id): id is string | number => id !== undefined);
        }
        if (ids.length === 0) return;
        instance.removeFeatures(ids);
        syncDrawingsFromStore(true);
      },
      removeFeatures: (ids) => {
        const instance = drawControl.getTerraDrawInstance();
        if (!instance?.enabled || ids.length === 0) return;
        instance.removeFeatures(ids);
        syncDrawingsFromStore(true);
      },
    };

    const onDrawChange = () => {
      syncDrawingsFromStore();
    };
    const onDrawFinish = (id?: string | number) => {
      if (suppressDrawSyncRef.current) return;
      console.log("[draw] feature created");
      syncDrawingsFromStore(true);
      const targetId = terraDrawTargetIdRef.current;
      const instance = drawControl.getTerraDrawInstance();
      const snapshotIds = new Set(
        instance
          ? snapshotToFeatureCollection(instance.getSnapshot())
              .features.map((feature) =>
                feature.id == null ? "" : String(feature.id),
              )
              .filter(Boolean)
          : [],
      );
      const createdKeys = [...snapshotIds].filter(
        (key) => !knownEditableFeatureIdsRef.current.has(key),
      );
      knownEditableFeatureIdsRef.current = snapshotIds;
      if (!targetId) return;
      const createdId =
        id != null && createdKeys.includes(String(id))
          ? id
          : createdKeys.length === 1
            ? createdKeys[0]
            : undefined;
      if (createdId == null) return;
      const layer = getEditableLayerById(layersRef.current, targetId);
      if (!layer || layer.fields.length === 0) return;
      if (featureAttributesOpenRef.current) return;
      dispatch({
        type: "openFeatureAttributes",
        layerId: targetId,
        featureId: createdId,
        skipIfOpen: true,
      });
    };

    let drawAttached = false;
    const attachDrawControl = () => {
      if (drawAttached) return;
      drawAttached = true;
      map.addControl(drawControl, "top-left");
      drawControlRef.current = drawControl;
      drawEngineRef.current = drawEngine;
      console.log("[draw] control initialized");
      const instance = startTerraDraw(drawControl);
      if (instance) {
        instance.on("change", onDrawChange);
        instance.on("finish", onDrawFinish);
        restoreFeaturesToTerraDraw(instance, drawDocumentRef.current);
      }
      console.log("[draw] TerraDraw started");
      terraDrawTargetIdRef.current = editingLayerIdRef.current;
      prevDrawTargetRef.current = editingLayerIdRef.current;
      knownEditableFeatureIdsRef.current = new Set(
        drawDocumentRef.current.features
          .map((feature) => (feature.id == null ? "" : String(feature.id)))
          .filter(Boolean),
      );
      applyDrawMode();
      restartTerraDrawIfLayersMissing(map, drawControl);
      restoreFeaturesToTerraDraw(
        drawControl.getTerraDrawInstance(),
        drawDocumentRef.current,
      );
      logDrawLayerIds(map, "layers after start");
    };
    whenStyleJsonReady(map, attachDrawControl);

    const measureControl = new MaplibreMeasureControl({
      modes: ["render", "linestring", "polygon"],
      open: false,
      measureUnitType: "metric",
      distancePrecision: 2,
      areaPrecision: 2,
      computeElevation: false,
      adapterOptions: { prefixId: "td-measure" },
      pointLayerLabelSpec: withMeasureLabelTextSize(
        defaultMeasureControlOptions.pointLayerLabelSpec!,
      ),
      lineLayerLabelSpec: withMeasureLabelTextSize(
        defaultMeasureControlOptions.lineLayerLabelSpec!,
      ),
      polygonLayerSpec: withMeasureLabelTextSize(
        defaultMeasureControlOptions.polygonLayerSpec!,
      ),
    });

    const applyMeasureMode = () => {
      const instance = measureControl.getTerraDrawInstance();
      if (!instance) return;
      if (!instance.enabled) {
        startMeasureControl(measureControl);
      }
      const nextMode = toMeasureTerraMode(measureModeRef.current);
      const live = measureControl.getTerraDrawInstance();
      if (live && live.getMode() !== nextMode) {
        live.setMode(nextMode);
      }
      if (nextMode === "render") {
        restoreMapCursor(map);
      }
    };

    const measureEngine: MeasureEngine = {
      setMode: (mode) => {
        measureModeRef.current = mode;
        if (mode !== "none") {
          // Pause GIS/free-draw interaction without dropping editingLayerId.
          drawEngine.setMode("none");
        }
        applyMeasureMode();
        if (mode === "none") {
          drawEngine.setMode(drawModeRef.current);
        }
      },
      clear: () => {
        clearMeasureFeatures(measureControl, map);
        applyMeasureMode();
      },
    };

    let measureAttached = false;
    const attachMeasureControl = () => {
      if (measureAttached) return;
      measureAttached = true;
      map.addControl(measureControl, "top-left");
      measureControlRef.current = measureControl;
      measureEngineRef.current = measureEngine;
      startMeasureControl(measureControl);
      applyMeasureMode();
      console.log("[measure] control initialized");
    };
    whenStyleJsonReady(map, attachMeasureControl);

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "top-right",
    );
    map.addControl(
      new maplibregl.ScaleControl({ unit: "metric" }),
      "bottom-left",
    );

    // const syncDrawings = () => {
    //   const data = draw.getAll();
    //   setDrawings(data);
    // };

    // map.on("draw.create", onUpdate);
    // map.on("draw.update", onUpdate);
    // map.on("draw.delete", onDelete);

    try {
      map.addControl(
        new maplibregl.AttributionControl({ compact: true }) as any,
        "bottom-left",
      );
    } catch {}
    map.addControl(new maplibregl.FullscreenControl());
    // Geolocate se maneja con botón propio en el stack derecho (no nativo)

    // asegurar que el mapa se reajusta al tamaño del contenedor
    const ro = new ResizeObserver(() => {
      try {
        map.resize();
      } catch {}
    });
    ro.observe(container);
    const onWinResize = () => {
      try {
        map.resize();
      } catch {}
    };
    window.addEventListener("resize", onWinResize);
    setTimeout(() => {
      try {
        map.resize();
      } catch {}
    }, 0);
    setTimeout(() => {
      try {
        map.resize();
      } catch {}
    }, 300);

    // no fallback de estilo en error

    const onMapStyleLoad = () => {
      console.log("[draw] style reloaded");
      installRightClickGuard();
      whenStyleJsonReady(map, () => {
        if (drawAttached) {
          restartTerraDrawIfLayersMissing(map, drawControl);
          restoreFeaturesToTerraDraw(
            drawControl.getTerraDrawInstance(),
            drawDocumentRef.current,
          );
        } else {
          attachDrawControl();
        }
        if (measureAttached) {
          restartMeasureIfLayersMissing(map, measureControl);
          applyMeasureMode();
        } else {
          attachMeasureControl();
        }
        console.log("[draw] restoring draw layers");
        syncOperationalLayersRef.current(map);
        logDrawLayerIds(map, "layers after style.load");
      });
    };
    map.on("style.load", onMapStyleLoad);

    map.on("load", () => {
      try {
        map.resize();
      } catch {}
      // initial operational layers render
      runWhenStyleReady(map, () => syncOperationalLayersRef.current(map));

      // Terreno (MapTiler Terrain-RGB) + Hillshade + Cielo
      try {
        if (!map.getSource("terrain-rgb")) {
          map.addSource("terrain-rgb", {
            type: "raster-dem",
            url: `https://api.maptiler.com/tiles/terrain-rgb/tiles.json?key=${MAPTILER_KEY}`,
            encoding: "mapbox",
          } as any);
        }
        if (terrainOn) {
          map.setTerrain({
            source: "terrain-rgb",
            exaggeration: TERRAIN_EXAGGERATION,
          } as any);
          const beforeId = (map.getStyle() as any)?.layers?.find(
            (l: any) => l.type === "symbol",
          )?.id;
          if (!map.getLayer("hillshade")) {
            map.addLayer(
              {
                id: "hillshade",
                type: "hillshade",
                source: "terrain-rgb",
                paint: {
                  "hillshade-shadow-color": "#473B24",
                  "hillshade-highlight-color": "#FFFFFF",
                  "hillshade-accent-color": "#000000",
                  "hillshade-illumination-direction": 315,
                  "hillshade-illumination-anchor": "map",
                  "hillshade-exaggeration": 1.0,
                },
              } as any,
              beforeId,
            );
          }
          // if (!map.getLayer("sky")) {
          //   map.addLayer({
          //     id: "heatmap",
          //     type: "heatmap",
          //     source: "heatmap",
          //     paint: {
          //       "heatmap-type": "atmosphere",
          //       "heatmap-atmosphere-sun": [0.0, 0.0],
          //       "heatmap-atmosphere-sun-intensity": 15,
          //     },
          //   } as any);
          // }
        }
        applyBuildings3DState(map, buildings3DEnabled);
      } catch {}
    });

    return () => {
      const instance = drawControl.getTerraDrawInstance();
      try {
        instance?.off("change", onDrawChange);
        instance?.off("finish", onDrawFinish);
      } catch {}
      if (measureAttached) {
        try {
          map.removeControl(measureControl);
        } catch {}
      }
      measureControlRef.current = null;
      measureEngineRef.current = null;
      if (drawAttached) {
        try {
          map.removeControl(drawControl);
        } catch {}
      }
      drawControlRef.current = null;
      drawEngineRef.current = null;
      map.off("style.load", onMapStyleLoad);
      map.off("click", onMapClick);
      try {
        removeRightClickGuard();
      } catch {}
      map.remove();
      try {
        ro.disconnect();
      } catch {}
      window.removeEventListener("resize", onWinResize);
      mapRef.current = null;
      (window as any).maplibreglMap = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cambiar estilo preservando vista y layers de Terra Draw
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (skipInitialSetStyleRef.current) {
      skipInitialSetStyleRef.current = false;
      return;
    }
    const center = map.getCenter();
    const zoom = map.getZoom();
    const pitch = map.getPitch();
    const bearing = map.getBearing();
    const applyAfterStyleReady = () => {
      try {
        map.jumpTo({ center, zoom, pitch, bearing });
      } catch {}
      syncOperationalLayersRef.current(map);
      try {
        if (!map.getSource("terrain-rgb")) {
          map.addSource("terrain-rgb", {
            type: "raster-dem",
            url: `https://api.maptiler.com/tiles/terrain-rgb/tiles.json?key=${MAPTILER_KEY}`,
            encoding: "mapbox",
          } as any);
        }
        if (terrainOn) {
          map.setTerrain({
            source: "terrain-rgb",
            exaggeration: TERRAIN_EXAGGERATION,
          } as any);
          const beforeId = (map.getStyle() as any)?.layers?.find(
            (l: any) => l.type === "symbol",
          )?.id;
          if (!map.getLayer("hillshade")) {
            map.addLayer(
              {
                id: "hillshade",
                type: "hillshade",
                source: "terrain-rgb",
                paint: {
                  "hillshade-shadow-color": "#473B24",
                  "hillshade-highlight-color": "#FFFFFF",
                  "hillshade-accent-color": "#000000",
                  "hillshade-illumination-direction": 315,
                  "hillshade-illumination-anchor": "map",
                  "hillshade-exaggeration": 1.0,
                },
              } as any,
              beforeId,
            );
          }
        }
        applyBuildings3DState(map, buildings3DEnabled);
      } catch {}
      moveTerraDrawLayersToTop(map);
      moveMeasureLayersToTop(map);
      restoreFeaturesToTerraDraw(
        drawControlRef.current?.getTerraDrawInstance(),
        drawDocumentRef.current,
      );
      const measureControl = measureControlRef.current;
      if (measureControl) {
        restartMeasureIfLayersMissing(map, measureControl);
      }
      logDrawLayerIds(map, "layers after basemap change");
    };
    map.once("style.load", applyAfterStyleReady);
    const drawControl = drawControlRef.current;
    const measureControl = measureControlRef.current;
    map.setStyle(styleUrl as any, {
      transformStyle: (previous, next) => {
        let style = next as StyleSpecification;
        if (drawControl) {
          style = mergeTerraDrawStyle(
            drawControl,
            previous as StyleSpecification | undefined,
            style,
          );
        }
        if (measureControl) {
          style = mergeTerraDrawStyle(
            measureControl,
            previous as StyleSpecification | undefined,
            style,
          );
        }
        return style;
      },
    });

    return () => {
      map.off("style.load", applyAfterStyleReady);
    };
  }, [styleUrl, runWhenStyleReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    runWhenStyleReady(map, () => {
      try {
        applyBuildings3DState(map, buildings3DEnabled);
      } catch {}
    });
  }, [buildings3DEnabled, runWhenStyleReady]);

  // update layers when state changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    runWhenStyleReady(map, () => syncOperationalLayersRef.current(map));
  }, [state.layers, runWhenStyleReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    runWhenStyleReady(map, () =>
      syncSelectedFeatureHighlight(map, selectedHighlightRef.current),
    );
  }, [
    state.selectedFeatureId,
    state.selectedFeatureLayerId,
    runWhenStyleReady,
  ]);

  useEffect(() => {
    drawEngineRef.current?.setMode(state.drawMode);
  }, [drawEngineRef, state.drawMode]);

  useEffect(() => {
    measureEngineRef.current?.setMode(state.measureMode);
  }, [measureEngineRef, state.measureMode]);

  useEffect(() => {
    const instance = drawControlRef.current?.getTerraDrawInstance();
    if (!instance?.enabled) return;
    if (prevDrawTargetRef.current === editingLayerId) return;

    const previousTargetId = terraDrawTargetIdRef.current;
    const previousTargetRemoved =
      previousTargetId != null &&
      !layersRef.current.some((layer) => layer.id === previousTargetId);
    // Drop the snapshot if its layer was deleted; syncing would rewrite session drawings.
    if (!suppressDrawSyncRef.current && !previousTargetRemoved) {
      const drawings = snapshotToFeatureCollection(instance.getSnapshot());
      if (previousTargetId) {
        dispatch({
          type: "replaceLayerFeatures",
          id: previousTargetId,
          data: drawings,
        });
      } else {
        dispatch({ type: "replaceDrawings", drawings });
      }
    }

    prevDrawTargetRef.current = editingLayerId;
    suppressDrawSyncRef.current = true;
    try {
      instance.clear();
      restoreFeaturesToTerraDraw(instance, drawDocumentRef.current);
    } finally {
      suppressDrawSyncRef.current = false;
    }
    terraDrawTargetIdRef.current = editingLayerId;
    knownEditableFeatureIdsRef.current = new Set(
      drawDocumentRef.current.features
        .map((feature) => (feature.id == null ? "" : String(feature.id)))
        .filter(Boolean),
    );
    const map = mapRef.current;
    if (map) syncOperationalLayersRef.current(map);
    drawEngineRef.current?.setMode(drawModeRef.current);
  }, [editingLayerId]);

  useEffect(() => {
    if (editingLayerId) return;
    const instance = drawControlRef.current?.getTerraDrawInstance();
    if (!instance?.enabled) return;
    if (state.drawings.features.length === 0) {
      const remaining = snapshotToFeatureCollection(instance.getSnapshot());
      if (remaining.features.length === 0) return;
      instance.clear();
      console.log("[draw] feature count:", 0);
      return;
    }
    restoreFeaturesToTerraDraw(instance, state.drawings);
  }, [state.drawings, editingLayerId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapContextMenu) return;
    const closeMenu = () => {
      setMapContextMenu(null);
      dispatch({ type: "setSelectedFeature", id: undefined });
    };
    map.on("movestart", closeMenu);
    return () => {
      map.off("movestart", closeMenu);
    };
  }, [dispatch, mapContextMenu]);

  const contextMenuFeature = featureFromEditableLayer(
    getEditableLayerById(state.layers, mapContextMenu?.editable?.layerId),
    mapContextMenu?.editable?.featureId,
  );

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    return () => {
      featureInfoGenRef.current += 1;
      featureInfoAbortRef.current?.abort();
    };
  }, []);

  const handleCopyCoordinates = useCallback(async (lng: number, lat: number) => {
    const ok = await copyTextToClipboard(formatLngLat(lng, lat));
    setToastMessage(ok ? "Coordenadas copiadas" : "No se pudieron copiar las coordenadas");
  }, []);

  const closeFeatureInfo = useCallback(() => {
    featureInfoGenRef.current += 1;
    featureInfoAbortRef.current?.abort();
    setFeatureInfo(null);
  }, []);

  const handleGetInfo = useCallback(
    async (point: { x: number; y: number }, lng: number, lat: number) => {
      const map = mapRef.current;
      if (!map) return;
      featureInfoAbortRef.current?.abort();
      const controller = new AbortController();
      featureInfoAbortRef.current = controller;
      const generation = ++featureInfoGenRef.current;
      setMapContextMenu(null);
      setFeatureInfo({
        lng,
        lat,
        loading: true,
        results: [],
        wmsFailureCount: 0,
      });

      const vectorResults = queryVectorFeatureInfo(
        map,
        point,
        layersRef.current,
        editingLayerIdRef.current,
      );
      const wmsLayers = layersRef.current.filter(isQueryableWmsLayer);
      const settled = await Promise.allSettled(
        wmsLayers.map((layer) =>
          fetchWmsFeatureInfo(layer, map, point, controller.signal),
        ),
      );
      if (generation !== featureInfoGenRef.current || controller.signal.aborted) {
        return;
      }

      const wmsResults: FeatureInfoResult[] = [];
      let wmsFailureCount = 0;
      settled.forEach((item, index) => {
        const layer = wmsLayers[index];
        if (item.status === "fulfilled") {
          if (item.value.length === 0) return;
          wmsResults.push({
            layerId: layer.id,
            layerName: layer.name,
            layerType: "wms",
            features: item.value,
          });
          return;
        }
        if (item.reason instanceof DOMException && item.reason.name === "AbortError") {
          return;
        }
        wmsFailureCount += 1;
      });

      setFeatureInfo({
        lng,
        lat,
        loading: false,
        results: mergeFeatureInfoResults(
          layersRef.current,
          vectorResults,
          wmsResults,
        ),
        wmsFailureCount,
      });
    },
    [mapRef],
  );

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />

      {/* Izquierda: SOLO Dibujo */}
      <div className="absolute top-3 left-3 z-20">
        <MapControls />
      </div>

      {/* Derecha: todos los demás controles, en columna (debajo de los nativos) */}
      <div className="maplibregl-ctrl-top-right maplibregl-ctrl-custom-top-right">
        {/* Basemap (compacto) */}
        <BaseMapControl />

        {/* Geolocate (usuario) */}
        <div className="maplibregl-ctrl maplibregl-ctrl-group">
          <button
            className="maplibregl-ctrl-custom-locate"
            title="Mi ubicación"
            onClick={() => {
              if (!navigator.geolocation) return;
              const map = mapRef.current;
              if (!map) return;
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  const { longitude, latitude } = pos.coords;
                  try {
                    map.flyTo({
                      center: { lng: longitude, lat: latitude },
                      zoom: Math.max(map.getZoom(), 14),
                    });
                  } catch {}
                },
                () => {},
              );
            }}
          >
            <span className="maplibregl-ctrl-icon"></span>
          </button>
        </div>
        {/* Reset */}
        <div className="maplibregl-ctrl maplibregl-ctrl-group">
          <button
            className="maplibregl-ctrl-custom-reset"
            title="Volver a vista inicial"
            onClick={() => {
              const map = mapRef.current;
              if (!map) return;
              map.flyTo({
                center: INITIAL_CENTER,
                zoom: INITIAL_ZOOM,
                pitch: terrainOn ? INITIAL_PITCH : 0,
                bearing: INITIAL_BEARING,
                duration: 1500,
              });
            }}
          >
            <span className="maplibregl-ctrl-icon"></span>
          </button>
        </div>
        {/* 2D / 3D */}
        <div className="maplibregl-ctrl maplibregl-ctrl-group">
          <button
            className={
              terrainOn
                ? "maplibregl-ctrl-custom-terrain-on"
                : "maplibregl-ctrl-custom-terrain-off"
            }
            title="Toggle Terrain"
            onClick={() => {
              const map = mapRef.current;
              if (!map) return;
              const next = !terrainOn;
              setTerrainOn(next);
              try {
                if (next) {
                  if (!map.getSource("terrain-rgb")) {
                    map.addSource("terrain-rgb", {
                      type: "raster-dem",
                      url: `https://api.maptiler.com/tiles/terrain-rgb/tiles.json?key=${MAPTILER_KEY}`,
                      encoding: "mapbox",
                    } as any);
                  }
                  map.setTerrain({
                    source: "terrain-rgb",
                    exaggeration: TERRAIN_EXAGGERATION,
                  } as any);
                  if (!map.getLayer("hillshade")) {
                    const beforeId = (map.getStyle() as any)?.layers?.find(
                      (l: any) => l.type === "symbol",
                    )?.id;
                    map.addLayer(
                      {
                        id: "hillshade",
                        type: "hillshade",
                        source: "terrain-rgb",
                        paint: {
                          "hillshade-shadow-color": "#473B24",
                          "hillshade-highlight-color": "#FFFFFF",
                          "hillshade-accent-color": "#000000",
                          "hillshade-illumination-direction": 315,
                          "hillshade-illumination-anchor": "map",
                          "hillshade-exaggeration": 1.0,
                        },
                      } as any,
                      beforeId,
                    );
                  }
                } else {
                  map.setTerrain(null as any);
                  if (map.getLayer("hillshade")) map.removeLayer("hillshade");
                }
              } catch {}
            }}
          >
            {/* <span className="maplibregl-ctrl-icon"></span> */}
            <img
              src={reliefIcon}
              alt="Relieve"
              className="maplibregl-ctrl-icon"
            />
          </button>
        </div>
        {/* Edificios 3D */}
        <div className="maplibregl-ctrl maplibregl-ctrl-group">
          <button
            className={
              buildings3DEnabled
                ? "maplibregl-ctrl-custom-buildings-on"
                : "maplibregl-ctrl-custom-buildings-off"
            }
            title={
              buildings3DEnabled
                ? "Desactivar edificios 3D"
                : "Activar edificios 3D"
            }
            onClick={() => setBuildings3DEnabled((prev) => !prev)}
          >
            <img
              src={buildingsIcon}
              alt="Edificios 3D"
              className="maplibregl-ctrl-icon"
            />
          </button>
        </div>
      </div>
      <div className="absolute bottom-3 right-3 z-10">
        <MiniMap styleUrl={styleUrl} />
      </div>
      {mapContextMenu && mapContainerRef.current && (
        <FeatureContextMenu
          x={mapContextMenu.x}
          y={mapContextMenu.y}
          container={mapContainerRef.current}
          onClose={() => {
            setMapContextMenu(null);
            dispatch({ type: "setSelectedFeature", id: undefined });
          }}
          onEditAttributes={
            mapContextMenu.editable && contextMenuFeature
              ? () => {
                  dispatch({
                    type: "openFeatureAttributes",
                    layerId: mapContextMenu.editable!.layerId,
                    featureId: mapContextMenu.editable!.featureId,
                  });
                  setMapContextMenu(null);
                }
              : undefined
          }
          onZoom={
            mapContextMenu.editable && contextMenuFeature
              ? () => {
                  const map = mapRef.current;
                  if (map) zoomToFeature(map, contextMenuFeature);
                  setMapContextMenu(null);
                  dispatch({ type: "setSelectedFeature", id: undefined });
                }
              : undefined
          }
          onDelete={
            mapContextMenu.editable && contextMenuFeature
              ? () => {
                  setPendingDelete({
                    layerId: mapContextMenu.editable!.layerId,
                    featureId: mapContextMenu.editable!.featureId,
                  });
                  setMapContextMenu(null);
                }
              : undefined
          }
          onCopyCoordinates={() => {
            void handleCopyCoordinates(mapContextMenu.lng, mapContextMenu.lat);
            setMapContextMenu(null);
          }}
          onGetInfo={() => {
            void handleGetInfo(
              { x: mapContextMenu.x, y: mapContextMenu.y },
              mapContextMenu.lng,
              mapContextMenu.lat,
            );
          }}
        />
      )}
      {featureInfo && (
        <FeatureInfoDialog
          open
          lng={featureInfo.lng}
          lat={featureInfo.lat}
          loading={featureInfo.loading}
          results={featureInfo.results}
          wmsFailureCount={featureInfo.wmsFailureCount}
          onClose={closeFeatureInfo}
          onCopyCoordinates={() => {
            void handleCopyCoordinates(featureInfo.lng, featureInfo.lat);
          }}
        />
      )}
      {toastMessage && (
        <div
          role="status"
          className="pointer-events-none fixed bottom-16 left-1/2 z-[1300] -translate-x-1/2 rounded-md border bg-card px-3 py-1.5 text-sm shadow-md"
        >
          {toastMessage}
        </div>
      )}
      <Dialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
            dispatch({ type: "setSelectedFeature", id: undefined });
          }
        }}
        className="w-full max-w-sm p-4"
      >
        <DialogHeader>
          <DialogTitle>Eliminar entidad</DialogTitle>
          <DialogDescription>¿Eliminar esta entidad?</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => {
              setPendingDelete(null);
              dispatch({ type: "setSelectedFeature", id: undefined });
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (!pendingDelete) return;
              if (state.editingLayerId === pendingDelete.layerId) {
                drawEngineRef.current?.removeFeatures([pendingDelete.featureId]);
              } else {
                dispatch({
                  type: "removeLayerFeature",
                  layerId: pendingDelete.layerId,
                  featureId: pendingDelete.featureId,
                });
              }
              setPendingDelete(null);
              dispatch({ type: "closeFeatureAttributes" });
              dispatch({ type: "setSelectedFeature", id: undefined });
            }}
          >
            Eliminar
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
