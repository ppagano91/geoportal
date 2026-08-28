import React, {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import maplibregl, { Map, MapMouseEvent, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MaplibreTerradrawControl } from "@watergis/maplibre-gl-terradraw";
import "@watergis/maplibre-gl-terradraw/dist/maplibre-gl-terradraw.css";
import { GeoPortalContext, type DrawEngine } from "../../shell/GeoPortalApp";
import { BaseMapControl } from "./BaseMapControl";
import { FeaturePopup } from "./FeaturePopup";
import type { Layer } from "../../types/geoportal";
import { MiniMap } from "./MiniMap";
import { MapControls } from "./MapControls";
import { env } from "../../config/env";
import buildingsIcon from "../../assets/images/buildings.svg";
import reliefIcon from "../../assets/images/relief.svg";
import {
  logDrawLayerIds,
  mergeTerraDrawStyle,
  moveTerraDrawLayersToTop,
  restartTerraDrawIfLayersMissing,
  restoreFeaturesToTerraDraw,
  snapshotToFeatureCollection,
  startTerraDraw,
  toTerraDrawMode,
  whenStyleJsonReady,
} from "./terraDraw";
import { shouldRenderDrawingLayerAsGeoJson } from "../../persistence/drawingLayers";
import {
  getActiveEditableLayer,
  getDrawDocument,
} from "../../persistence/editableLayers";

// import MapboxDraw from "@mapbox/mapbox-gl-draw";

// import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

const BASEMAPS = {
  streets: {
    version: 8,
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
    sources: {
      carto: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution: "© CARTO",
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

export function MapViewer(): JSX.Element {
  const ctx = useContext(GeoPortalContext)!;
  const { state, dispatch, drawEngineRef } = ctx;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const drawControlRef = useRef<MaplibreTerradrawControl | null>(null);
  const skipInitialSetStyleRef = useRef(true);
  const drawModeRef = useRef(state.drawMode);
  const suppressDrawSyncRef = useRef(false);
  const terraDrawTargetIdRef = useRef<string | undefined>(undefined);
  const prevDrawTargetRef = useRef<string | undefined | null>(null);
  const [popup, setPopup] = useState<{
    coord: [number, number];
    feature: any;
  } | null>(null);
  const [terrainOn, setTerrainOn] = useState(false);
  const [buildings3DEnabled, setBuildings3DEnabled] = useState(false);
  const syncOperationalLayersRef = useRef<(map: Map) => void>(() => {});
  const editingLayer = getActiveEditableLayer(
    state.layers,
    state.activeLayerId,
  );
  const editingLayerId = editingLayer?.id;
  const editingLayerIdRef = useRef(editingLayerId);
  const drawDocument = getDrawDocument(state);
  const drawDocumentRef = useRef(drawDocument);
  drawModeRef.current = state.drawMode;
  editingLayerIdRef.current = editingLayerId;
  drawDocumentRef.current = drawDocument;

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
    };

    const onDrawChange = () => {
      syncDrawingsFromStore();
    };
    const onDrawFinish = () => {
      console.log("[draw] feature created");
      syncDrawingsFromStore(true);
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
      applyDrawMode();
      restartTerraDrawIfLayersMissing(map, drawControl);
      restoreFeaturesToTerraDraw(
        drawControl.getTerraDrawInstance(),
        drawDocumentRef.current,
      );
      logDrawLayerIds(map, "layers after start");
    };
    whenStyleJsonReady(map, attachDrawControl);

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

    function onContext(e: MapMouseEvent) {
      try {
        (e.originalEvent as MouseEvent).preventDefault();
      } catch {}
      const features = map
        .queryRenderedFeatures(e.point)
        .filter((f) => !!f.properties);
      if (features.length > 0) {
        setPopup({ coord: [e.lngLat.lng, e.lngLat.lat], feature: features[0] });
      } else {
        setPopup(null);
      }
    }
    map.on("contextmenu", onContext);
    const preventCtx = (ev: Event) => {
      ev.preventDefault();
    };
    map.getCanvas().addEventListener("contextmenu", preventCtx);

    const onMapStyleLoad = () => {
      console.log("[draw] style reloaded");
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
      if (drawAttached) {
        try {
          map.removeControl(drawControl);
        } catch {}
      }
      drawControlRef.current = null;
      drawEngineRef.current = null;
      map.off("contextmenu", onContext);
      map.off("style.load", onMapStyleLoad);
      map.remove();
      try {
        ro.disconnect();
      } catch {}
      window.removeEventListener("resize", onWinResize);
      try {
        map.getCanvas().removeEventListener("contextmenu", preventCtx);
      } catch {}
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
      restoreFeaturesToTerraDraw(
        drawControlRef.current?.getTerraDrawInstance(),
        drawDocumentRef.current,
      );
      logDrawLayerIds(map, "layers after basemap change");
    };
    map.once("style.load", applyAfterStyleReady);
    const drawControl = drawControlRef.current;
    map.setStyle(styleUrl as any, {
      transformStyle: (previous, next) =>
        drawControl
          ? mergeTerraDrawStyle(
              drawControl,
              previous as StyleSpecification | undefined,
              next as StyleSpecification,
            )
          : next,
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
    drawEngineRef.current?.setMode(state.drawMode);
  }, [drawEngineRef, state.drawMode]);

  useEffect(() => {
    const instance = drawControlRef.current?.getTerraDrawInstance();
    if (!instance?.enabled) return;
    if (prevDrawTargetRef.current === editingLayerId) return;
    prevDrawTargetRef.current = editingLayerId;
    suppressDrawSyncRef.current = true;
    try {
      instance.clear();
      restoreFeaturesToTerraDraw(instance, drawDocumentRef.current);
    } finally {
      suppressDrawSyncRef.current = false;
    }
    terraDrawTargetIdRef.current = editingLayerId;
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
      {popup && (
        <FeaturePopup
          map={mapRef.current!}
          lngLat={popup.coord}
          feature={popup.feature}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}
