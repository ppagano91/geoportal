import React, { useEffect, useRef, useState } from "react";
import { Box } from "lucide-react";
import { cn } from "../../utils/cn";
import buildingsIcon from "../../assets/images/buildings.svg";
import reliefIcon from "../../assets/images/relief.svg";

export function View3DControl({
  terrainOn,
  buildingsOn,
  onToggleTerrain,
  onToggleBuildings,
}: {
  terrainOn: boolean;
  buildingsOn: boolean;
  onToggleTerrain: () => void;
  onToggleBuildings: () => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const active = terrainOn || buildingsOn;

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  return (
    <div ref={ref} className="maplibregl-ctrl maplibregl-ctrl-group relative">
      <button
        type="button"
        className={active ? "maplibregl-ctrl-custom-terrain-on" : undefined}
        title="Opciones 3D"
        aria-label="Opciones 3D"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Box className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="surface absolute right-full top-0 z-40 mr-1 w-48 p-1"
        >
          <div className="px-2 py-1 text-xs text-muted-foreground">3D</div>
          <button
            type="button"
            role="menuitem"
            aria-pressed={terrainOn}
            className={cn(
              "flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm",
              terrainOn ? "bg-primary text-primary-foreground" : null,
            )}
            onClick={onToggleTerrain}
          >
            <img
              src={reliefIcon}
              alt=""
              className="h-4 w-4 object-contain dark:invert"
            />
            Relieve 3D
          </button>
          <button
            type="button"
            role="menuitem"
            aria-pressed={buildingsOn}
            className={cn(
              "flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm",
              buildingsOn ? "bg-primary text-primary-foreground" : null,
            )}
            onClick={onToggleBuildings}
          >
            <img
              src={buildingsIcon}
              alt=""
              className="h-4 w-4 object-contain dark:invert"
            />
            Edificios 3D
          </button>
        </div>
      )}
    </div>
  );
}
