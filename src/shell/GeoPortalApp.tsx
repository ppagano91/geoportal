import React, { useEffect, useMemo, useReducer, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { GeoPortalState, Layer } from "../types/geoportal";
import { Header } from "../components/geoportal/Header";
import { Sidebar } from "../components/geoportal/Sidebar";
import { MapViewer } from "../components/geoportal/MapViewer";
import { WmsDialog } from "../components/geoportal/WmsDialog";
import { LayerSettingsDialog } from "../components/geoportal/LayerSettingsDialog";
import { FeatureAttributesDialog } from "../components/geoportal/FeatureAttributesDialog";
import { AttributeTable } from "../components/geoportal/AttributeTable";
import {
  DRAWING_SESSION_LAYER_ID,
  createDrawingLayer,
  featureCollectionsEqual,
  getSessionDrawings,
  loadDrawingLayers,
  saveDrawingLayers,
  upsertDrawingSessionLayer,
  emptyFeatureCollection,
} from "../persistence/drawingLayers";
import {
  geometryTypeToDrawMode,
  getEditableFeature,
  getEditableLayerById,
  isDrawModeAllowedForEditable,
  snapshotToEditableFeatures,
} from "../persistence/editableLayers";

type Action =
  | { type: "toggleSidebar" }
  | { type: "setSearch"; query: string }
  | { type: "setTheme"; theme: "light" | "dark" }
  | { type: "setBaseMap"; baseMap: GeoPortalState["baseMap"] }
  | { type: "addLayer"; layer: Layer }
  | { type: "removeLayer"; id: string }
  | { type: "toggleLayer"; id: string; visible: boolean }
  | { type: "updateLayer"; id: string; patch: Partial<Layer> }
  | { type: "setActiveLayer"; id?: string }
  | { type: "openLayerSettings"; id: string }
  | { type: "closeLayerSettings" }
  | { type: "startEditingLayer"; id: string }
  | { type: "stopEditingLayer" }
  | { type: "setSelectedFeature"; id?: string | number; layerId?: string }
  | { type: "openFeatureAttributes"; layerId: string; featureId: string | number; skipIfOpen?: boolean }
  | { type: "closeFeatureAttributes" }
  | {
      type: "updateFeatureProperties";
      layerId: string;
      featureId: string | number;
      properties: GeoJSON.GeoJsonProperties;
    }
  | { type: "setDrawMode"; mode: GeoPortalState["drawMode"] }
  | { type: "addDrawing"; feature: GeoJSON.Feature }
  | { type: "replaceDrawings"; drawings: GeoJSON.FeatureCollection }
  | { type: "replaceLayerFeatures"; id: string; data: GeoJSON.FeatureCollection }
  | { type: "removeLayerFeature"; layerId: string; featureId: string | number }
  | { type: "replaceTempDrawing"; feature: GeoJSON.Feature | null }
  | { type: "clearDrawings" }
  | { type: "saveDrawingsAsLayer" }
  | { type: "moveLayer"; id: string; direction: "up" | "down" }
  | { type: "openWmsDialog" }
  | { type: "closeWmsDialog" }
  | { type: "openAttributeTable"; id: string }
  | { type: "closeAttributeTable" };

const initialState: GeoPortalState = {
  layers: [],
  searchQuery: "",
  sidebarOpen: true,
  theme: "dark",
  baseMap: "dark",
  drawMode: "none",
  drawings: { type: "FeatureCollection", features: [] },
  wmsDialogOpen: false,
  layerSettingsOpen: false,
};

function nextDrawingLayerName(layers: Layer[]): string {
  const used = new Set(
    layers
      .filter((l) => l.type === "drawing" && l.id !== DRAWING_SESSION_LAYER_ID)
      .map((l) => l.name.trim().toLowerCase()),
  );
  let n = 1;
  while (used.has(`dibujo ${n}`)) n += 1;
  return `Dibujo ${n}`;
}

function selectionIfFeatureMissing(
  state: GeoPortalState,
  layerId: string,
  data: GeoJSON.FeatureCollection,
): Pick<
  GeoPortalState,
  "selectedFeatureId" | "selectedFeatureLayerId" | "featureAttributesOpen"
> {
  if (state.selectedFeatureLayerId !== layerId) {
    return {
      selectedFeatureId: state.selectedFeatureId,
      selectedFeatureLayerId: state.selectedFeatureLayerId,
      featureAttributesOpen: state.featureAttributesOpen,
    };
  }
  const stillThere =
    state.selectedFeatureId != null &&
    data.features.some(
      (feature) => String(feature.id) === String(state.selectedFeatureId),
    );
  if (stillThere) {
    return {
      selectedFeatureId: state.selectedFeatureId,
      selectedFeatureLayerId: state.selectedFeatureLayerId,
      featureAttributesOpen: state.featureAttributesOpen,
    };
  }
  return {
    selectedFeatureId: undefined,
    selectedFeatureLayerId: undefined,
    featureAttributesOpen: false,
  };
}

function patchEditableLayerData(
  layer: Layer,
  data: GeoJSON.FeatureCollection,
): Layer {
  return {
    ...layer,
    data,
    stats: {
      featureCount: data.features.length,
      geometryType: layer.geometryType,
      propertyKeys:
        layer.fields?.map((field) => field.name) ??
        layer.stats?.propertyKeys ??
        [],
      bounds: layer.stats?.bounds,
    },
  };
}

function reducer(state: GeoPortalState, action: Action): GeoPortalState {
  switch (action.type) {
    case "toggleSidebar":
      return { ...state, sidebarOpen: !state.sidebarOpen };
    case "setSearch":
      return { ...state, searchQuery: action.query };
    case "setTheme": {
      return {
        ...state,
        theme: action.theme,
        baseMap:
          action.theme === "dark"
            ? "dark"
            : state.baseMap === "dark"
              ? "streets"
              : state.baseMap,
      };
    }
    case "setBaseMap":
      return { ...state, baseMap: action.baseMap };
    case "addLayer":
      return { ...state, layers: [...state.layers, action.layer] };
    case "removeLayer": {
      const layers = state.layers.filter((l) => l.id !== action.id);
      const leavingEdit = state.editingLayerId === action.id;
      return {
        ...state,
        layers,
        drawings:
          action.id === DRAWING_SESSION_LAYER_ID
            ? emptyFeatureCollection()
            : state.drawings,
        activeLayerId:
          state.activeLayerId === action.id ? undefined : state.activeLayerId,
        editingLayerId: leavingEdit ? undefined : state.editingLayerId,
        layerSettingsOpen:
          state.activeLayerId === action.id ? false : state.layerSettingsOpen,
        selectedFeatureId:
          leavingEdit || state.selectedFeatureLayerId === action.id
            ? undefined
            : state.selectedFeatureId,
        selectedFeatureLayerId:
          leavingEdit || state.selectedFeatureLayerId === action.id
            ? undefined
            : state.selectedFeatureLayerId,
        featureAttributesOpen:
          state.selectedFeatureLayerId === action.id
            ? false
            : state.featureAttributesOpen,
        attributeTableLayerId:
          state.attributeTableLayerId === action.id
            ? undefined
            : state.attributeTableLayerId,
        drawMode: leavingEdit ? "none" : state.drawMode,
      };
    }
    case "toggleLayer":
      return {
        ...state,
        layers: state.layers.map((l) =>
          l.id === action.id ? { ...l, visible: action.visible } : l,
        ),
      };
    case "updateLayer":
      return {
        ...state,
        layers: state.layers.map((l) =>
          l.id === action.id ? { ...l, ...action.patch } : l,
        ),
      };
    case "setActiveLayer":
      return {
        ...state,
        activeLayerId: action.id,
        layerSettingsOpen: false,
      };
    case "openLayerSettings":
      return {
        ...state,
        activeLayerId: action.id,
        layerSettingsOpen: true,
      };
    case "closeLayerSettings":
      return { ...state, layerSettingsOpen: false };
    case "startEditingLayer": {
      const layer = getEditableLayerById(state.layers, action.id);
      if (!layer) return state;
      return {
        ...state,
        activeLayerId: action.id,
        editingLayerId: action.id,
        drawMode: geometryTypeToDrawMode(layer.geometryType),
      };
    }
    case "stopEditingLayer":
      if (!state.editingLayerId) return state;
      return {
        ...state,
        editingLayerId: undefined,
        drawMode: "none",
      };
    case "setSelectedFeature":
      return {
        ...state,
        selectedFeatureId: action.id,
        selectedFeatureLayerId:
          action.id == null
            ? undefined
            : (action.layerId ?? state.selectedFeatureLayerId),
      };
    case "openFeatureAttributes": {
      if (action.skipIfOpen && state.featureAttributesOpen) return state;
      const layer = getEditableLayerById(state.layers, action.layerId);
      const feature = getEditableFeature(layer, action.featureId);
      if (!layer || !feature || feature.id == null) return state;
      return {
        ...state,
        selectedFeatureLayerId: action.layerId,
        selectedFeatureId: action.featureId,
        featureAttributesOpen: true,
      };
    }
    case "closeFeatureAttributes":
      if (!state.featureAttributesOpen) return state;
      return { ...state, featureAttributesOpen: false };
    case "updateFeatureProperties": {
      const target = getEditableLayerById(state.layers, action.layerId);
      if (!target?.data) return state;
      let found = false;
      const features = target.data.features.map((feature) => {
        if (String(feature.id) !== String(action.featureId)) return feature;
        found = true;
        return {
          ...feature,
          properties: { ...(action.properties ?? {}) },
        };
      });
      if (!found) return state;
      const data: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features,
      };
      return {
        ...state,
        layers: state.layers.map((layer) =>
          layer.id === action.layerId
            ? patchEditableLayerData(layer, data)
            : layer,
        ),
        featureAttributesOpen: false,
      };
    }
    case "setDrawMode": {
      const editing = getEditableLayerById(
        state.layers,
        state.editingLayerId,
      );
      if (
        editing &&
        !isDrawModeAllowedForEditable(action.mode, editing.geometryType)
      ) {
        return state;
      }
      return { ...state, drawMode: action.mode };
    }
    case "addDrawing": {
      const drawings: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [...state.drawings.features, action.feature],
      };
      return {
        ...state,
        drawings,
        layers: upsertDrawingSessionLayer(state.layers, drawings),
      };
    }
    case "replaceDrawings": {
      if (state.editingLayerId) {
        return state;
      }
      if (featureCollectionsEqual(state.drawings, action.drawings)) {
        return state;
      }
      return {
        ...state,
        drawings: action.drawings,
        layers: upsertDrawingSessionLayer(state.layers, action.drawings),
      };
    }
    case "replaceLayerFeatures": {
      const target = getEditableLayerById(state.layers, action.id);
      if (!target) return state;
      const data = snapshotToEditableFeatures(action.data, target);
      if (target.data && featureCollectionsEqual(target.data, data)) {
        return state;
      }
      return {
        ...state,
        layers: state.layers.map((layer) =>
          layer.id === action.id ? patchEditableLayerData(layer, data) : layer,
        ),
        ...selectionIfFeatureMissing(state, action.id, data),
      };
    }
    case "removeLayerFeature": {
      const target = getEditableLayerById(state.layers, action.layerId);
      if (!target?.data) return state;
      const data: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: target.data.features.filter(
          (feature) => String(feature.id) !== String(action.featureId),
        ),
      };
      if (data.features.length === target.data.features.length) return state;
      return {
        ...state,
        layers: state.layers.map((layer) =>
          layer.id === action.layerId
            ? patchEditableLayerData(layer, data)
            : layer,
        ),
        selectedFeatureId:
          state.selectedFeatureLayerId === action.layerId &&
          state.selectedFeatureId != null &&
          String(state.selectedFeatureId) === String(action.featureId)
            ? undefined
            : state.selectedFeatureId,
        selectedFeatureLayerId:
          state.selectedFeatureLayerId === action.layerId &&
          state.selectedFeatureId != null &&
          String(state.selectedFeatureId) === String(action.featureId)
            ? undefined
            : state.selectedFeatureLayerId,
        featureAttributesOpen:
          state.selectedFeatureLayerId === action.layerId &&
          state.selectedFeatureId != null &&
          String(state.selectedFeatureId) === String(action.featureId)
            ? false
            : state.featureAttributesOpen,
      };
    }
    case "replaceTempDrawing":
      // handled inside MapViewer; state storage optional; skip for now
      return state;
    case "clearDrawings":
      return {
        ...state,
        drawings: emptyFeatureCollection(),
        layers: upsertDrawingSessionLayer(
          state.layers,
          emptyFeatureCollection(),
        ),
      };
    case "saveDrawingsAsLayer": {
      if (state.editingLayerId) {
        return state;
      }
      const drawingData: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [...state.drawings.features],
      };
      const color_code =
        "#" + Math.floor(Math.random() * 16777215).toString(16);
      const layer = createDrawingLayer({
        id: crypto.randomUUID(),
        name: nextDrawingLayerName(state.layers),
        data: drawingData,
        color: color_code,
      });
      return {
        ...state,
        layers: [
          ...state.layers.filter((l) => l.id !== DRAWING_SESSION_LAYER_ID),
          layer,
        ],
        drawings: emptyFeatureCollection(),
        drawMode: "none",
      };
    }
    case "moveLayer": {
      const idx = state.layers.findIndex((l) => l.id === action.id);
      if (idx < 0) return state;
      const layers = [...state.layers];
      const swapWith = action.direction === "up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= layers.length) return state;
      const tmp = layers[idx];
      layers[idx] = layers[swapWith];
      layers[swapWith] = tmp;
      return { ...state, layers };
    }
    case "openWmsDialog":
      return { ...state, wmsDialogOpen: true };
    case "closeWmsDialog":
      return { ...state, wmsDialogOpen: false };
    case "openAttributeTable": {
      const layer = getEditableLayerById(state.layers, action.id);
      if (!layer) return state;
      return { ...state, attributeTableLayerId: action.id };
    }
    case "closeAttributeTable":
      if (!state.attributeTableLayerId) return state;
      return { ...state, attributeTableLayerId: undefined };
    default:
      return state;
  }
}

export type DrawEngine = {
  setMode: (mode: GeoPortalState["drawMode"]) => void;
  clear: () => void;
  deleteSelected: () => void;
  removeFeatures: (ids: Array<string | number>) => void;
};

export const GeoPortalContext = React.createContext<{
  state: GeoPortalState;
  dispatch: React.Dispatch<Action>;
  drawEngineRef: React.MutableRefObject<DrawEngine | null>;
  mapRef: React.MutableRefObject<MapLibreMap | null>;
} | null>(null);

export function GeoPortalApp(): JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState, (s): GeoPortalState => {
    const savedTheme =
      (localStorage.getItem("geoportal:theme") as "light" | "dark" | null) ??
      s.theme;
    const theme = savedTheme;
    const baseMap: GeoPortalState["baseMap"] =
      theme === "dark" ? "dark" : "streets";
    const persistedLayers = loadDrawingLayers();
    return {
      ...s,
      theme,
      baseMap,
      layers: persistedLayers,
      drawings: getSessionDrawings(persistedLayers),
    };
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", state.theme === "dark");
    localStorage.setItem("geoportal:theme", state.theme);
  }, [state.theme]);

  useEffect(() => {
    saveDrawingLayers(state.layers);
  }, [state.layers]);

  const drawEngineRef = useRef<DrawEngine | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const ctx = useMemo(
    () => ({ state, dispatch, drawEngineRef, mapRef }),
    [state],
  );

  return (
    <GeoPortalContext.Provider value={ctx}>
      <div
        className="h-full w-full grid"
        style={{
          gridTemplateColumns: state.sidebarOpen ? "320px 1fr" : "0 1fr",
        }}
      >
        <aside
          className={`relative h-full overflow-hidden border-r ${state.sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
          <Sidebar />
        </aside>
        <main className="h-full flex flex-col">
          <Header />
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1">
              <MapViewer />
              <LayerSettingsDialog />
              <FeatureAttributesDialog />
              <WmsDialog
                open={state.wmsDialogOpen}
                onOpenChange={(o) =>
                  dispatch({ type: o ? "openWmsDialog" : "closeWmsDialog" })
                }
                onAdd={(url, names) => {
                  for (const nm of names) {
                    const id = crypto.randomUUID();
                    const layer: Layer = {
                      id,
                      name: nm,
                      type: "wms",
                      visible: true,
                      wmsUrl: url,
                      wmsLayers: nm,
                    };
                    dispatch({ type: "addLayer", layer });
                  }
                  dispatch({ type: "closeWmsDialog" });
                }}
              />
            </div>
            <AttributeTable />
          </div>
        </main>
      </div>
    </GeoPortalContext.Provider>
  );
}
