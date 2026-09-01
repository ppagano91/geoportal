import React, { useEffect, useRef, useState } from "react";
import { Mountain } from "lucide-react";
import { Switch } from "../ui/Switch";

function stopMapEvent(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}

function isInsideControl(root: HTMLElement | null, event: Event): boolean {
  return !!root && event.target instanceof Node && root.contains(event.target);
}

function isMapCanvasEvent(event: Event): boolean {
  const el = event.target;
  if (!(el instanceof Element)) return false;
  return !!el.closest(".maplibregl-canvas-container, canvas.maplibregl-canvas");
}

function ToggleRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <div
      role="menuitemcheckbox"
      aria-checked={checked}
      tabIndex={0}
      className="gp-view3d-row"
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
        }
      }}
    >
      <span className="gp-view3d-row-label">{label}</span>
      <Switch
        checked={checked}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none"
      />
    </div>
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
  const suppressMapClickRef = useRef(false);
  const active = terrainOn || buildingsOn;

  useEffect(() => {
    if (dismiss) setOpen(false);
  }, [dismiss]);

  useEffect(() => {
    function suppressQueuedMapClick(event: Event) {
      if (!suppressMapClickRef.current) return;
      if (isMapCanvasEvent(event)) event.stopPropagation();
    }
    document.addEventListener("click", suppressQueuedMapClick, true);
    document.addEventListener("pointerup", suppressQueuedMapClick, true);
    document.addEventListener("mouseup", suppressQueuedMapClick, true);
    document.addEventListener("touchend", suppressQueuedMapClick, true);
    return () => {
      document.removeEventListener("click", suppressQueuedMapClick, true);
      document.removeEventListener("pointerup", suppressQueuedMapClick, true);
      document.removeEventListener("mouseup", suppressQueuedMapClick, true);
      document.removeEventListener("touchend", suppressQueuedMapClick, true);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onOutside(event: Event) {
      if (isInsideControl(ref.current, event)) return;
      setOpen(false);
      if (isMapCanvasEvent(event)) {
        suppressMapClickRef.current = true;
        event.stopPropagation();
        window.setTimeout(() => {
          suppressMapClickRef.current = false;
        }, 400);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    const startEvents = ["pointerdown", "mousedown", "touchstart"] as const;
    for (const type of startEvents) {
      document.addEventListener(type, onOutside, true);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      for (const type of startEvents) {
        document.removeEventListener(type, onOutside, true);
      }
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative"
      onPointerDown={stopMapEvent}
      onPointerUp={stopMapEvent}
      onMouseDown={stopMapEvent}
      onMouseUp={stopMapEvent}
      onClick={stopMapEvent}
      onTouchStart={stopMapEvent}
      onTouchEnd={stopMapEvent}
    >
      <div className="maplibregl-ctrl maplibregl-ctrl-group">
        <button
          type="button"
          className={
            active ? "maplibregl-ctrl-custom-3d is-on" : "maplibregl-ctrl-custom-3d"
          }
          title="Visualización 3D"
          aria-label="Visualización 3D"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((value) => !value)}
        >
          <Mountain className="gp-view3d-icon" aria-hidden />
        </button>
      </div>
      {open && (
        <div
          role="menu"
          aria-label="Visualización 3D"
          className="gp-view3d-popover surface"
        >
          <div className="gp-view3d-popover-title">Visualización 3D</div>
          <ToggleRow
            label="Relieve 3D"
            checked={terrainOn}
            onToggle={onToggleTerrain}
          />
          <ToggleRow
            label="Edificios 3D"
            checked={buildingsOn}
            onToggle={onToggleBuildings}
          />
        </div>
      )}
    </div>
  );
}
