import React, { useEffect, useMemo, useReducer, useRef } from "react";
import type { GeoPortalState, Layer } from "../types/geoportal";
import { Header } from "../components/geoportal/Header";
import { Sidebar } from "../components/geoportal/Sidebar";
import { MapViewer } from "../components/geoportal/MapViewer";
import { WmsDialog } from "../components/geoportal/WmsDialog";
import { LayerSettingsDialog } from "../components/geoportal/LayerSettingsDialog";
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
  | { type: "setDrawMode"; mode: GeoPortalState["drawMode"] }
  | { type: "addDrawing"; feature: GeoJSON.Feature }
  | { type: "replaceDrawings"; drawings: GeoJSON.FeatureCollection }
  | { type: "replaceTempDrawing"; feature: GeoJSON.Feature | null }
  | { type: "clearDrawings" }
  | { type: "saveDrawingsAsLayer" }
  | { type: "moveLayer"; id: string; direction: "up" | "down" }
  | { type: "openWmsDialog" }
  | { type: "closeWmsDialog" };

const initialState: GeoPortalState = {
  layers: [],
  searchQuery: "",
  sidebarOpen: true,
  theme: "dark",
  baseMap: "dark",
  drawMode: "none",
  drawings: { type: "FeatureCollection", features: [] },
  wmsDialogOpen: false,
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
      return {
        ...state,
        layers,
        drawings:
          action.id === DRAWING_SESSION_LAYER_ID
            ? emptyFeatureCollection()
            : state.drawings,
        activeLayerId:
          state.activeLayerId === action.id ? undefined : state.activeLayerId,
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
      return { ...state, activeLayerId: action.id };
    case "setDrawMode":
      return { ...state, drawMode: action.mode };
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
      if (featureCollectionsEqual(state.drawings, action.drawings)) {
        return state;
      }
      return {
        ...state,
        drawings: action.drawings,
        layers: upsertDrawingSessionLayer(state.layers, action.drawings),
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
    default:
      return state;
  }
}

export type DrawEngine = {
  setMode: (mode: GeoPortalState["drawMode"]) => void;
  clear: () => void;
  deleteSelected: () => void;
};

export const GeoPortalContext = React.createContext<{
  state: GeoPortalState;
  dispatch: React.Dispatch<Action>;
  drawEngineRef: React.MutableRefObject<DrawEngine | null>;
} | null>(null);

export function GeoPortalApp(): JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState, (s): GeoPortalState => {
    const savedTheme =
      (localStorage.getItem("geoportal:theme") as "light" | "dark" | null) ??
      s.theme;
    const theme = savedTheme;
    const baseMap: GeoPortalState["baseMap"] =
      theme === "dark" ? "dark" : "streets";
    const drawingLayers = loadDrawingLayers();
    return {
      ...s,
      theme,
      baseMap,
      layers: drawingLayers,
      drawings: getSessionDrawings(drawingLayers),
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
  const ctx = useMemo(
    () => ({ state, dispatch, drawEngineRef }),
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
          <div className="flex-1 relative">
            <MapViewer />
            <LayerSettingsDialog />
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
        </main>
      </div>
    </GeoPortalContext.Provider>
  );
}
