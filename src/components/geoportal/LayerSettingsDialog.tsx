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

  return (
    <Dialog
      open={open}
      onOpenChange={(o) =>
        !o && dispatch({ type: "setActiveLayer", id: undefined })
      }
    >
      <DialogHeader>
        <DialogTitle>Configurar capa</DialogTitle>
        <DialogDescription>
          Personalice el estilo y revise la información.
        </DialogDescription>
      </DialogHeader>
      <div>
        <div className="mb-3">
          <Label>Nombre de capa</Label>
          <Input
            className="mt-1"
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
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger
              value="style"
              current={tab}
              onSelect={(v) => setTab(v as any)}
            >
              Estilo
            </TabsTrigger>
            <TabsTrigger
              value="info"
              current={tab}
              onSelect={(v) => setTab(v as any)}
            >
              Información
            </TabsTrigger>
          </TabsList>
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
            <div className="grid gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Tipo:</span>{" "}
                {layer.geometryType ?? "Desconocido"}
              </div>
              <div>
                <span className="text-muted-foreground">Features:</span>{" "}
                {layer.stats?.featureCount ?? layer.data?.features.length ?? 0}
              </div>
              {layer.stats?.bounds && (
                <div>
                  <span className="text-muted-foreground">Bounds:</span>{" "}
                  {layer.stats.bounds.map((v) => v.toFixed(4)).join(", ")}
                </div>
              )}
              {layer.stats?.propertyKeys &&
                layer.stats.propertyKeys.length > 0 && (
                  <div>
                    <div className="text-muted-foreground">Propiedades:</div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {layer.stats.propertyKeys.map((k) => (
                        <span
                          key={k}
                          className="px-2 py-0.5 rounded bg-muted text-xs"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <DialogFooter>
        <Button
          variant="secondary"
          onClick={() => dispatch({ type: "setActiveLayer", id: undefined })}
        >
          X
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
