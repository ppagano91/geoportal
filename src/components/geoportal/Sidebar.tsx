import React, { useContext, useMemo, useRef, useState } from "react";
import { GeoPortalContext } from "../../shell/GeoPortalApp";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { ScrollArea } from "../ui/ScrollArea";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2, Upload } from "lucide-react";
import type { Layer } from "../../types/geoportal";
import { computeLayerStats } from "../../utils/stats";
import { DRAWING_SESSION_LAYER_ID } from "../../persistence/drawingLayers";
import { geometryTypeLabel } from "../../persistence/editableLayers";
import { CreateEditableLayerDialog } from "./CreateEditableLayerDialog";

function inferGeometryType(
  fc: GeoJSON.FeatureCollection
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

function layerListSubtitle(layer: Layer): string {
  if (layer.type === "wms") return "WMS";
  if (layer.type === "drawing") {
    return `Dibujo · ${geometryTypeLabel(layer.geometryType)}`;
  }
  if (layer.type === "editable") {
    return `Editable · ${geometryTypeLabel(layer.geometryType)}`;
  }
  return geometryTypeLabel(layer.geometryType);
}

export function Sidebar(): JSX.Element {
  const ctx = useContext(GeoPortalContext)!;
  const { state, dispatch } = ctx;
  const inputRef = useRef<HTMLInputElement>(null);
  const [createEditableOpen, setCreateEditableOpen] = useState(false);

  const filtered = useMemo(
    () =>
      state.layers.filter(
        (l) =>
          l.id !== DRAWING_SESSION_LAYER_ID &&
          l.name.toLowerCase().includes(state.searchQuery.toLowerCase()),
      ),
    [state.layers, state.searchQuery],
  );

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      if (
        file.name.toLowerCase().endsWith(".geojson") ||
        file.type === "application/geo+json" ||
        file.type === "application/json"
      ) {
        file.text().then((txt) => {
          try {
            const data = JSON.parse(txt) as GeoJSON.FeatureCollection;
            const layer: Layer = {
              id: crypto.randomUUID(),
              name: file.name.replace(/\.(geo)?json$/i, ""),
              type: "user",
              visible: true,
              data,
              geometryType: inferGeometryType(data),
              pointStyle: {
                type: "circle",
                size: 10,
                color: "#0ea5e9",
                strokeColor: "#0b87bf",
                strokeWidth: 1.5,
              },
              lineStyle: { color: "#0ea5e9", width: 2, lineCap: "round" },
              polygonStyle: {
                fillColor: "#0ea5e9",
                fillOpacity: 0.2,
                strokeColor: "#0ea5e9",
                strokeWidth: 1.5,
              },
              cluster: {
                enabled: false,
                radius: 50,
                maxZoom: 14,
                minPoints: 2,
              },
              stats: computeLayerStats(data),
            };
            dispatch({ type: "addLayer", layer });
          } catch {
            // ignore bad file
          }
        });
      }
    }
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

  return (
    <div className="h-full flex flex-col">
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
        </div>
        <Button
          className="mt-3 w-full"
          onClick={() => setCreateEditableOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" /> Crear capa editable
        </Button>
      </div>
      <CreateEditableLayerDialog
        open={createEditableOpen}
        onOpenChange={setCreateEditableOpen}
        onCreate={(layer) => dispatch({ type: "addLayer", layer })}
      />
      <div className="p-3">
        <Input
          placeholder="Filtrar capas"
          value={state.searchQuery}
          onChange={(e) =>
            dispatch({ type: "setSearch", query: e.target.value })
          }
        />
      </div>
      <ScrollArea className="flex-1 px-3 pb-3">
        {filtered.length === 0 && (
          <div className="text-sm text-muted-foreground p-3">
            No hay capas. Cargue un GeoJSON o cree una capa editable para
            comenzar.
          </div>
        )}
        <div className="flex flex-col gap-2">
          {filtered.map((l) => (
            <div key={l.id} className="surface p-2 flex items-center gap-2">
              <button
                className="control h-8 w-8"
                title={l.visible ? "Ocultar capa" : "Mostrar capa"}
                onClick={() =>
                  dispatch({
                    type: "toggleLayer",
                    id: l.id,
                    visible: !l.visible,
                  })
                }
              >
                {l.visible ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
              </button>
              <button
                className="flex-1 text-left truncate"
                onClick={() => dispatch({ type: "setActiveLayer", id: l.id })}
                title={l.name}
              >
                <div className="font-medium">{l.name}</div>
                <div className="text-xs text-muted-foreground">
                  {layerListSubtitle(l)}
                </div>
              </button>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  title="Subir"
                  onClick={() =>
                    dispatch({ type: "moveLayer", id: l.id, direction: "up" })
                  }
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  title="Bajar"
                  onClick={() =>
                    dispatch({ type: "moveLayer", id: l.id, direction: "down" })
                  }
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </div>
              <Button
                variant="outline"
                size="icon"
                title="Eliminar"
                onClick={() => dispatch({ type: "removeLayer", id: l.id })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-4 surface p-3 flex items-center justify-between">
          <div className="font-medium">Capas WMS</div>
          <WmsButton />
        </div>
      </ScrollArea>
    </div>
  );
}

function WmsButton(): JSX.Element {
  const ctx = useContext(GeoPortalContext)!;
  const { dispatch } = ctx;
  return (
    <React.Fragment>
      <Button size="sm" onClick={() => dispatch({ type: "openWmsDialog" })}>
        Agregar WMS
      </Button>
    </React.Fragment>
  );
}

// El modal WMS se renderiza a nivel de app (GeoPortalApp).
