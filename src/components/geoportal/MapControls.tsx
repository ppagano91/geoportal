import React, { useContext, useState } from "react";
import { GeoPortalContext } from "../../shell/GeoPortalApp";
import { Button } from "../ui/Button";
import { PencilRuler, Eraser, Save, Trash2, Ruler } from "lucide-react";
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
import { cn } from "../../utils/cn";
import { useResponsive } from "../../hooks/useResponsive";

export function MapControls({
  showDraw = true,
}: {
  showDraw?: boolean;
}): JSX.Element {
  const ctx = useContext(GeoPortalContext)!;
  const { state, dispatch, drawEngineRef, measureEngineRef } = ctx;
  const { isMobile } = useResponsive();
  const [openDraw, setOpenDraw] = useState(false);
  const [openMeasure, setOpenMeasure] = useState(false);
  const editable = getEditableLayerById(state.layers, state.editingLayerId);
  const measuring = state.measureMode !== "none";
  const allowedMode = editable
    ? geometryTypeToDrawMode(editable.geometryType)
    : undefined;

  function canUse(mode: typeof state.drawMode): boolean {
    if (!editable) return true;
    return mode === "select" || mode === allowedMode;
  }

  function toggleDrawMode(mode: typeof state.drawMode) {
    const next = state.drawMode === mode ? "none" : mode;
    if (next !== "none") {
      measureEngineRef.current?.setMode("none");
    }
    dispatch({ type: "setDrawMode", mode: next });
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

  const btn = isMobile ? "h-11 w-11 p-0" : "h-9 w-9 p-0";
  const col = isMobile ? "w-11" : "w-9";

  return (
    <div className="flex items-start gap-1 tablet:gap-2">
      {showDraw && (
      <div className={cn("surface flex flex-col items-center p-0.5", col)}>
        <button
          type="button"
          className={cn("flex items-center justify-center text-xs", btn)}
          title="Herramientas de Dibujo"
          aria-label="Herramientas de Dibujo"
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
              onClick={() => toggleDrawMode("point")}
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
              onClick={() => toggleDrawMode("line")}
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
              onClick={() => toggleDrawMode("polygon")}
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
              onClick={() => toggleDrawMode("rectangle")}
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
              onClick={() => toggleDrawMode("circle")}
            >
              <DrawModeIcon src={circleIcon} alt="Círculo" />
            </Button>
            <Button
              title="Seleccionar / editar"
              variant={state.drawMode === "select" ? "default" : "secondary"}
              size="icon"
              className="h-9 w-9 p-0"
              onClick={() => toggleDrawMode("select")}
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
      )}
      <div className={cn("surface flex flex-col items-center p-0.5", col)}>
        <button
          type="button"
          className={cn(
            "flex items-center justify-center text-xs",
            btn,
            measuring && "rounded-md bg-primary text-primary-foreground",
          )}
          title="Medir"
          aria-label="Medición"
          aria-pressed={measuring}
          aria-expanded={openMeasure}
          onClick={() => setOpenMeasure((v) => !v)}
        >
          <Ruler className="h-4 w-4" />
        </button>
        {openMeasure && (
          <>
            <Button
              title="Medir distancia"
              variant={
                state.measureMode === "distance" ? "default" : "secondary"
              }
              size="icon"
              className={btn}
              aria-pressed={state.measureMode === "distance"}
              onClick={() => {
                const mode =
                  state.measureMode === "distance" ? "none" : "distance";
                measureEngineRef.current?.setMode(mode);
                dispatch({ type: "setMeasureMode", mode });
              }}
            >
              <DrawModeIcon src={lineIcon} alt="Distancia" />
            </Button>
            <Button
              title="Medir área"
              variant={state.measureMode === "area" ? "default" : "secondary"}
              size="icon"
              className={btn}
              aria-pressed={state.measureMode === "area"}
              onClick={() => {
                const mode = state.measureMode === "area" ? "none" : "area";
                measureEngineRef.current?.setMode(mode);
                dispatch({ type: "setMeasureMode", mode });
              }}
            >
              <DrawModeIcon src={polygonIcon} alt="Área" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className={btn}
              title="Limpiar medición"
              aria-label="Limpiar medición"
              onClick={() => measureEngineRef.current?.clear()}
            >
              <Eraser className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
      {showDraw && openDraw && (
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
      {measuring && !isMobile && (
        <div className="surface max-w-[16rem] px-2 py-1.5 text-xs font-medium">
          {state.measureMode === "distance" ? "📏 Distancia" : "📏 Área"}
        </div>
      )}
    </div>
  );
}
