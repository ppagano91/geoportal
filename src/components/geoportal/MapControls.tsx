import React, { useContext, useState } from "react";
import { GeoPortalContext } from "../../shell/GeoPortalApp";
import { Button } from "../ui/Button";
import {
  Circle,
  Home,
  PencilRuler,
  Pointer,
  Route,
  Square,
  Triangle,
  Eraser,
  Save,
  Compass,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import maplibregl from "maplibre-gl";

export function MapControls(): JSX.Element {
  const ctx = useContext(GeoPortalContext)!;
  const { state, dispatch } = ctx;
  const map: any = (window as any).maplibreglMap;
  const [openDraw, setOpenDraw] = useState(true);
  return (
    <div className="surface p-2 flex flex-col gap-2">
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
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-muted-foreground">Dibujo</div>
          <button className="text-xs" onClick={() => setOpenDraw((v) => !v)}>
            {openDraw ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
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
                <Pointer className="h-4 w-4" />
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
                <Route className="h-4 w-4" />
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
                <Triangle className="h-4 w-4" />
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
                <Square className="h-4 w-4" />
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
                <Circle className="h-4 w-4" />
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
