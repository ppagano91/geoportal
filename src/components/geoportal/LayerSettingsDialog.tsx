import React, { useContext, useMemo, useState } from "react";
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
import type { GeometryType, LineStyle, PointStyle } from "../../types/geoportal";

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
}: {
  value: string;
  onChange: (value: string) => void;
}): JSX.Element {
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
  const open = !!layer;
  if (!open || !layer) return null;

  const isWfs = layer.type === "wfs";
  const detectedTypes: GeometryType[] = layer.data
    ? collectGeometryTypes(layer.data)
    : layer.geometryType
      ? [layer.geometryType]
      : [];
  const families = isWfs
    ? geometryFamilies(detectedTypes)
    : { point: false, line: false, polygon: false };
  const isPoint =
    families.point ||
    layer.geometryType === "Point" ||
    layer.geometryType === "MultiPoint";
  const isLine =
    families.line ||
    layer.geometryType === "LineString" ||
    layer.geometryType === "MultiLineString";
  const isPolygon =
    families.polygon ||
    layer.geometryType === "Polygon" ||
    layer.geometryType === "MultiPolygon";

  const fields = layer.fields ?? [];
  const close = () => dispatch({ type: "closeLayerSettings" });

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
