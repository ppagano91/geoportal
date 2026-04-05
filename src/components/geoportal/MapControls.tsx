import React, { useContext, useState } from "react";
import { GeoPortalContext } from "../../shell/GeoPortalApp";
import { Button } from "../ui/Button";
import { PencilRuler, Eraser, Save } from "lucide-react";
import pointIcon from "../../assets/images/point.svg";
import lineIcon from "../../assets/images/line.svg";
import polygonIcon from "../../assets/images/polygon.svg";
import squareIcon from "../../assets/images/square.svg";
import circleIcon from "../../assets/images/circle.svg";

export function MapControls(): JSX.Element {
  const ctx = useContext(GeoPortalContext)!;
  const { state, dispatch } = ctx;
  const [openDraw, setOpenDraw] = useState(true);

  function DrawModeIcon({
    src,
    alt,
  }: {
    src: string;
    alt: string;
  }): JSX.Element {
    return <img src={src} alt={alt} className="h-5 w-5 object-contain" />;
  }

  return (
    <div className="surface flex flex-col p-1">
      {/* <div className="flex gap-2">
        <Button
          title="Volver a vista inicial"
          variant="secondary"
          size="sm"
          onClick={() => {
            if (!map) return;
            map.easeTo({
              center: { lng: -58.4173, lat: -34.6118 },
              zoom: 11,
              bearing: 0,
              pitch: 0,
            });
          }}
        >
          <Home className="h-4 w-4 mr-1" /> Inicio
        </Button>
        <Button
          title="Orientar al Norte"
          variant="secondary"
          size="sm"
          onClick={() => {
            if (!map) return;
            map.easeTo({ bearing: 0, pitch: 0 });
          }}
        >
          <Compass className="h-4 w-4 mr-1" /> Norte
        </Button>        
      </div> */}
      <div className="">
        <div className="flex items-center justify-between">
          {openDraw && <div className="text-sm">Herramientas de Dibujo</div>}
          <button className="text-xs" onClick={() => setOpenDraw((v) => !v)}>
            🖍
          </button>
        </div>
        {openDraw && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Button
                title="Dibujar punto"
                variant={state.drawMode === "point" ? "default" : "secondary"}
                size="sm"
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
                size="sm"
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
                size="sm"
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
                size="sm"
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
                size="sm"
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
                title="Salir de modo dibujo"
                variant="secondary"
                size="sm"
                onClick={() => dispatch({ type: "setDrawMode", mode: "none" })}
              >
                <PencilRuler className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2 mt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => dispatch({ type: "clearDrawings" })}
              >
                <Eraser className="h-4 w-4 mr-1" /> Limpiar
              </Button>
              <Button
                size="sm"
                onClick={() => dispatch({ type: "saveDrawingsAsLayer" })}
              >
                <Save className="h-4 w-4 mr-1" /> Guardar
              </Button>
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              Punto: clic. Línea/Polígono: clics y doble clic para terminar.
              Rectángulo/Círculo: arrastrar.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
