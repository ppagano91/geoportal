import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/Dialog";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
import { Select } from "../ui/Select";
import { Button } from "../ui/Button";
import { ScrollArea } from "../ui/ScrollArea";
import { Plus, Trash2 } from "lucide-react";
import type { EditableGeometryType, FieldType } from "../../types/geoportal";
import {
  createEditableLayer,
  EDITABLE_GEOMETRY_OPTIONS,
  FIELD_TYPE_OPTIONS,
  parseEditableFields,
  validateLayerName,
} from "../../persistence/editableLayers";

type FieldDraft = {
  key: string;
  name: string;
  type: FieldType;
};

export function CreateEditableLayerDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (layer: ReturnType<typeof createEditableLayer>) => void;
}): JSX.Element | null {
  const [name, setName] = useState("");
  const [geometryType, setGeometryType] =
    useState<EditableGeometryType>("Point");
  const [fields, setFields] = useState<FieldDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setGeometryType("Point");
    setFields([]);
    setError(null);
  }, [open]);

  function addField() {
    setError(null);
    setFields((current) => [
      ...current,
      { key: crypto.randomUUID(), name: "", type: "string" },
    ]);
  }

  function updateField(key: string, patch: Partial<Omit<FieldDraft, "key">>) {
    setError(null);
    setFields((current) =>
      current.map((field) =>
        field.key === key ? { ...field, ...patch } : field,
      ),
    );
  }

  function removeField(key: string) {
    setError(null);
    setFields((current) => current.filter((field) => field.key !== key));
  }

  function submit() {
    const nameError = validateLayerName(name);
    if (nameError) {
      setError(nameError);
      return;
    }

    const parsed = parseEditableFields(fields);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }

    onCreate(
      createEditableLayer({
        name,
        geometryType,
        fields: parsed.fields,
      }),
    );
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      showClose
      className="h-[min(36rem,calc(100vh-2rem))] max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-hidden p-0"
    >
      <DialogHeader className="shrink-0 border-b px-4 py-3 pr-14">
        <DialogTitle>Crear capa editable</DialogTitle>
        <DialogDescription>
          Defina el nombre, el tipo geométrico y los campos de la capa.
        </DialogDescription>
      </DialogHeader>

      <ScrollArea className="min-h-0 flex-1 px-4 py-3">
        <div className="grid gap-4">
          <div className="grid gap-1">
            <Label htmlFor="editable-layer-name">Nombre</Label>
            <Input
              id="editable-layer-name"
              placeholder="Relevamiento de campo"
              value={name}
              onChange={(e) => {
                setError(null);
                setName(e.target.value);
              }}
            />
          </div>

          <div className="grid gap-1">
            <Label>Tipo geométrico</Label>
            <Select
              value={geometryType}
              onValueChange={(value) =>
                setGeometryType(value as EditableGeometryType)
              }
              options={[...EDITABLE_GEOMETRY_OPTIONS]}
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Campos</Label>
              <Button type="button" variant="outline" size="sm" onClick={addField}>
                <Plus className="mr-1 h-4 w-4" />
                Agregar campo
              </Button>
            </div>

            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no hay campos. Puede crear la capa y agregar atributos
                ahora, o dejarla solo con geometría.
              </p>
            ) : (
              <div className="grid gap-2">
                <div className="grid grid-cols-[1fr_8.5rem_2.25rem] gap-2 text-xs text-muted-foreground">
                  <span>Nombre</span>
                  <span>Tipo</span>
                  <span className="sr-only">Eliminar</span>
                </div>
                {fields.map((field) => (
                  <div
                    key={field.key}
                    className="grid grid-cols-[1fr_8.5rem_2.25rem] items-center gap-2"
                  >
                    <Input
                      placeholder="nombre"
                      value={field.name}
                      onChange={(e) =>
                        updateField(field.key, { name: e.target.value })
                      }
                    />
                    <Select
                      value={field.type}
                      onValueChange={(value) =>
                        updateField(field.key, { type: value as FieldType })
                      }
                      options={[...FIELD_TYPE_OPTIONS]}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Eliminar campo"
                      onClick={() => removeField(field.key)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}
        </div>
      </ScrollArea>

      <DialogFooter className="mt-0 flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={name.trim() === ""}>
          Crear capa
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
