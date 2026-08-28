import React, { useContext, useMemo, useState } from "react";
import { GeoPortalContext } from "../../shell/GeoPortalApp";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/Dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/Tabs";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
import { Slider } from "../ui/Slider";
import { Select } from "../ui/Select";
import { Button } from "../ui/Button";
import { ScrollArea } from "../ui/ScrollArea";
import { fieldTypeLabel, geometryTypeLabel } from "../../persistence/editableLayers";

function toHex(s: string): string {
  return /^#/.test(s) ? s : `#${s}`;
}

export function LayerSettingsDialog(): JSX.Element | null {
  const ctx = useContext(GeoPortalContext)!;
  const { state, dispatch } = ctx;
  const layer = useMemo(
    () => state.layers.find((l) => l.id === state.activeLayerId),
    [state.layers, state.activeLayerId],
  );
  const [tab, setTab] = useState<"style" | "info">("style");
  const open = !!layer;
  if (!open || !layer) return null;

  const isPoint =
    layer.geometryType === "Point" || layer.geometryType === "MultiPoint";
  const isLine =
    layer.geometryType === "LineString" ||
    layer.geometryType === "MultiLineString";
  const isPolygon =
    layer.geometryType === "Polygon" || layer.geometryType === "MultiPolygon";

  const close = () => dispatch({ type: "setActiveLayer", id: undefined });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      showClose
      className="h-[min(36rem,calc(100vh-2rem))] max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-hidden p-0"
    >
      <DialogHeader className="shrink-0 border-b px-4 py-3 pr-14">
        <DialogTitle>Propiedades de la capa</DialogTitle>
        <DialogDescription>
          Personalice el estilo y revise la información.
        </DialogDescription>
      </DialogHeader>

      <div className="shrink-0 space-y-1 border-b px-4 py-3">
        <Label>Nombre de capa</Label>
        <Input
          value={layer.name}
          onChange={(e) =>
            dispatch({
              type: "updateLayer",
              id: layer.id,
              patch: { name: e.target.value },
            })
          }
        />
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "style" | "info")}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="shrink-0 border-b px-4 py-3">
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
        <ScrollArea className="min-h-0 flex-1 px-4 py-3">
          <TabsContent value="style" current={tab}>
            <div className="grid gap-4">
              {isPoint && layer.pointStyle && (
                <div className="grid gap-3">
                  <div>
                    <Label>Tipo de icono</Label>
                    <Select
                      className="mt-1"
                      value={layer.pointStyle.type}
                      onValueChange={(value) =>
                        dispatch({
                          type: "updateLayer",
                          id: layer.id,
                          patch: {
                            pointStyle: {
                              ...layer.pointStyle!,
                              type: value as any,
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
                  </div>
                  <div>
                    <Label>Tamaño: {layer.pointStyle.size}px</Label>
                    <div className="mt-1">
                      <Slider
                        value={layer.pointStyle.size}
                        min={4}
                        max={32}
                        step={1}
                        onValueChange={(v) =>
                          dispatch({
                            type: "updateLayer",
                            id: layer.id,
                            patch: {
                              pointStyle: { ...layer.pointStyle!, size: v },
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Color de relleno</Label>
                      <Input
                        type="color"
                        className="mt-1 h-9 p-1"
                        value={toHex(layer.pointStyle.color)}
                        onChange={(e) =>
                          dispatch({
                            type: "updateLayer",
                            id: layer.id,
                            patch: {
                              pointStyle: {
                                ...layer.pointStyle!,
                                color: e.target.value,
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>Color de borde</Label>
                      <Input
                        type="color"
                        className="mt-1 h-9 p-1"
                        value={toHex(layer.pointStyle.strokeColor)}
                        onChange={(e) =>
                          dispatch({
                            type: "updateLayer",
                            id: layer.id,
                            patch: {
                              pointStyle: {
                                ...layer.pointStyle!,
                                strokeColor: e.target.value,
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>
                        Grosor borde: {layer.pointStyle.strokeWidth}px
                      </Label>
                      <div className="mt-1">
                        <Slider
                          value={layer.pointStyle.strokeWidth}
                          min={0}
                          max={10}
                          step={0.5}
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
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3 items-end">
                    <div className="col-span-4">
                      <Label>Clustering</Label>
                    </div>
                    <div className="col-span-1">
                      <label className="text-sm flex items-center gap-2">
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
                        Habilitar
                      </label>
                    </div>
                    <div className="col-span-3 grid grid-cols-3 gap-3">
                      <div>
                        <Label>Radio: {layer.cluster?.radius ?? 50}</Label>
                        <Slider
                          value={layer.cluster?.radius ?? 50}
                          min={10}
                          max={200}
                          step={5}
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
                      </div>
                      <div>
                        <Label>Max Zoom: {layer.cluster?.maxZoom ?? 14}</Label>
                        <Slider
                          value={layer.cluster?.maxZoom ?? 14}
                          min={1}
                          max={20}
                          step={1}
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
                      </div>
                      <div>
                        <Label>
                          Mín Puntos: {layer.cluster?.minPoints ?? 2}
                        </Label>
                        <Slider
                          value={layer.cluster?.minPoints ?? 2}
                          min={1}
                          max={10}
                          step={1}
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
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {isLine && layer.lineStyle && (
                <div className="grid gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Color</Label>
                      <Input
                        type="color"
                        className="mt-1 h-9 p-1"
                        value={toHex(layer.lineStyle.color)}
                        onChange={(e) =>
                          dispatch({
                            type: "updateLayer",
                            id: layer.id,
                            patch: {
                              lineStyle: {
                                ...layer.lineStyle!,
                                color: e.target.value,
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>Grosor: {layer.lineStyle.width}px</Label>
                      <div className="mt-1">
                        <Slider
                          value={layer.lineStyle.width}
                          min={1}
                          max={20}
                          step={0.5}
                          onValueChange={(v) =>
                            dispatch({
                              type: "updateLayer",
                              id: layer.id,
                              patch: {
                                lineStyle: { ...layer.lineStyle!, width: v },
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label>Terminación</Label>
                    <Select
                      className="mt-1"
                      value={(layer.lineStyle.lineCap ?? "butt") as any}
                      onValueChange={(v) =>
                        dispatch({
                          type: "updateLayer",
                          id: layer.id,
                          patch: {
                            lineStyle: {
                              ...layer.lineStyle!,
                              lineCap: v as any,
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
                  </div>
                </div>
              )}
              {isPolygon && layer.polygonStyle && (
                <div className="grid gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Relleno</Label>
                      <Input
                        type="color"
                        className="mt-1 h-9 p-1"
                        value={toHex(layer.polygonStyle.fillColor)}
                        onChange={(e) =>
                          dispatch({
                            type: "updateLayer",
                            id: layer.id,
                            patch: {
                              polygonStyle: {
                                ...layer.polygonStyle!,
                                fillColor: e.target.value,
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>
                        Opacidad:{" "}
                        {Math.round(layer.polygonStyle.fillOpacity * 100)}%
                      </Label>
                      <div className="mt-1">
                        <Slider
                          value={layer.polygonStyle.fillOpacity * 100}
                          min={0}
                          max={100}
                          step={1}
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
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Borde</Label>
                      <Input
                        type="color"
                        className="mt-1 h-9 p-1"
                        value={toHex(layer.polygonStyle.strokeColor)}
                        onChange={(e) =>
                          dispatch({
                            type: "updateLayer",
                            id: layer.id,
                            patch: {
                              polygonStyle: {
                                ...layer.polygonStyle!,
                                strokeColor: e.target.value,
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>Grosor: {layer.polygonStyle.strokeWidth}px</Label>
                      <div className="mt-1">
                        <Slider
                          value={layer.polygonStyle.strokeWidth}
                          min={0}
                          max={10}
                          step={0.5}
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
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="info" current={tab}>
            <div className="grid gap-4 text-sm">
              {layer.type === "editable" ? (
                <>
                  <div className="grid gap-1">
                    <span className="text-muted-foreground">Tipo</span>
                    <span>Capa editable</span>
                  </div>
                  <div className="grid gap-1">
                    <span className="text-muted-foreground">Geometría</span>
                    <span>{geometryTypeLabel(layer.geometryType)}</span>
                  </div>
                  <div className="grid gap-1">
                    <span className="text-muted-foreground">Entidades</span>
                    <span>
                      {layer.stats?.featureCount ??
                        layer.data?.features.length ??
                        0}
                    </span>
                  </div>
                  <div className="grid gap-1">
                    <span className="text-muted-foreground">Campos</span>
                    <span>{layer.fields?.length ?? 0}</span>
                  </div>
                  {(layer.fields?.length ?? 0) > 0 && (
                    <div className="grid gap-2">
                      <span className="text-muted-foreground">
                        Definición de campos
                      </span>
                      <div className="overflow-hidden rounded-md border">
                        <div className="grid grid-cols-[1fr_7rem] gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
                          <span>Nombre</span>
                          <span>Tipo</span>
                        </div>
                        {layer.fields?.map((field) => (
                          <div
                            key={field.name}
                            className="grid grid-cols-[1fr_7rem] gap-2 border-b px-3 py-1.5 last:border-b-0"
                          >
                            <span className="font-mono text-xs">
                              {field.name}
                            </span>
                            <span>{fieldTypeLabel(field.type)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="grid gap-1">
                    <span className="text-muted-foreground">Tipo</span>
                    <span>{layer.geometryType ?? "Desconocido"}</span>
                  </div>
                  <div className="grid gap-1">
                    <span className="text-muted-foreground">Features</span>
                    <span>
                      {layer.stats?.featureCount ??
                        layer.data?.features.length ??
                        0}
                    </span>
                  </div>
                  {layer.stats?.bounds && (
                    <div className="grid gap-1">
                      <span className="text-muted-foreground">Bounds</span>
                      <span className="break-all font-mono text-xs">
                        {layer.stats.bounds.map((v) => v.toFixed(4)).join(", ")}
                      </span>
                    </div>
                  )}
                  {layer.stats?.propertyKeys &&
                    layer.stats.propertyKeys.length > 0 && (
                      <div className="grid gap-1">
                        <span className="text-muted-foreground">
                          Propiedades
                        </span>
                        <div className="flex flex-wrap gap-2">
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
                    )}
                </>
              )}
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
      {/* <DialogFooter className="mt-0 flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3">
        <Button variant="secondary" onClick={close}>
          Cerrar
        </Button>
      </DialogFooter> */}
    </Dialog>
  );
}
