import React, { useContext, useState } from "react";
import { GeoPortalContext } from "../../shell/GeoPortalApp";
import { useResponsive } from "../../hooks/useResponsive";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/Dialog";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
import { Button } from "../ui/Button";
import { ScrollArea } from "../ui/ScrollArea";
import type { LayerField } from "../../types/geoportal";
import {
  buildFeatureProperties,
  getEditableFeature,
  getEditableLayerById,
} from "../../persistence/editableLayers";

type DraftValue = string | boolean;

function draftFromProperties(
  fields: LayerField[],
  properties: GeoJSON.GeoJsonProperties | null | undefined,
): Record<string, DraftValue> {
  const source = properties ?? {};
  const draft: Record<string, DraftValue> = {};
  for (const field of fields) {
    const value = source[field.name];
    switch (field.type) {
      case "boolean":
        draft[field.name] = value === true;
        break;
      case "number":
        draft[field.name] =
          value == null || value === "" ? "" : String(value);
        break;
      case "date":
        draft[field.name] = typeof value === "string" ? value : "";
        break;
      default:
        draft[field.name] = value == null ? "" : String(value);
    }
  }
  return draft;
}

export function FeatureAttributesDialog(): JSX.Element | null {
  const ctx = useContext(GeoPortalContext)!;
  const { state, dispatch } = ctx;
  const { isMobile } = useResponsive();
  if (isMobile || !state.featureAttributesOpen) return null;

  const layer = getEditableLayerById(
    state.layers,
    state.selectedFeatureLayerId,
  );
  const feature = getEditableFeature(layer, state.selectedFeatureId);
  if (!layer || !feature || feature.id == null) return null;

  return (
    <FeatureAttributesForm
      key={`${layer.id}:${String(feature.id)}`}
      layerName={layer.name}
      featureId={feature.id}
      fields={layer.fields}
      properties={feature.properties}
      onClose={() => dispatch({ type: "closeFeatureAttributes" })}
      onSave={(properties) =>
        dispatch({
          type: "updateFeatureProperties",
          layerId: layer.id,
          featureId: feature.id as string | number,
          properties,
        })
      }
    />
  );
}

function FeatureAttributesForm({
  layerName,
  featureId,
  fields,
  properties,
  onClose,
  onSave,
}: {
  layerName: string;
  featureId: string | number;
  fields: LayerField[];
  properties: GeoJSON.GeoJsonProperties | null | undefined;
  onClose: () => void;
  onSave: (properties: GeoJSON.GeoJsonProperties) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(() =>
    draftFromProperties(fields, properties),
  );

  function setField(name: string, value: DraftValue) {
    setDraft((current) => ({ ...current, [name]: value }));
  }

  function submit() {
    onSave(buildFeatureProperties(fields, draft));
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      showClose
      className="h-[min(32rem,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-hidden p-0"
    >
      <DialogHeader className="shrink-0 border-b px-4 py-3 pr-14">
        <DialogTitle>Atributos de entidad</DialogTitle>
        <DialogDescription>
          Edite los valores de esta entidad. La geometría no se modifica.
        </DialogDescription>
      </DialogHeader>

      <ScrollArea className="min-h-0 flex-1 px-4 py-3">
        <div className="grid gap-4">
          <div className="grid gap-1 text-xs text-muted-foreground">
            <div>
              Capa: <span className="text-foreground">{layerName}</span>
            </div>
            <div>
              ID: <span className="break-all text-foreground">{String(featureId)}</span>
            </div>
          </div>

          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Esta capa no tiene campos definidos.
            </p>
          ) : (
            <div className="grid gap-3">
              {fields.map((field) => {
                const inputId = `feature-attr-${field.name}`;
                const value = draft[field.name];
                return (
                  <div key={field.name} className="grid gap-1">
                    <Label htmlFor={inputId}>{field.name}</Label>
                    {field.type === "boolean" ? (
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          id={inputId}
                          type="checkbox"
                          checked={value === true}
                          onChange={(event) =>
                            setField(field.name, event.target.checked)
                          }
                        />
                      </label>
                    ) : field.type === "number" ? (
                      <Input
                        id={inputId}
                        type="number"
                        value={typeof value === "string" ? value : ""}
                        onChange={(event) =>
                          setField(field.name, event.target.value)
                        }
                      />
                    ) : field.type === "date" ? (
                      <Input
                        id={inputId}
                        type="date"
                        value={typeof value === "string" ? value : ""}
                        onChange={(event) =>
                          setField(field.name, event.target.value)
                        }
                      />
                    ) : (
                      <Input
                        id={inputId}
                        type="text"
                        value={typeof value === "string" ? value : ""}
                        onChange={(event) =>
                          setField(field.name, event.target.value)
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      <DialogFooter className="mt-0 flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={submit}>Guardar</Button>
      </DialogFooter>
    </Dialog>
  );
}
