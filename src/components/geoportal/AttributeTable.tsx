import React, { useContext, useEffect, useRef, useState } from "react";
import { Locate, Pencil, X } from "lucide-react";
import { GeoPortalContext } from "../../shell/GeoPortalApp";
import type { Layer, LayerField } from "../../types/geoportal";
import { inferFieldsFromFeatures } from "../../persistence/importGeoJSON";
import { zoomToFeature } from "../../utils/geo";
import { cn } from "../../utils/cn";
import { useResponsive } from "../../hooks/useResponsive";

const DEFAULT_HEIGHT = 240;
const MIN_HEIGHT = 140;
const MAX_HEIGHT_RATIO = 0.5;

function getAttributeTableLayer(
  layers: Layer[],
  id?: string,
): Layer | undefined {
  if (!id) return undefined;
  const layer = layers.find((item) => item.id === id);
  if (!layer) return undefined;
  if (layer.type === "editable" || layer.type === "wfs") return layer;
  return undefined;
}

function fieldsForTable(layer: Layer): LayerField[] {
  if (layer.fields && layer.fields.length > 0) return layer.fields;
  return inferFieldsFromFeatures(layer.data?.features ?? []);
}

function abbreviateId(id: string): string {
  if (id.length <= 8) return id;
  return `${id.slice(0, 6)}...`;
}

function formatDateDisplay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatFieldValue(
  field: LayerField,
  properties: GeoJSON.GeoJsonProperties | null | undefined,
): string {
  const raw = properties?.[field.name];
  if (raw == null || raw === "") return "—";
  switch (field.type) {
    case "boolean":
      return raw === true ? "Sí" : "No";
    case "date":
      return typeof raw === "string" ? formatDateDisplay(raw) : "—";
    case "number":
      if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
      if (typeof raw === "string" && raw.trim() !== "") return raw;
      return "—";
    default:
      return String(raw);
  }
}

function maxTableHeight(): number {
  return Math.max(MIN_HEIGHT, Math.floor(window.innerHeight * MAX_HEIGHT_RATIO));
}

export function AttributeTable(): JSX.Element | null {
  const ctx = useContext(GeoPortalContext)!;
  const { state, dispatch, mapRef } = ctx;
  const { isMobile, isTablet } = useResponsive();
  const layer = getAttributeTableLayer(
    state.layers,
    state.attributeTableLayerId,
  );
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const selectedRowRef = useRef<HTMLTableRowElement | null>(null);
  const selectedCardRef = useRef<HTMLButtonElement | null>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(
    null,
  );

  useEffect(() => {
    if (state.attributeTableLayerId && !layer) {
      dispatch({ type: "closeAttributeTable" });
    }
  }, [dispatch, layer, state.attributeTableLayerId]);

  const selectedId =
    layer && state.selectedFeatureLayerId === layer.id
      ? state.selectedFeatureId
      : undefined;

  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
    selectedCardRef.current?.scrollIntoView({
      block: "nearest",
    });
  }, [selectedId]);

  if (!layer) return null;

  const tableLayer = layer;
  const features = tableLayer.data?.features ?? [];
  const fields = fieldsForTable(tableLayer);
  const count = features.length;
  const readOnly = tableLayer.type === "wfs" || isMobile;
  const colSpan = fields.length + (readOnly ? 1 : 2);
  const panelHeight = isMobile
    ? undefined
    : isTablet
      ? undefined
      : height;

  function selectFeature(featureId: string | number) {
    dispatch({
      type: "setSelectedFeature",
      id: featureId,
      layerId: tableLayer.id,
    });
  }

  function zoomRow(feature: GeoJSON.Feature) {
    const map = mapRef.current;
    if (!map || feature.id == null) return;
    selectFeature(feature.id);
    zoomToFeature(map, feature);
  }

  function onResizePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    dragRef.current = { startY: event.clientY, startHeight: height };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onResizePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const next = drag.startHeight + (drag.startY - event.clientY);
    setHeight(Math.min(maxTableHeight(), Math.max(MIN_HEIGHT, next)));
  }

  function onResizePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <section
      className={cn(
        "flex shrink-0 flex-col border-t bg-card",
        isMobile && "h-[45dvh]",
        isTablet && "h-[40vh] max-h-[45vh] min-h-[35vh]",
      )}
      style={panelHeight != null ? { height: panelHeight } : undefined}
      aria-label={`Tabla de atributos — ${tableLayer.name}`}
    >
      {!isMobile && (
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Redimensionar tabla"
        title="Arrastrar para redimensionar"
        className="h-1.5 shrink-0 cursor-ns-resize bg-border/80 hover:bg-primary/50"
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
      />
      )}
      <header className="flex shrink-0 items-center gap-3 border-b px-3 py-1.5">
        <div className="min-w-0 flex-1 truncate font-medium">
          {isMobile ? "Atributos" : "Tabla de atributos"} — {tableLayer.name}
        </div>
        <div className="shrink-0 text-xs text-muted-foreground">
          {count} {count === 1 ? "entidad" : "entidades"}
        </div>
        <button
          type="button"
          title="Cerrar"
          aria-label="Cerrar"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground desktop:h-7 desktop:w-7"
          onClick={() => dispatch({ type: "closeAttributeTable" })}
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      {isMobile ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {count === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">
              No hay entidades en esta capa.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {features.map((feature, index) => {
                const featureId = feature.id;
                const selected =
                  featureId != null &&
                  selectedId != null &&
                  String(selectedId) === String(featureId);
                return (
                  <button
                    key={
                      featureId == null ? `card-${index}` : String(featureId)
                    }
                    type="button"
                    ref={selected ? selectedCardRef : undefined}
                    className={cn(
                      "surface w-full p-3 text-left",
                      selected ? "ring-1 ring-primary" : null,
                    )}
                    onClick={() => {
                      if (featureId == null) return;
                      selectFeature(featureId);
                      zoomRow(feature);
                    }}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="truncate font-medium">
                        Entidad{" "}
                        {featureId == null
                          ? index + 1
                          : abbreviateId(String(featureId))}
                      </div>
                      <Locate className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    <dl className="grid gap-2">
                      {fields.map((field) => (
                        <div key={field.name} className="min-w-0">
                          <dt className="text-xs text-muted-foreground">
                            {field.name}
                          </dt>
                          <dd className="break-words text-sm">
                            {formatFieldValue(field, feature.properties)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-max min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-[1]">
            <tr className="bg-card text-left text-xs text-muted-foreground">
              <th className="sticky left-0 z-[2] bg-card px-3 py-2 font-medium">
                ID
              </th>
              {fields.map((field) => (
                <th
                  key={field.name}
                  className="whitespace-nowrap bg-card px-3 py-2 font-medium"
                >
                  {field.name}
                </th>
              ))}
              {!readOnly && (
                <th className="sticky right-0 z-[2] bg-card px-3 py-2 font-medium">
                  Acciones
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {count === 0 ? (
              <tr>
                <td
                  colSpan={colSpan}
                  className="px-3 py-6 text-center text-sm text-muted-foreground"
                >
                  No hay entidades en esta capa.
                </td>
              </tr>
            ) : (
              features.map((feature, index) => {
                const featureId = feature.id;
                const idLabel =
                  featureId == null ? "—" : abbreviateId(String(featureId));
                const selected =
                  featureId != null &&
                  selectedId != null &&
                  String(selectedId) === String(featureId);
                return (
                  <tr
                    key={
                      featureId == null
                        ? `row-${index}`
                        : String(featureId)
                    }
                    ref={selected ? selectedRowRef : undefined}
                    className={cn(
                      "group cursor-pointer border-t border-border/60 hover:bg-muted/70",
                      selected ? "bg-primary/15 hover:bg-primary/20" : null,
                    )}
                    onClick={() => {
                      if (featureId == null) return;
                      selectFeature(featureId);
                    }}
                    onDoubleClick={() => zoomRow(feature)}
                  >
                    <td
                      className={cn(
                        "sticky left-0 whitespace-nowrap px-3 py-1.5 font-mono text-xs",
                        selected
                          ? "bg-primary/15 group-hover:bg-primary/20"
                          : "bg-card group-hover:bg-muted/70",
                      )}
                      title={
                        featureId == null ? undefined : String(featureId)
                      }
                    >
                      {idLabel}
                    </td>
                    {fields.map((field) => (
                      <td
                        key={field.name}
                        className="max-w-[16rem] truncate whitespace-nowrap px-3 py-1.5"
                      >
                        {formatFieldValue(field, feature.properties)}
                      </td>
                    ))}
                    {!readOnly && (
                      <td
                        className={cn(
                          "sticky right-0 px-2 py-1",
                          selected
                            ? "bg-primary/15 group-hover:bg-primary/20"
                            : "bg-card group-hover:bg-muted/70",
                        )}
                      >
                        <button
                          type="button"
                          title="Editar atributos"
                          className="control h-7 w-7 p-0"
                          disabled={featureId == null}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (featureId == null) return;
                            dispatch({
                              type: "openFeatureAttributes",
                              layerId: tableLayer.id,
                              featureId,
                            });
                          }}
                          onDoubleClick={(event) => event.stopPropagation()}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      )}
    </section>
  );
}
