import React, { useContext, useState } from "react";
import { GeoPortalContext } from "../../shell/GeoPortalApp";
import { Button } from "../ui/Button";
import { PencilRuler, Eraser, Save, Trash2 } from "lucide-react";
import pointIcon from "../../assets/images/point.svg";
import lineIcon from "../../assets/images/line.svg";
import polygonIcon from "../../assets/images/polygon.svg";
import squareIcon from "../../assets/images/square.svg";
import circleIcon from "../../assets/images/circle.svg";
import {
  geometryTypeLabel,
  getEditableLayerById,
  geometryTypeToDrawMode,
} from "../../persistence/editableLayers";

export function MapControls(): JSX.Element {
  const ctx = useContext(GeoPortalContext)!;
  const { state, dispatch, drawEngineRef } = ctx;
  const [openDraw, setOpenDraw] = useState(false);
  const editable = getEditableLayerById(state.layers, state.editingLayerId);
  const allowedMode = editable
    ? geometryTypeToDrawMode(editable.geometryType)
    : undefined;

  function canUse(mode: typeof state.drawMode): boolean {
    if (!editable) return true;
    return mode === "select" || mode === allowedMode;
  }

  function DrawModeIcon({
    src,
    alt,
  }: {
    src: string;
    alt: string;
  }): JSX.Element {
    return (
      <img
        src={src}
        alt={alt}
        className="h-5 w-5 object-contain dark:invert"
      />
    );
  }

  return (
    <div className="flex items-start gap-2">
      <div className="surface flex w-9 flex-col items-center p-0.5">
        <button
          className="flex h-9 w-9 items-center justify-center text-xs"
          title="Herramientas de Dibujo"
          onClick={() => setOpenDraw((v) => !v)}
        >
          🖍
        </button>
        {openDraw && (
          <>
            <Button
              title={
                canUse("point")
                  ? "Dibujar punto"
                  : "Esta capa solo admite su tipo geométrico"
              }
              variant={state.drawMode === "point" ? "default" : "secondary"}
              size="icon"
              className="h-9 w-9 p-0"
              disabled={!canUse("point")}
              onClick={() =>
                dispatch({
                  type: "setDrawMode",
                  mode: state.drawMode === "point" ? "none" : "point",
                })
              }
            >
              <DrawModeIcon src={pointIcon} alt="Punto" />
            </Button>
            <Button
              title={
                canUse("line")
                  ? "Dibujar línea (doble clic para terminar)"
                  : "Esta capa solo admite su tipo geométrico"
              }
              variant={state.drawMode === "line" ? "default" : "secondary"}
              size="icon"
              className="h-9 w-9 p-0"
              disabled={!canUse("line")}
              onClick={() =>
                dispatch({
                  type: "setDrawMode",
                  mode: state.drawMode === "line" ? "none" : "line",
                })
              }
            >
              <DrawModeIcon src={lineIcon} alt="Línea" />
            </Button>
            <Button
              title={
                canUse("polygon")
                  ? "Dibujar polígono (doble clic para terminar)"
                  : "Esta capa solo admite su tipo geométrico"
              }
              variant={state.drawMode === "polygon" ? "default" : "secondary"}
              size="icon"
              className="h-9 w-9 p-0"
              disabled={!canUse("polygon")}
              onClick={() =>
                dispatch({
                  type: "setDrawMode",
                  mode: state.drawMode === "polygon" ? "none" : "polygon",
                })
              }
            >
              <DrawModeIcon src={polygonIcon} alt="Polígono" />
            </Button>
            <Button
              title={
                editable
                  ? "No disponible en capas editables"
                  : "Dibujar rectángulo (arrastrar)"
              }
              variant={
                state.drawMode === "rectangle" ? "default" : "secondary"
              }
              size="icon"
              className="h-9 w-9 p-0"
              disabled={!!editable}
              onClick={() =>
                dispatch({
                  type: "setDrawMode",
                  mode: state.drawMode === "rectangle" ? "none" : "rectangle",
                })
              }
            >
              <DrawModeIcon src={squareIcon} alt="Rectángulo" />
            </Button>
            <Button
              title={
                editable
                  ? "No disponible en capas editables"
                  : "Dibujar círculo (arrastrar)"
              }
              variant={state.drawMode === "circle" ? "default" : "secondary"}
              size="icon"
              className="h-9 w-9 p-0"
              disabled={!!editable}
              onClick={() =>
                dispatch({
                  type: "setDrawMode",
                  mode: state.drawMode === "circle" ? "none" : "circle",
                })
              }
            >
              <DrawModeIcon src={circleIcon} alt="Círculo" />
            </Button>
            <Button
              title="Seleccionar / editar"
              variant={state.drawMode === "select" ? "default" : "secondary"}
              size="icon"
              className="h-9 w-9 p-0"
              onClick={() =>
                dispatch({
                  type: "setDrawMode",
                  mode: state.drawMode === "select" ? "none" : "select",
                })
              }
            >
              <PencilRuler className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="h-9 w-9 p-0"
              title="Eliminar geometría seleccionada"
              onClick={() => drawEngineRef.current?.deleteSelected()}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="h-9 w-9 p-0"
              title={
                editable
                  ? "Limpiar entidades de la capa"
                  : "Limpiar dibujo libre"
              }
              onClick={() => drawEngineRef.current?.clear()}
            >
              <Eraser className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className="h-9 w-9 p-0"
              title={
                editable
                  ? "El guardado como capa nueva no aplica a capas editables"
                  : "Guardar dibujo libre como capa"
              }
              disabled={!!editable}
              onClick={() => dispatch({ type: "saveDrawingsAsLayer" })}
            >
              <Save className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
      {openDraw && (
        <div className="surface max-w-[16rem] px-2 py-1.5 text-xs text-muted-foreground">
          {editable ? (
            <span>
              Dibujando en{" "}
              <span className="font-medium text-foreground">
                {editable.name}
              </span>
              {" · "}
              {geometryTypeLabel(editable.geometryType)}
            </span>
          ) : (
            "Activá «Editar capa» para agregar entidades."
          )}
        </div>
      )}
    </div>
  );
}
