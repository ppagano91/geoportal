import React, { useContext, useState } from "react";
import { GeoPortalContext } from "../../shell/GeoPortalApp";
import { Button } from "../ui/Button";
import { PencilRuler, Eraser, Save, Trash2 } from "lucide-react";
import pointIcon from "../../assets/images/point.svg";
import lineIcon from "../../assets/images/line.svg";
import polygonIcon from "../../assets/images/polygon.svg";
import squareIcon from "../../assets/images/square.svg";
import circleIcon from "../../assets/images/circle.svg";

export function MapControls(): JSX.Element {
  const ctx = useContext(GeoPortalContext)!;
  const { state, dispatch, drawEngineRef } = ctx;
  const [openDraw, setOpenDraw] = useState(false);

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
            title="Dibujar punto"
            variant={state.drawMode === "point" ? "default" : "secondary"}
            size="icon"
            className="h-9 w-9 p-0"
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
            title="Dibujar línea (doble clic para terminar)"
            variant={state.drawMode === "line" ? "default" : "secondary"}
            size="icon"
            className="h-9 w-9 p-0"
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
            title="Dibujar polígono (doble clic para terminar)"
            variant={state.drawMode === "polygon" ? "default" : "secondary"}
            size="icon"
            className="h-9 w-9 p-0"
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
            title="Dibujar rectángulo (arrastrar)"
            variant={
              state.drawMode === "rectangle" ? "default" : "secondary"
            }
            size="icon"
            className="h-9 w-9 p-0"
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
            title="Dibujar círculo (arrastrar)"
            variant={state.drawMode === "circle" ? "default" : "secondary"}
            size="icon"
            className="h-9 w-9 p-0"
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
            title="Limpiar"
            onClick={() => {
              drawEngineRef.current?.clear();
              dispatch({ type: "clearDrawings" });
            }}
          >
            <Eraser className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            className="h-9 w-9 p-0"
            title="Guardar"
            onClick={() => dispatch({ type: "saveDrawingsAsLayer" })}
          >
            <Save className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
}
