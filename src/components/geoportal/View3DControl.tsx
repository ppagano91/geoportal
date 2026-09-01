import React, { useEffect, useRef, useState } from "react";
import { Axis3d } from "lucide-react";
import { cn } from "../../utils/cn";
import buildingsIcon from "../../assets/images/buildings.svg";
import reliefIcon from "../../assets/images/relief.svg";

function ToggleKnob({ on }: { on: boolean }): JSX.Element {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        on ? "bg-primary" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-background shadow transition-transform",
          on ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </span>
  );
}

export function View3DControl({
  terrainOn,
  buildingsOn,
  onToggleTerrain,
  onToggleBuildings,
  dismiss = false,
}: {
  terrainOn: boolean;
  buildingsOn: boolean;
  onToggleTerrain: () => void;
  onToggleBuildings: () => void;
  dismiss?: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const active = terrainOn || buildingsOn;

  useEffect(() => {
    if (dismiss) setOpen(false);
  }, [dismiss]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="maplibregl-ctrl maplibregl-ctrl-group relative">
      <button
        type="button"
        className={cn("maplibregl-ctrl-custom-3d", active && "is-on")}
        title="Visualización 3D"
        aria-label="Visualización 3D"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <Axis3d />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Visualización 3D"
          className="surface absolute right-full top-0 z-10 mr-1 w-[13.75rem] max-w-[calc(100vw-4.5rem)] overflow-hidden p-1"
        >
          <div className="px-2 py-1.5 text-sm font-medium">Visualización 3D</div>
          <div className="mx-1 border-t border-border/60" />
          <button
            type="button"
            role="menuitem"
            aria-pressed={terrainOn}
            className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm"
            onClick={onToggleTerrain}
          >
            <img
              src={reliefIcon}
              alt=""
              className="h-4 w-4 shrink-0 object-contain dark:invert"
            />
            <span className="min-w-0 flex-1">Relieve 3D</span>
            <ToggleKnob on={terrainOn} />
          </button>
          <button
            type="button"
            role="menuitem"
            aria-pressed={buildingsOn}
            className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm"
            onClick={onToggleBuildings}
          >
            <img
              src={buildingsIcon}
              alt=""
              className="h-4 w-4 shrink-0 object-contain dark:invert"
            />
            <span className="min-w-0 flex-1">Edificios 3D</span>
            <ToggleKnob on={buildingsOn} />
          </button>
        </div>
      )}
    </div>
  );
}
