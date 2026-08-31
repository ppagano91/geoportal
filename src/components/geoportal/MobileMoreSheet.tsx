import React, { useContext } from "react";
import { Compass, Eraser, X } from "lucide-react";
import { GeoPortalContext } from "../../shell/GeoPortalApp";
import { cn } from "../../utils/cn";
import lineIcon from "../../assets/images/line.svg";
import polygonIcon from "../../assets/images/polygon.svg";

function ToolButton({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn(
        "flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm",
        active ? "bg-primary text-primary-foreground" : null,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function MobileMoreSheet({
  onClose,
  onResetView,
  onToggleTerrain,
  onToggleBuildings,
  terrainOn,
  buildingsOn,
}: {
  onClose: () => void;
  onResetView: () => void;
  onToggleTerrain: () => void;
  onToggleBuildings: () => void;
  terrainOn: boolean;
  buildingsOn: boolean;
}): JSX.Element {
  const ctx = useContext(GeoPortalContext)!;
  const { state, dispatch, measureEngineRef } = ctx;
  const measuring = state.measureMode !== "none";

  return (
    <div className="z-action-sheet pointer-events-none absolute inset-0">
      <button
        type="button"
        aria-label="Cerrar menú Más"
        className="pointer-events-auto absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Más herramientas"
        className="pointer-events-auto absolute inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] rounded-xl border bg-card p-3 shadow-card"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Más</h2>
          <button
            type="button"
            aria-label="Cerrar"
            title="Cerrar"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-1">
          <ToolButton
            title="Medir distancia"
            active={state.measureMode === "distance"}
            onClick={() => {
              const mode =
                state.measureMode === "distance" ? "none" : "distance";
              measureEngineRef.current?.setMode(mode);
              dispatch({ type: "setMeasureMode", mode });
            }}
          >
            <img src={lineIcon} alt="" className="h-4 w-4 object-contain dark:invert" />
            Medir distancia
          </ToolButton>
          <ToolButton
            title="Medir área"
            active={state.measureMode === "area"}
            onClick={() => {
              const mode = state.measureMode === "area" ? "none" : "area";
              measureEngineRef.current?.setMode(mode);
              dispatch({ type: "setMeasureMode", mode });
            }}
          >
            <img
              src={polygonIcon}
              alt=""
              className="h-4 w-4 object-contain dark:invert"
            />
            Medir área
          </ToolButton>
          {measuring && (
            <ToolButton
              title="Limpiar medición"
              onClick={() => measureEngineRef.current?.clear()}
            >
              <Eraser className="h-4 w-4" />
              Limpiar medición
            </ToolButton>
          )}
          <ToolButton title="Volver a vista inicial" onClick={onResetView}>
            <Compass className="h-4 w-4" />
            Reset / Norte
          </ToolButton>
          <ToolButton
            title={terrainOn ? "Desactivar relieve" : "Activar relieve"}
            active={terrainOn}
            onClick={onToggleTerrain}
          >
            Relieve 3D
          </ToolButton>
          <ToolButton
            title={
              buildingsOn ? "Desactivar edificios 3D" : "Activar edificios 3D"
            }
            active={buildingsOn}
            onClick={onToggleBuildings}
          >
            Edificios 3D
          </ToolButton>
        </div>
      </div>
    </div>
  );
}
