import React, { useContext, useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { GeoPortalContext } from "../../shell/GeoPortalApp";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "../ui/Dialog";
import { Tabs, TabsList, TabsTrigger } from "../ui/Tabs";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
import { Slider } from "../ui/Slider";
import { Select } from "../ui/Select";
import { fieldTypeLabel, geometryTypeLabel } from "../../persistence/editableLayers";
import {
  DEFAULT_WFS_FEATURE_LIMIT,
  collectGeometryTypes,
  geometryFamilies,
} from "../../utils/wfs";
import {
  buildCategorizedStyle,
  getCategoricalSymbologyFields,
  getCategorizedStyleRows,
  shouldWarnHighCardinality,
  type CategorizedStyleRow,
} from "../../utils/categorizedStyle";
import { cn } from "../../utils/cn";
import type {
  CategorizedStyle,
  GeometryType,
  LineStyle,
  PointStyle,
  StyleMode,
} from "../../types/geoportal";

function toHex(s: string): string {
  return /^#/.test(s) ? s : `#${s}`;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="grid gap-1.5">
      <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

function PropertyRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-3">
      <Label className="text-sm font-normal leading-tight text-muted-foreground">
        {label}
      </Label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function InfoGrid({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 text-sm sm:gap-x-6">
      {children}
    </dl>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium">{children}</dd>
    </>
  );
}

function ColorInput({
  value,
  onChange,
  variant = "default",
}: {
  value: string;
  onChange: (value: string) => void;
  variant?: "default" | "swatch";
}): JSX.Element {
  if (variant === "swatch") {
    return (
      <input
        type="color"
        aria-label="Color de categoría"
        className={cn(
          "h-7 w-7 shrink-0 cursor-pointer appearance-none rounded-sm border border-border bg-background p-0",
          "hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "[&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[2px] [&::-webkit-color-swatch]:border-0",
          "[&::-moz-color-swatch]:rounded-[2px] [&::-moz-color-swatch]:border-0",
        )}
        value={toHex(value)}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <Input
      type="color"
      className="h-8 w-11 cursor-pointer p-0.5"
      value={toHex(value)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function StyleSlider({
  value,
  min,
  max,
  step,
  display,
  onValueChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onValueChange: (value: number) => void;
}): JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={onValueChange}
      />
      <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {display}
      </span>
    </div>
  );
}

function ControlPair({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
      {children}
    </div>
  );
}

export function LayerSettingsDialog(): JSX.Element | null {
  const ctx = useContext(GeoPortalContext)!;
  const { state, dispatch } = ctx;
  const layer = useMemo(() => {
    if (!state.layerSettingsOpen) return undefined;
    return state.layers.find((l) => l.id === state.activeLayerId);
  }, [state.layers, state.activeLayerId, state.layerSettingsOpen]);
  const [tab, setTab] = useState<"style" | "info">("style");
  const categoricalFields = useMemo(
    () => (layer ? getCategoricalSymbologyFields(layer) : []),
    [layer],
  );

  useEffect(() => {
    if (!layer || layer.styleMode !== "categorized") return;
    if (categoricalFields.length === 0) return;
    const current = layer.categorizedStyle?.field;
    const fieldStillValid =
      !!current &&
      !!layer.categorizedStyle &&
      categoricalFields.some((field) => field.name === current);
    if (fieldStillValid && !layer.categorizedStyle?.otherColor) return;
    const field =
      current && categoricalFields.some((item) => item.name === current)
        ? current
        : categoricalFields[0].name;
    dispatch({
      type: "updateLayer",
      id: layer.id,
      patch: { categorizedStyle: buildCategorizedStyle(layer, field) },
    });
  }, [layer, categoricalFields, dispatch]);
  const open = !!layer;
  if (!open || !layer) return null;
  const currentLayer = layer;

  const isWfs = currentLayer.type === "wfs";
  const detectedTypes: GeometryType[] = currentLayer.data
    ? collectGeometryTypes(currentLayer.data)
    : currentLayer.geometryType
      ? [currentLayer.geometryType]
      : [];
  const families = isWfs
    ? geometryFamilies(detectedTypes)
    : { point: false, line: false, polygon: false };
  const isPoint =
    families.point ||
    currentLayer.geometryType === "Point" ||
    currentLayer.geometryType === "MultiPoint";
  const isLine =
    families.line ||
    currentLayer.geometryType === "LineString" ||
    currentLayer.geometryType === "MultiLineString";
  const isPolygon =
    families.polygon ||
    currentLayer.geometryType === "Polygon" ||
    currentLayer.geometryType === "MultiPolygon";

  const fields = currentLayer.fields ?? [];
  const close = () => dispatch({ type: "closeLayerSettings" });
  const styleMode: StyleMode =
    currentLayer.styleMode === "categorized" ? "categorized" : "simple";
  const showCategorizedUi = currentLayer.type !== "wms";
  const categorizedRows = currentLayer.categorizedStyle
    ? getCategorizedStyleRows(currentLayer.categorizedStyle)
    : [];
  const selectedCategoricalField = categoricalFields.find(
    (field) => field.name === currentLayer.categorizedStyle?.field,
  );
  const showCardinalityWarning = shouldWarnHighCardinality(
    selectedCategoricalField,
    currentLayer.categorizedStyle?.categories.length ?? 0,
  );

  function setStyleMode(mode: StyleMode) {
    if (mode === "simple") {
      dispatch({
        type: "updateLayer",
        id: currentLayer.id,
        patch: { styleMode: "simple" },
      });
      return;
    }
    const currentField = currentLayer.categorizedStyle?.field;
    const field =
      currentField && categoricalFields.some((item) => item.name === currentField)
        ? currentField
        : categoricalFields[0]?.name;
    if (!field) {
      dispatch({
        type: "updateLayer",
        id: currentLayer.id,
        patch: { styleMode: "categorized" },
      });
      return;
    }
    const categorizedStyle =
      currentLayer.categorizedStyle?.field === field &&
      !currentLayer.categorizedStyle.otherColor
        ? currentLayer.categorizedStyle
        : buildCategorizedStyle(currentLayer, field);
    dispatch({
      type: "updateLayer",
      id: currentLayer.id,
      patch: { styleMode: "categorized", categorizedStyle },
    });
  }

  function setCategorizedField(field: string) {
    dispatch({
      type: "updateLayer",
      id: currentLayer.id,
      patch: { categorizedStyle: buildCategorizedStyle(currentLayer, field) },
    });
  }

  function setCategoryColor(row: CategorizedStyleRow, color: string) {
    const current = currentLayer.categorizedStyle;
    if (!current) return;
    let next: CategorizedStyle;
    if (row.kind === "value") {
      next = {
        ...current,
        categories: current.categories.map((category, index) =>
          index === row.index ? { ...category, color } : category,
        ),
      };
    } else {
      next = { ...current, fallbackColor: color };
    }
    dispatch({
      type: "updateLayer",
      id: currentLayer.id,
      patch: { categorizedStyle: next },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      showClose
      className="h-[min(32rem,calc(100dvh-2rem))] w-full max-w-xl overflow-hidden p-0"
    >
      <DialogHeader className="shrink-0 border-b px-4 py-2.5 pr-14">
        <DialogTitle>Propiedades de la capa</DialogTitle>
        <DialogDescription>
          Personalice el estilo y revise la información.
        </DialogDescription>
      </DialogHeader>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "style" | "info")}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="shrink-0 border-b px-4 py-2">
          <TabsList className="mb-0">
            <TabsTrigger
              value="info"
              current={tab}
              onSelect={(v) => setTab(v as "style" | "info")}
            >
              Información
            </TabsTrigger>
            <TabsTrigger
              value="style"
              current={tab}
              onSelect={(v) => setTab(v as "style" | "info")}
            >
              Estilo
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-2.5">
          {tab === "info" && (
              <div className="grid gap-4">
                {layer.type === "editable" ? (
                  <>
                    <Section title="General">
                      <InfoGrid>
                        <InfoRow label="Nombre">
                          <Input
                            className="h-8"
                            value={layer.name}
                            onChange={(e) =>
                              dispatch({
                                type: "updateLayer",
                                id: layer.id,
                                patch: { name: e.target.value },
                              })
                            }
                          />
                        </InfoRow>
                        <InfoRow label="Tipo">Capa editable</InfoRow>
                        <InfoRow label="Geometría">
                          {geometryTypeLabel(layer.geometryType)}
                        </InfoRow>
                        <InfoRow label="Entidades">
                          {layer.data?.features.length ?? 0}
                        </InfoRow>
                        <InfoRow label="Campos">{fields.length}</InfoRow>
                      </InfoGrid>
                    </Section>

                    <Section title="Campos">
                      {fields.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Sin campos definidos
                        </p>
                      ) : (
                        <div>
                          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-x-4 pb-1 text-xs text-muted-foreground">
                            <span>Campo</span>
                            <span>Tipo</span>
                          </div>
                          <div className="max-h-36 overflow-x-hidden overflow-y-auto">
                            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-x-4 gap-y-0.5 text-sm">
                              {fields.map((field) => (
                                <React.Fragment key={field.name}>
                                  <span className="truncate font-mono text-xs">
                                    {field.name}
                                  </span>
                                  <span>{fieldTypeLabel(field.type)}</span>
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </Section>
                  </>
                ) : isWfs ? (
                  <>
                    <Section title="General">
                      <InfoGrid>
                        <InfoRow label="Nombre">
                          <Input
                            className="h-8"
                            value={layer.name}
                            onChange={(e) =>
                              dispatch({
                                type: "updateLayer",
                                id: layer.id,
                                patch: { name: e.target.value },
                              })
                            }
                          />
                        </InfoRow>
                        <InfoRow label="Tipo">WFS</InfoRow>
                        <InfoRow label="Servicio">
                          <span className="break-all font-mono text-xs font-normal">
                            {layer.wfsUrl}
                          </span>
                        </InfoRow>
                        <InfoRow label="FeatureType">
                          <span className="break-all font-mono text-xs">
                            {layer.wfsTypeName}
                          </span>
                        </InfoRow>
                        <InfoRow label="Entidades">
                          {layer.data?.features.length ?? 0}
                          {layer.wfsTruncated
                            ? ` (primeras ${DEFAULT_WFS_FEATURE_LIMIT})`
                            : ""}
                        </InfoRow>
                        <InfoRow label="Geometría">
                          {detectedTypes.length > 0
                            ? detectedTypes.map(geometryTypeLabel).join(", ")
                            : geometryTypeLabel(layer.geometryType)}
                        </InfoRow>
                      </InfoGrid>
                    </Section>
                  </>
                ) : (
                  <>
                    <Section title="General">
                      <InfoGrid>
                        <InfoRow label="Nombre">
                          <Input
                            className="h-8"
                            value={layer.name}
                            onChange={(e) =>
                              dispatch({
                                type: "updateLayer",
                                id: layer.id,
                                patch: { name: e.target.value },
                              })
                            }
                          />
                        </InfoRow>
                        <InfoRow label="Tipo">
                          {layer.geometryType ?? "Desconocido"}
                        </InfoRow>
                        <InfoRow label="Features">
                          {layer.stats?.featureCount ??
                            layer.data?.features.length ??
                            0}
                        </InfoRow>
                        {layer.stats?.bounds && (
                          <InfoRow label="Bounds">
                            <span className="break-all font-mono text-xs font-normal">
                              {layer.stats.bounds
                                .map((v) => v.toFixed(4))
                                .join(", ")}
                            </span>
                          </InfoRow>
                        )}
                      </InfoGrid>
                    </Section>
                    {layer.stats?.propertyKeys &&
                      layer.stats.propertyKeys.length > 0 && (
                        <Section title="Propiedades">
                          <div className="max-h-36 overflow-y-auto overflow-x-hidden">
                            <div className="flex flex-wrap gap-1.5">
                              {layer.stats.propertyKeys.map((k) => (
                                <span
                                  key={k}
                                  className="rounded bg-muted px-2 py-0.5 text-xs"
                                >
                                  {k}
                                </span>
                              ))}
                            </div>
                          </div>
                        </Section>
                      )}
                  </>
                )}
              </div>
          )}

          {tab === "style" && (
              <div className="grid gap-4">
                {showCategorizedUi && (
                  <Section title="Simbología">
                    <div className="grid gap-1.5">
                      <PropertyRow label="Tipo de simbología">
                        <Select
                          value={styleMode}
                          onValueChange={(value) => setStyleMode(value as StyleMode)}
                          options={[
                            { label: "Simple", value: "simple" },
                            { label: "Categorizada", value: "categorized" },
                          ]}
                        />
                      </PropertyRow>
                      {styleMode === "categorized" &&
                        (categoricalFields.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No hay campos de texto, booleano o número para
                            categorizar.
                          </p>
                        ) : (
                          <>
                            <PropertyRow label="Campo">
                              <Select
                                value={
                                  layer.categorizedStyle?.field &&
                                  categoricalFields.some(
                                    (field) =>
                                      field.name === layer.categorizedStyle?.field,
                                  )
                                    ? layer.categorizedStyle.field
                                    : categoricalFields[0].name
                                }
                                onValueChange={setCategorizedField}
                                options={categoricalFields.map((field) => ({
                                  value: field.name,
                                  label: `${field.name} (${fieldTypeLabel(field.type)})`,
                                }))}
                              />
                            </PropertyRow>
                            <div className="grid gap-1.5">
                              <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                Categorías
                              </h4>
                              {showCardinalityWarning && (
                                <div className="flex gap-2 rounded-md border bg-muted/50 px-2.5 py-2 text-sm">
                                  <AlertTriangle
                                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                                    aria-hidden
                                  />
                                  <div className="min-w-0 grid gap-0.5">
                                    <p className="text-foreground">
                                      Este campo contiene{" "}
                                      {currentLayer.categorizedStyle?.categories
                                        .length ?? 0}{" "}
                                      valores únicos.
                                    </p>
                                    <p className="text-muted-foreground">
                                      Para variables numéricas continuas se
                                      recomienda utilizar simbología graduada.
                                    </p>
                                  </div>
                                </div>
                              )}
                              {layer.categorizedStyle ? (
                                <div className="max-h-72 overflow-x-hidden overflow-y-auto">
                                  <ul className="grid gap-1">
                                    {categorizedRows.map((row) => (
                                      <li
                                        key={
                                          row.kind === "value"
                                            ? `value:${row.index}`
                                            : row.kind
                                        }
                                        className="flex min-w-0 items-center gap-2"
                                      >
                                        <ColorInput
                                          variant="swatch"
                                          value={row.color}
                                          onChange={(color) =>
                                            setCategoryColor(row, color)
                                          }
                                        />
                                        <span
                                          className="min-w-0 flex-1 truncate text-sm"
                                          title={row.label}
                                        >
                                          {row.label}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  Seleccione un campo para generar las categorías.
                                </p>
                              )}
                            </div>
                          </>
                        ))}
                    </div>
                  </Section>
                )}
                {isPoint && layer.pointStyle && (
                  <>
                    <Section title="Símbolo">
                      <div className="grid gap-1.5">
                        <PropertyRow label="Tipo de icono">
                          <Select
                            value={layer.pointStyle.type}
                            onValueChange={(value) =>
                              dispatch({
                                type: "updateLayer",
                                id: layer.id,
                                patch: {
                                  pointStyle: {
                                    ...layer.pointStyle!,
                                    type: value as PointStyle["type"],
                                  },
                                },
                              })
                            }
                            options={[
                              { label: "Círculo", value: "circle" },
                              { label: "Marcador", value: "marker" },
                              { label: "Cuadrado", value: "square" },
                              { label: "Triángulo", value: "triangle" },
                              { label: "Estrella", value: "star" },
                            ]}
                          />
                        </PropertyRow>
                        <ControlPair>
                          {styleMode === "simple" && (
                            <PropertyRow label="Color">
                              <ColorInput
                                value={layer.pointStyle.color}
                                onChange={(color) =>
                                  dispatch({
                                    type: "updateLayer",
                                    id: layer.id,
                                    patch: {
                                      pointStyle: {
                                        ...layer.pointStyle!,
                                        color,
                                      },
                                    },
                                  })
                                }
                              />
                            </PropertyRow>
                          )}
                          <PropertyRow label="Color de borde">
                            <ColorInput
                              value={layer.pointStyle.strokeColor}
                              onChange={(strokeColor) =>
                                dispatch({
                                  type: "updateLayer",
                                  id: layer.id,
                                  patch: {
                                    pointStyle: {
                                      ...layer.pointStyle!,
                                      strokeColor,
                                    },
                                  },
                                })
                              }
                            />
                          </PropertyRow>
                        </ControlPair>
                      </div>
                    </Section>

                    <Section title="Apariencia">
                      <ControlPair>
                        <PropertyRow label="Tamaño">
                          <StyleSlider
                            value={layer.pointStyle.size}
                            min={4}
                            max={32}
                            step={1}
                            display={`${layer.pointStyle.size}px`}
                            onValueChange={(v) =>
                              dispatch({
                                type: "updateLayer",
                                id: layer.id,
                                patch: {
                                  pointStyle: {
                                    ...layer.pointStyle!,
                                    size: v,
                                  },
                                },
                              })
                            }
                          />
                        </PropertyRow>
                        <PropertyRow label="Grosor">
                          <StyleSlider
                            value={layer.pointStyle.strokeWidth}
                            min={0}
                            max={10}
                            step={0.5}
                            display={`${layer.pointStyle.strokeWidth}px`}
                            onValueChange={(v) =>
                              dispatch({
                                type: "updateLayer",
                                id: layer.id,
                                patch: {
                                  pointStyle: {
                                    ...layer.pointStyle!,
                                    strokeWidth: v,
                                  },
                                },
                              })
                            }
                          />
                        </PropertyRow>
                      </ControlPair>
                    </Section>

                    <Section title="Clustering">
                      <div className="grid gap-1.5">
                        <PropertyRow label="Habilitar">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={layer.cluster?.enabled ?? false}
                              onChange={(e) =>
                                dispatch({
                                  type: "updateLayer",
                                  id: layer.id,
                                  patch: {
                                    cluster: {
                                      ...(layer.cluster ?? {
                                        radius: 50,
                                        maxZoom: 14,
                                        minPoints: 2,
                                        enabled: false,
                                      }),
                                      enabled: e.target.checked,
                                    },
                                  },
                                })
                              }
                            />
                            Clustering
                          </label>
                        </PropertyRow>
                        <ControlPair>
                          <PropertyRow label="Radio">
                            <StyleSlider
                              value={layer.cluster?.radius ?? 50}
                              min={10}
                              max={200}
                              step={5}
                              display={`${layer.cluster?.radius ?? 50}`}
                              onValueChange={(v) =>
                                dispatch({
                                  type: "updateLayer",
                                  id: layer.id,
                                  patch: {
                                    cluster: {
                                      ...(layer.cluster ?? {
                                        enabled: true,
                                        maxZoom: 14,
                                        minPoints: 2,
                                      }),
                                      radius: v,
                                    },
                                  },
                                })
                              }
                            />
                          </PropertyRow>
                          <PropertyRow label="Max Zoom">
                            <StyleSlider
                              value={layer.cluster?.maxZoom ?? 14}
                              min={1}
                              max={20}
                              step={1}
                              display={`${layer.cluster?.maxZoom ?? 14}`}
                              onValueChange={(v) =>
                                dispatch({
                                  type: "updateLayer",
                                  id: layer.id,
                                  patch: {
                                    cluster: {
                                      ...(layer.cluster ?? {
                                        enabled: true,
                                        radius: 50,
                                        minPoints: 2,
                                      }),
                                      maxZoom: v,
                                    },
                                  },
                                })
                              }
                            />
                          </PropertyRow>
                        </ControlPair>
                        <PropertyRow label="Mín. puntos">
                          <StyleSlider
                            value={layer.cluster?.minPoints ?? 2}
                            min={1}
                            max={10}
                            step={1}
                            display={`${layer.cluster?.minPoints ?? 2}`}
                            onValueChange={(v) =>
                              dispatch({
                                type: "updateLayer",
                                id: layer.id,
                                patch: {
                                  cluster: {
                                    ...(layer.cluster ?? {
                                      enabled: true,
                                      radius: 50,
                                      maxZoom: 14,
                                    }),
                                    minPoints: v,
                                  },
                                },
                              })
                            }
                          />
                        </PropertyRow>
                      </div>
                    </Section>
                  </>
                )}

                {isLine && layer.lineStyle && (
                  <>
                    <Section title="Símbolo">
                      <ControlPair>
                        {styleMode === "simple" && (
                          <PropertyRow label="Color">
                            <ColorInput
                              value={layer.lineStyle.color}
                              onChange={(color) =>
                                dispatch({
                                  type: "updateLayer",
                                  id: layer.id,
                                  patch: {
                                    lineStyle: {
                                      ...layer.lineStyle!,
                                      color,
                                    },
                                  },
                                })
                              }
                            />
                          </PropertyRow>
                        )}
                        <PropertyRow label="Grosor">
                          <StyleSlider
                            value={layer.lineStyle.width}
                            min={1}
                            max={20}
                            step={0.5}
                            display={`${layer.lineStyle.width}px`}
                            onValueChange={(v) =>
                              dispatch({
                                type: "updateLayer",
                                id: layer.id,
                                patch: {
                                  lineStyle: {
                                    ...layer.lineStyle!,
                                    width: v,
                                  },
                                },
                              })
                            }
                          />
                        </PropertyRow>
                      </ControlPair>
                    </Section>
                    <Section title="Apariencia">
                      <PropertyRow label="Terminación">
                        <Select
                          value={(layer.lineStyle.lineCap ?? "butt") as string}
                          onValueChange={(v) =>
                            dispatch({
                              type: "updateLayer",
                              id: layer.id,
                              patch: {
                                lineStyle: {
                                  ...layer.lineStyle!,
                                  lineCap: v as LineStyle["lineCap"],
                                },
                              },
                            })
                          }
                          options={[
                            { label: "Butt", value: "butt" },
                            { label: "Round", value: "round" },
                            { label: "Square", value: "square" },
                          ]}
                        />
                      </PropertyRow>
                    </Section>
                  </>
                )}

                {isPolygon && layer.polygonStyle && (
                  <>
                    <Section title="Relleno">
                      <ControlPair>
                        {styleMode === "simple" && (
                          <PropertyRow label="Color">
                            <ColorInput
                              value={layer.polygonStyle.fillColor}
                              onChange={(fillColor) =>
                                dispatch({
                                  type: "updateLayer",
                                  id: layer.id,
                                  patch: {
                                    polygonStyle: {
                                      ...layer.polygonStyle!,
                                      fillColor,
                                    },
                                  },
                                })
                              }
                            />
                          </PropertyRow>
                        )}
                        <PropertyRow label="Opacidad">
                          <StyleSlider
                            value={layer.polygonStyle.fillOpacity * 100}
                            min={0}
                            max={100}
                            step={1}
                            display={`${Math.round(layer.polygonStyle.fillOpacity * 100)}%`}
                            onValueChange={(v) =>
                              dispatch({
                                type: "updateLayer",
                                id: layer.id,
                                patch: {
                                  polygonStyle: {
                                    ...layer.polygonStyle!,
                                    fillOpacity: v / 100,
                                  },
                                },
                              })
                            }
                          />
                        </PropertyRow>
                      </ControlPair>
                    </Section>
                    <Section title="Borde">
                      <ControlPair>
                        <PropertyRow label="Color">
                          <ColorInput
                            value={layer.polygonStyle.strokeColor}
                            onChange={(strokeColor) =>
                              dispatch({
                                type: "updateLayer",
                                id: layer.id,
                                patch: {
                                  polygonStyle: {
                                    ...layer.polygonStyle!,
                                    strokeColor,
                                  },
                                },
                              })
                            }
                          />
                        </PropertyRow>
                        <PropertyRow label="Grosor">
                          <StyleSlider
                            value={layer.polygonStyle.strokeWidth}
                            min={0}
                            max={10}
                            step={0.5}
                            display={`${layer.polygonStyle.strokeWidth}px`}
                            onValueChange={(v) =>
                              dispatch({
                                type: "updateLayer",
                                id: layer.id,
                                patch: {
                                  polygonStyle: {
                                    ...layer.polygonStyle!,
                                    strokeWidth: v,
                                  },
                                },
                              })
                            }
                          />
                        </PropertyRow>
                      </ControlPair>
                    </Section>
                  </>
                )}
              </div>
          )}
        </div>
      </Tabs>
    </Dialog>
  );
}
