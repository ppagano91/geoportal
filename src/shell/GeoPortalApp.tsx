import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { GeoPortalState, Layer, StatisticsSelection } from "../types/geoportal";
import { getFeatureId } from "../statistics/selection";
import type { MobilePanel } from "../config/breakpoints";
import { Header } from "../components/geoportal/Header";
import { Sidebar, type SidebarTab } from "../components/geoportal/Sidebar";
import { MapViewer } from "../components/geoportal/MapViewer";
import { WmsDialog } from "../components/geoportal/WmsDialog";
import { WfsDialog } from "../components/geoportal/WfsDialog";
import { LayerSettingsDialog } from "../components/geoportal/LayerSettingsDialog";
import { FeatureAttributesDialog } from "../components/geoportal/FeatureAttributesDialog";
import { AttributeTable } from "../components/geoportal/AttributeTable";
import { StatisticsPanel } from "../components/geoportal/StatisticsPanel";
import { MobileBottomNav } from "../components/geoportal/MobileBottomNav";
import { useResponsive } from "../hooks/useResponsive";
import { cn } from "../utils/cn";
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
import {
  loadWfsLayers,
  patchWfsLayerData,
  saveWfsLayers,
} from "../persistence/wfsLayers";
import { fetchWfsFeatures } from "../utils/wfs";

type Action =
  | { type: "toggleSidebar" }
  | { type: "setSidebarOpen"; open: boolean }
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
  | { type: "setMeasureMode"; mode: GeoPortalState["measureMode"] }
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
  | { type: "openWfsDialog" }
  | { type: "closeWfsDialog" }
  | { type: "openAttributeTable"; id: string }
  | { type: "closeAttributeTable" }
  | { type: "toggleStatistics" }
  | { type: "closeStatistics"; keepSelection?: boolean }
  | { type: "setStatisticsSelection"; selection: GeoPortalState["statisticsSelection"] }
  | { type: "clearStatisticsSelection" };

const initialState: GeoPortalState = {
  layers: [],
  searchQuery: "",
  sidebarOpen: true,
  theme: "dark",
  baseMap: "dark",
  drawMode: "none",
  measureMode: "none",
  drawings: { type: "FeatureCollection", features: [] },
  wmsDialogOpen: false,
  wfsDialogOpen: false,
  layerSettingsOpen: false,
  statisticsOpen: false,
};

function pruneStatisticsSelection(
  selection: StatisticsSelection | undefined,
  layers: Layer[],
): StatisticsSelection | undefined {
  if (!selection || selection.featureIds.length === 0) return undefined;
  const layer = layers.find((item) => item.id === selection.layerId);
  const features = layer?.data?.features;
  if (!features || features.length === 0) return undefined;
  const existing = new Set<string>();
  for (const feature of features) {
    const id = getFeatureId(feature);
    if (id != null) existing.add(String(id));
  }
  const featureIds = selection.featureIds.filter((id) =>
    existing.has(String(id)),
  );
  if (featureIds.length === 0) return undefined;
  if (featureIds.length === selection.featureIds.length) return selection;
  return { ...selection, featureIds };
}

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
    case "setSidebarOpen":
      if (state.sidebarOpen === action.open) return state;
      return { ...state, sidebarOpen: action.open };
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
        statisticsSelection:
          state.statisticsSelection?.layerId === action.id
            ? undefined
            : state.statisticsSelection,
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
    case "updateLayer": {
      const layers = state.layers.map((l) =>
        l.id === action.id ? { ...l, ...action.patch } : l,
      );
      return {
        ...state,
        layers,
        statisticsSelection: pruneStatisticsSelection(
          state.statisticsSelection,
          layers,
        ),
      };
    }
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
        measureMode: "none",
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
      return {
        ...state,
        drawMode: action.mode,
        measureMode: action.mode === "none" ? state.measureMode : "none",
      };
    }
    case "setMeasureMode": {
      if (action.mode === state.measureMode) return state;
      return {
        ...state,
        measureMode: action.mode,
        drawMode: action.mode === "none" ? state.drawMode : "none",
      };
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
      const layers = upsertDrawingSessionLayer(state.layers, action.drawings);
      return {
        ...state,
        drawings: action.drawings,
        layers,
        statisticsSelection: pruneStatisticsSelection(
          state.statisticsSelection,
          layers,
        ),
      };
    }
    case "replaceLayerFeatures": {
      const target = getEditableLayerById(state.layers, action.id);
      if (!target) return state;
      const data = snapshotToEditableFeatures(action.data, target);
      if (target.data && featureCollectionsEqual(target.data, data)) {
        return state;
      }
      const layers = state.layers.map((layer) =>
        layer.id === action.id ? patchEditableLayerData(layer, data) : layer,
      );
      return {
        ...state,
        layers,
        ...selectionIfFeatureMissing(state, action.id, data),
        statisticsSelection: pruneStatisticsSelection(
          state.statisticsSelection,
          layers,
        ),
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
      const layers = state.layers.map((layer) =>
        layer.id === action.layerId
          ? patchEditableLayerData(layer, data)
          : layer,
      );
      return {
        ...state,
        layers,
        statisticsSelection: pruneStatisticsSelection(
          state.statisticsSelection,
          layers,
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
    case "clearDrawings": {
      const layers = upsertDrawingSessionLayer(
        state.layers,
        emptyFeatureCollection(),
      );
      return {
        ...state,
        drawings: emptyFeatureCollection(),
        layers,
        statisticsSelection: pruneStatisticsSelection(
          state.statisticsSelection,
          layers,
        ),
      };
    }
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
      const layers = [
        ...state.layers.filter((l) => l.id !== DRAWING_SESSION_LAYER_ID),
        layer,
      ];
      return {
        ...state,
        layers,
        drawings: emptyFeatureCollection(),
        drawMode: "none",
        statisticsSelection: pruneStatisticsSelection(
          state.statisticsSelection,
          layers,
        ),
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
    case "openWfsDialog":
      return { ...state, wfsDialogOpen: true };
    case "closeWfsDialog":
      return { ...state, wfsDialogOpen: false };
    case "openAttributeTable": {
      const layer = state.layers.find((item) => item.id === action.id);
      if (!layer) return state;
      if (layer.type !== "editable" && layer.type !== "wfs") return state;
      return { ...state, attributeTableLayerId: action.id };
    }
    case "closeAttributeTable":
      if (!state.attributeTableLayerId) return state;
      return { ...state, attributeTableLayerId: undefined };
    case "toggleStatistics":
      if (state.statisticsOpen) {
        return { ...state, statisticsOpen: false, statisticsSelection: undefined };
      }
      return { ...state, statisticsOpen: true };
    case "closeStatistics":
      if (!state.statisticsOpen) return state;
      return {
        ...state,
        statisticsOpen: false,
        statisticsSelection: action.keepSelection
          ? state.statisticsSelection
          : undefined,
      };
    case "setStatisticsSelection": {
      const next = action.selection;
      if (!next || next.featureIds.length === 0) {
        if (!state.statisticsSelection) return state;
        return { ...state, statisticsSelection: undefined };
      }
      return { ...state, statisticsSelection: next };
    }
    case "clearStatisticsSelection":
      if (!state.statisticsSelection) return state;
      return { ...state, statisticsSelection: undefined };
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

export type MeasureEngine = {
  setMode: (mode: GeoPortalState["measureMode"]) => void;
  clear: () => void;
};

export const GeoPortalContext = React.createContext<{
  state: GeoPortalState;
  dispatch: React.Dispatch<Action>;
  drawEngineRef: React.MutableRefObject<DrawEngine | null>;
  measureEngineRef: React.MutableRefObject<MeasureEngine | null>;
  mapRef: React.MutableRefObject<MapLibreMap | null>;
} | null>(null);

export function GeoPortalApp(): JSX.Element {
  const { mode, isMobile, isTablet, isDesktop } = useResponsive();
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [state, dispatch] = useReducer(reducer, initialState, (s): GeoPortalState => {
    const savedTheme =
      (localStorage.getItem("geoportal:theme") as "light" | "dark" | null) ??
      s.theme;
    const theme = savedTheme;
    const baseMap: GeoPortalState["baseMap"] =
      theme === "dark" ? "dark" : "streets";
    const persistedLayers = [...loadDrawingLayers(), ...loadWfsLayers()];
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
    saveWfsLayers(state.layers);
  }, [state.layers]);

  useEffect(() => {
    let cancelled = false;
    const persisted = loadWfsLayers();
    for (const layer of persisted) {
      void (async () => {
        try {
          const result = await fetchWfsFeatures({
            serviceUrl: layer.wfsUrl,
            typeName: layer.wfsTypeName,
            version: layer.wfsVersion,
          });
          if (cancelled) return;
          const next = patchWfsLayerData(
            layer,
            result.collection,
            result.truncated,
          );
          dispatch({
            type: "updateLayer",
            id: layer.id,
            patch: {
              data: next.data,
              stats: next.stats,
              geometryType: next.geometryType,
              fields: next.fields,
              wfsTruncated: next.wfsTruncated,
            },
          });
        } catch (error) {
          if (cancelled) return;
          console.warn(
            `[geoportal] no se pudo restaurar la capa WFS «${layer.name}»`,
            error,
          );
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setMobilePanel(null);
    dispatch({ type: "setSidebarOpen", open: isDesktop });
    if (isMobile) {
      dispatch({ type: "stopEditingLayer" });
      dispatch({ type: "closeFeatureAttributes" });
    }
  }, [mode, isDesktop, isMobile]);

  useEffect(() => {
    if (state.statisticsOpen && isMobile) {
      setMobilePanel(null);
    }
  }, [state.statisticsOpen, isMobile]);

  useEffect(() => {
    const lock =
      isMobile &&
      (mobilePanel === "layers" ||
        mobilePanel === "wms" ||
        mobilePanel === "wfs" ||
        !!state.statisticsOpen);
    document.body.classList.toggle("gp-scroll-lock", lock);
    return () => {
      document.body.classList.remove("gp-scroll-lock");
    };
  }, [isMobile, mobilePanel, state.statisticsOpen]);

  const drawEngineRef = useRef<DrawEngine | null>(null);
  const measureEngineRef = useRef<MeasureEngine | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const ctx = useMemo(
    () => ({ state, dispatch, drawEngineRef, measureEngineRef, mapRef }),
    [state],
  );

  const sheetOpen =
    isMobile &&
    (mobilePanel === "layers" ||
      mobilePanel === "wms" ||
      mobilePanel === "wfs");
  const overlayOpen = isTablet && state.sidebarOpen;
  const sidebarTab: SidebarTab | undefined =
    mobilePanel === "layers" || mobilePanel === "wms" || mobilePanel === "wfs"
      ? mobilePanel
      : undefined;

  function closeChrome() {
    setMobilePanel(null);
    if (!isDesktop) {
      dispatch({ type: "setSidebarOpen", open: false });
    }
  }

  const dialogs = (
    <>
      <LayerSettingsDialog />
      <FeatureAttributesDialog />
      <WmsDialog
        open={state.wmsDialogOpen}
        onOpenChange={(o) =>
          dispatch({ type: o ? "openWmsDialog" : "closeWmsDialog" })
        }
        onAdd={({ url, version, infoFormats, layers }) => {
          for (const item of layers) {
            const id = crypto.randomUUID();
            const layer: Layer = {
              id,
              name: item.name,
              type: "wms",
              visible: true,
              wmsUrl: url,
              wmsLayers: item.name,
              wmsVersion: version || undefined,
              wmsQueryable: item.queryable,
              wmsInfoFormats: infoFormats,
            };
            dispatch({ type: "addLayer", layer });
          }
          dispatch({ type: "closeWmsDialog" });
        }}
      />
      <WfsDialog
        open={state.wfsDialogOpen}
        onOpenChange={(o) =>
          dispatch({ type: o ? "openWfsDialog" : "closeWfsDialog" })
        }
        onAdd={(layers) => {
          for (const layer of layers) {
            dispatch({ type: "addLayer", layer });
          }
        }}
      />
    </>
  );

  return (
    <GeoPortalContext.Provider value={ctx}>
      <div
        className="flex h-full max-h-dvh w-full overflow-hidden"
        data-mode={mode}
      >
        {isDesktop && (
          <aside
            className={cn(
              "gp-sidebar-panel relative h-full shrink-0 overflow-hidden border-r bg-background transition-[width,opacity] duration-200",
              state.sidebarOpen
                ? "w-80 opacity-100"
                : "w-0 opacity-0 pointer-events-none",
            )}
          >
            <Sidebar presentation="docked" />
          </aside>
        )}
        <main className="flex h-full min-w-0 flex-1 flex-col">
          <Header />
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <MapViewer />
              {dialogs}
              {overlayOpen && (
                <button
                  type="button"
                  aria-label="Cerrar panel"
                  className="absolute inset-0 z-sidebar bg-black/35"
                  onClick={closeChrome}
                />
              )}
              {isTablet && (
                <aside
                  className={cn(
                    "gp-sidebar-panel absolute inset-y-0 left-0 z-sidebar flex w-[min(20rem,85vw)] flex-col overflow-hidden border-r bg-background shadow-card transition-transform duration-200",
                    overlayOpen
                      ? "translate-x-0"
                      : "-translate-x-full pointer-events-none",
                  )}
                  aria-hidden={!overlayOpen}
                >
                  <Sidebar
                    presentation="overlay"
                    onClose={closeChrome}
                  />
                </aside>
              )}
            </div>
            <AttributeTable />
            {isMobile && sheetOpen && (
              <aside
                className="gp-sidebar-panel absolute inset-0 z-sidebar flex flex-col overflow-hidden bg-background"
                aria-label="Panel de capas"
              >
                <Sidebar
                  presentation="sheet"
                  tab={sidebarTab}
                  onTabChange={(next) => setMobilePanel(next)}
                  onClose={closeChrome}
                />
              </aside>
            )}
            <StatisticsPanel />
          </div>
          {isMobile && (
            <MobileBottomNav
              active={mobilePanel}
              onChange={(panel) => {
                setMobilePanel(panel);
                if (panel != null) {
                  dispatch({ type: "closeStatistics" });
                }
                dispatch({ type: "setSidebarOpen", open: panel != null });
              }}
            />
          )}
        </main>
      </div>
    </GeoPortalContext.Provider>
  );
}
