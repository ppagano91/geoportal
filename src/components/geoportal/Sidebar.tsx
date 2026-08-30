import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { GeoPortalContext } from "../../shell/GeoPortalApp";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { ScrollArea } from "../ui/ScrollArea";
import { ArrowDown, ArrowUp, Check, Download, Eye, EyeOff, Locate, MoreVertical, Pencil, Plus, Settings2, Table2, Trash2, Upload, MapPinPlus, LayersPlus  } from "lucide-react";
import type { Layer } from "../../types/geoportal";
import { DRAWING_SESSION_LAYER_ID } from "../../persistence/drawingLayers";
import { geometryTypeLabel } from "../../persistence/editableLayers";
import { createEditableLayerFromGeoJSON } from "../../persistence/importGeoJSON";
import { createEditableLayerFromWfs } from "../../persistence/wfsLayers";
import {
  exportLayerToGeoJSON,
} from "../../utils/exportGeoJSON";
import { zoomToFeatureCollection } from "../../utils/geo";
import { DEFAULT_WFS_FEATURE_LIMIT } from "../../utils/wfs";
import { CreateEditableLayerDialog } from "./CreateEditableLayerDialog";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/Dialog";
import { cn } from "../../utils/cn";

type SidebarTab = "layers" | "wms" | "wfs";

const SIDEBAR_TABS: { id: SidebarTab; label: string }[] = [
  { id: "layers", label: "Capas" },
  { id: "wms", label: "WMS" },
  { id: "wfs", label: "WFS" },
];

const LOCAL_LAYER_TYPES = new Set<Layer["type"]>([
  "editable",
  "user",
  "drawing",
]);

function isLocalProjectLayer(layer: Layer): boolean {
  return (
    LOCAL_LAYER_TYPES.has(layer.type) &&
    layer.id !== DRAWING_SESSION_LAYER_ID
  );
}

function matchesSearch(layer: Layer, query: string): boolean {
  if (!query) return true;
  return layer.name.toLowerCase().includes(query.toLowerCase());
}

function layerListSubtitle(layer: Layer): string {
  if (layer.type === "wms") return "WMS";
  if (layer.type === "wfs") {
    const count = layer.data?.features.length ?? 0;
    const entities = `${count} ${count === 1 ? "entidad" : "entidades"}`;
    return layer.wfsTruncated
      ? `Vectorial · ${entities} (límite)`
      : `Vectorial · ${entities}`;
  }
  if (layer.type === "drawing") {
    return `Dibujo · ${geometryTypeLabel(layer.geometryType)}`;
  }
  if (layer.type === "editable") {
    const count = layer.data?.features.length ?? 0;
    return `Editable · ${geometryTypeLabel(layer.geometryType)} · ${count} ${
      count === 1 ? "entidad" : "entidades"
    }`;
  }
  return geometryTypeLabel(layer.geometryType);
}

function LayerActionButton({
  title,
  onClick,
  children,
  active,
  destructive,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  destructive?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "control h-7 w-7 shrink-0 p-0",
        active ? "border-primary bg-primary text-primary-foreground" : null,
        destructive && !active ? "text-destructive" : null,
      )}
    >
      {children}
    </button>
  );
}

const ACTION_ICON = "h-3.5 w-3.5";

export function Sidebar(): JSX.Element {
  const ctx = useContext(GeoPortalContext)!;
  const { state, dispatch, measureEngineRef, mapRef } = ctx;
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab>("layers");
  const [createEditableOpen, setCreateEditableOpen] = useState(false);
  const [moreMenuLayerId, setMoreMenuLayerId] = useState<string | null>(null);
  const [layerPendingDeletion, setLayerPendingDeletion] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    kind: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  function confirmDeleteLayer() {
    if (!layerPendingDeletion) return;
    const { id } = layerPendingDeletion;
    setLayerPendingDeletion(null);
    if (state.editingLayerId === id) {
      dispatch({ type: "stopEditingLayer" });
    }
    dispatch({ type: "removeLayer", id });
  }

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!moreMenuLayerId) return;
    function onPointerDown(event: MouseEvent) {
      if (moreMenuRef.current?.contains(event.target as Node)) return;
      setMoreMenuLayerId(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [moreMenuLayerId]);

  const query = state.searchQuery;
  const localLayers = useMemo(
    () =>
      state.layers.filter(
        (l) => isLocalProjectLayer(l) && matchesSearch(l, query),
      ),
    [state.layers, query],
  );
  const wmsLayers = useMemo(
    () =>
      state.layers.filter(
        (l) => l.type === "wms" && matchesSearch(l, query),
      ),
    [state.layers, query],
  );
  const wfsLayers = useMemo(
    () =>
      state.layers.filter(
        (l) => l.type === "wfs" && matchesSearch(l, query),
      ),
    [state.layers, query],
  );

  const displayedLayers =
    activeTab === "layers"
      ? localLayers
      : activeTab === "wms"
        ? wmsLayers
        : wfsLayers;

  const emptyMessage =
    activeTab === "layers"
      ? "No hay capas."
      : activeTab === "wms"
        ? "No hay capas WMS cargadas."
        : "No hay capas WFS cargadas.";

  function isGeoJSONFile(file: File): boolean {
    const name = file.name.toLowerCase();
    return (
      name.endsWith(".geojson") ||
      name.endsWith(".json") ||
      file.type === "application/geo+json" ||
      file.type === "application/json"
    );
  }

  async function importGeoJSONFile(file: File): Promise<string | null> {
    let text: string;
    try {
      text = await file.text();
    } catch {
      return "No se pudo leer el archivo.";
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return "El archivo no es un GeoJSON válido.";
    }
    const name = file.name.replace(/\.(geo)?json$/i, "") || "Capa importada";
    const result = createEditableLayerFromGeoJSON({ name, geojson: parsed });
    if ("error" in result) return result.error;
    dispatch({ type: "addLayer", layer: result.layer });
    dispatch({ type: "setActiveLayer", id: result.layer.id });
    return null;
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(isGeoJSONFile);
    if (files.length === 0) {
      setImportError("Seleccioná un archivo GeoJSON.");
      return;
    }
    void (async () => {
      const errors: string[] = [];
      for (const file of files) {
        const error = await importGeoJSONFile(file);
        if (error) {
          errors.push(files.length > 1 ? `${file.name}: ${error}` : error);
        }
      }
      setImportError(errors.length > 0 ? errors.join(" ") : null);
    })();
  }

  function onSelectFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    onDrop({
      preventDefault: () => void 0,
      dataTransfer: dt,
    } as unknown as React.DragEvent<HTMLDivElement>);
    e.currentTarget.value = "";
  }

  function convertWfsToLocal(layer: Layer) {
    setMoreMenuLayerId(null);
    const result = createEditableLayerFromWfs(layer, state.layers);
    if ("error" in result) {
      setNotice({ kind: "error", text: result.error });
      return;
    }
    dispatch({ type: "addLayer", layer: result.layer });
    dispatch({ type: "setActiveLayer", id: result.layer.id });
    setActiveTab("layers");
    setNotice(
      result.truncated
        ? {
            kind: "info",
            text: `La capa local se creó con las ${DEFAULT_WFS_FEATURE_LIMIT} entidades actualmente cargadas del WFS.`,
          }
        : { kind: "success", text: "Capa local creada correctamente." },
    );
  }

  return (
    <div className="h-full flex flex-col">
      <nav
        className="flex shrink-0 overflow-hidden border-b"
        role="tablist"
        aria-label="Capas del mapa"
      >
        {SIDEBAR_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setActiveTab(tab.id);
                setMoreMenuLayerId(null);
              }}
              className={cn(
                "min-w-0 flex-1 truncate px-1 py-2 text-center text-sm border-b-2 -mb-px",
                active
                  ? "border-primary bg-muted/70 font-medium text-foreground"
                  : "border-transparent font-normal text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
      {activeTab === "layers" && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="p-3 border-b"
        >
          <div className="surface p-3 border-dashed border-2 border-border/60 text-sm text-muted-foreground rounded-md text-center">
            Arrastra y suelta GeoJSON aquí
            <div className="mt-2">
              <input
                ref={inputRef}
                type="file"
                accept=".json,.geojson,application/geo+json,application/json"
                className="hidden"
                onChange={onSelectFile}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" /> Seleccionar archivo
              </Button>
            </div>
            {importError && (
              <p className="mt-2 text-left text-xs text-destructive">
                {importError}
              </p>
            )}
          </div>
          <Button
            className="mt-3 w-full"
            onClick={() => setCreateEditableOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" /> Crear capa editable
          </Button>
        </div>
      )}
      {activeTab === "wms" && (
        <div className="p-3 border-b">
          <Button
            className="w-full"
            size="sm"
            onClick={() => dispatch({ type: "openWmsDialog" })}
          >
            <Plus className="mr-2 h-4 w-4" /> Agregar WMS
          </Button>
        </div>
      )}
      {activeTab === "wfs" && (
        <div className="p-3 border-b">
          <Button
            className="w-full"
            size="sm"
            onClick={() => dispatch({ type: "openWfsDialog" })}
          >
            <Plus className="mr-2 h-4 w-4" /> Agregar WFS
          </Button>
        </div>
      )}
      <CreateEditableLayerDialog
        open={createEditableOpen}
        onOpenChange={setCreateEditableOpen}
        onCreate={(layer) => {
          dispatch({ type: "addLayer", layer });
          dispatch({ type: "setActiveLayer", id: layer.id });
        }}
      />
      <Dialog
        open={!!layerPendingDeletion}
        onOpenChange={(open) => {
          if (!open) setLayerPendingDeletion(null);
        }}
        className="w-full max-w-sm p-4"
      >
        <DialogHeader>
          <DialogTitle>Eliminar capa</DialogTitle>
          <DialogDescription>
            {`¿Seguro que querés eliminar la capa "${layerPendingDeletion?.name ?? ""}"?`}
          </DialogDescription>
          <DialogDescription className="mt-2 text-sm text-muted-foreground">
            Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => setLayerPendingDeletion(null)}
          >
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirmDeleteLayer}>
            Eliminar
          </Button>
        </DialogFooter>
      </Dialog>
      <div className="p-3">
        {notice && (
          <div className="mb-2 h-5 overflow-hidden">
            <div
              role={notice.kind === "error" ? "alert" : undefined}
              className={
                notice.kind === "error"
                  ? "h-full overflow-y-auto px-1 text-xs leading-4 text-destructive"
                  : "h-full overflow-y-auto px-1 text-xs leading-4 text-muted-foreground"
              }
            >
              {notice.text}
            </div>
          </div>
        )}
        <Input
          placeholder="Filtrar capas"
          value={state.searchQuery}
          onChange={(e) =>
            dispatch({ type: "setSearch", query: e.target.value })
          }
        />
      </div>
      <ScrollArea className="flex-1 px-3 pb-3">
        {displayedLayers.length === 0 && (
          <div className="text-sm text-muted-foreground p-3">
            {emptyMessage}
          </div>
        )}
        <div className="flex flex-col gap-2 mt-1">
          {displayedLayers.map((l) => (
            <div
              key={l.id}
              className={`surface flex flex-col gap-1.5 p-2 ${
                l.id === state.editingLayerId
                  ? "ring-1 ring-primary"
                  : l.id === state.activeLayerId
                    ? "ring-1 ring-ring"
                    : ""
              }`}
            >
              <button
                className="min-w-0 w-full text-left"
                onClick={() =>
                  dispatch({
                    type: "setActiveLayer",
                    id: state.activeLayerId === l.id ? undefined : l.id,
                  })
                }
                title={l.name}
              >
                <div className="truncate font-medium">{l.name}
                {l.id === state.editingLayerId && (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-primary ml-2">
                    En edición
                  </span>
                )}
                  </div>
                <div className="truncate text-xs text-muted-foreground">
                  {layerListSubtitle(l)}
                </div>
                {/* {l.id === state.editingLayerId && (
                  <div className="text-[10px] font-medium uppercase tracking-wide text-primary">
                    En edición
                  </div>
                )} */}
              </button>
              <div
                ref={moreMenuLayerId === l.id ? moreMenuRef : undefined}
                className="flex flex-col gap-1"
              >
                <div className="flex items-center gap-0.5">
                  <LayerActionButton
                    title="Mostrar/Ocultar"
                    onClick={() =>
                      dispatch({
                        type: "toggleLayer",
                        id: l.id,
                        visible: !l.visible,
                      })
                    }
                  >
                    {l.visible ? (
                      <Eye className={ACTION_ICON} />
                    ) : (
                      <EyeOff className={ACTION_ICON} />
                    )}
                  </LayerActionButton>
                  {l.type === "wfs" && (
                    <LayerActionButton
                      title="Zoom a capa"
                      onClick={() => {
                        const map = mapRef.current;
                        if (!map || !l.data) return;
                        zoomToFeatureCollection(map, l.data);
                      }}
                    >
                      <Locate className={ACTION_ICON} />
                    </LayerActionButton>
                  )}
                  {l.type === "editable" && (
                    <LayerActionButton
                      title={
                        l.id === state.editingLayerId
                          ? "Finalizar edición"
                          : "Editar capa"
                      }
                      active={l.id === state.editingLayerId}
                      onClick={() => {
                        if (l.id === state.editingLayerId) {
                          dispatch({ type: "stopEditingLayer" });
                        } else {
                          measureEngineRef.current?.setMode("none");
                          dispatch({ type: "startEditingLayer", id: l.id });
                        }
                      }}
                    >
                      {l.id === state.editingLayerId ? (
                        <Check className={ACTION_ICON} />
                      ) : (
                        <Pencil className={ACTION_ICON} />
                      )}
                    </LayerActionButton>
                  )}
                  <LayerActionButton
                    title="Propiedades"
                    onClick={() =>
                      dispatch({ type: "openLayerSettings", id: l.id })
                    }
                  >
                    <Settings2 className={ACTION_ICON} />
                  </LayerActionButton>
                  {(l.type === "editable" || l.type === "wfs") && (
                    <LayerActionButton
                      title="Tabla de atributos"
                      active={state.attributeTableLayerId === l.id}
                      onClick={() => {
                        if (state.attributeTableLayerId === l.id) {
                          dispatch({ type: "closeAttributeTable" });
                        } else {
                          dispatch({ type: "openAttributeTable", id: l.id });
                        }
                      }}
                    >
                      <Table2 className={ACTION_ICON} />
                    </LayerActionButton>
                  )}
                <LayerActionButton
                  title="Subir"
                  onClick={() =>
                    dispatch({ type: "moveLayer", id: l.id, direction: "up" })
                  }
                >
                  <ArrowUp className={ACTION_ICON} />
                </LayerActionButton>
                <LayerActionButton
                  title="Bajar"
                  onClick={() =>
                    dispatch({ type: "moveLayer", id: l.id, direction: "down" })
                  }
                >
                  <ArrowDown className={ACTION_ICON} />
                </LayerActionButton>
                <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />
                <LayerActionButton
                  title="Eliminar"
                  destructive
                  onClick={() =>
                    setLayerPendingDeletion({ id: l.id, name: l.name })
                  }
                >
                  <Trash2 className={ACTION_ICON} />
                </LayerActionButton>
                             
                  {l.type !== "wms" && l.type !== "wfs" && (
                    <LayerActionButton
                      title="Descargar GeoJSON"
                      onClick={() => exportLayerToGeoJSON(l)}
                    >
                      <Download className={ACTION_ICON} />
                    </LayerActionButton>
                  )}
                  {l.type === "wfs" && (
                  <LayerActionButton
                  title="Convertir a capa local"
                  onClick={() => convertWfsToLocal(l)}
                >
                  <LayersPlus className={ACTION_ICON} />                  
                </LayerActionButton>
                )}     
                  
                </div>                
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// El modal WMS se renderiza a nivel de app (GeoPortalApp).
