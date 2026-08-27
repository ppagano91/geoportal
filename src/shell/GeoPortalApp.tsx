import React, { useEffect, useMemo, useReducer, useRef } from "react";
import type { GeoPortalState, Layer } from "../types/geoportal";
import { Header } from "../components/geoportal/Header";
import { Sidebar } from "../components/geoportal/Sidebar";
import { MapViewer } from "../components/geoportal/MapViewer";
import { WmsDialog } from "../components/geoportal/WmsDialog";
import { LayerSettingsDialog } from "../components/geoportal/LayerSettingsDialog";

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

function inferGeometryType(
  fc: GeoJSON.FeatureCollection,
): Layer["geometryType"] {
  for (const f of fc.features) {
    const t = f.geometry?.type;
    if (
      t &&
      (t === "Point" ||
        t === "MultiPoint" ||
        t === "LineString" ||
        t === "MultiLineString" ||
        t === "Polygon" ||
        t === "MultiPolygon")
    ) {
      return t;
    }
  }
  return undefined;
}

function nextDrawingLayerName(layers: Layer[]): string {
  const used = new Set(
    layers
      .filter((l) => l.type === "drawing")
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
              ? "light"
              : state.baseMap,
      };
    }
    case "setBaseMap":
      return { ...state, baseMap: action.baseMap };
    case "addLayer":
      return { ...state, layers: [...state.layers, action.layer] };
    case "removeLayer":
      return {
        ...state,
        layers: state.layers.filter((l) => l.id !== action.id),
      };
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
      return { ...state, drawings };
    }
    case "replaceDrawings":
      return { ...state, drawings: action.drawings };
    case "replaceTempDrawing":
      // handled inside MapViewer; state storage optional; skip for now
      return state;
    case "clearDrawings":
      return {
        ...state,
        drawings: { type: "FeatureCollection", features: [] },
      };
    case "saveDrawingsAsLayer": {
      const id = crypto.randomUUID();
      const drawingData: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [...state.drawings.features],
      };
      const color_code =
        "#" + Math.floor(Math.random() * 16777215).toString(16);
      const layer: Layer = {
        id,
        name: nextDrawingLayerName(state.layers),
        type: "drawing",
        visible: true,
        data: drawingData,
        geometryType: inferGeometryType(drawingData),
        pointStyle: {
          type: "circle",
          size: 10,
          color: color_code,
          strokeColor: color_code,
          strokeWidth: 1.5,
        },
        lineStyle: { color: color_code, width: 2, lineCap: "round" },
        polygonStyle: {
          fillColor: color_code,
          fillOpacity: 0.2,
          strokeColor: color_code,
          strokeWidth: 1.5,
        },
      };
      return {
        ...state,
        layers: [...state.layers, layer],
        drawings: { type: "FeatureCollection", features: [] },
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
  const [state, dispatch] = useReducer(reducer, initialState, (s) => {
    const savedTheme =
      (localStorage.getItem("geoportal:theme") as "light" | "dark" | null) ??
      s.theme;
    const theme = savedTheme;
    const baseMap = theme === "dark" ? "dark" : "light";
    return { ...s, theme, baseMap };
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", state.theme === "dark");
    localStorage.setItem("geoportal:theme", state.theme);
  }, [state.theme]);

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
