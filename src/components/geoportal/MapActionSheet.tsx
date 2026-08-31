import React, { useEffect } from "react";
import { ClipboardCopy, Info, X } from "lucide-react";
import { formatLngLat } from "../../utils/featureInfo";

export function MapActionSheet({
  lng,
  lat,
  onCopyCoordinates,
  onGetInfo,
  onClose,
}: {
  lng: number;
  lat: number;
  onCopyCoordinates: () => void;
  onGetInfo: () => void;
  onClose: () => void;
}): JSX.Element {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="z-action-sheet pointer-events-none absolute inset-0">
      <button
        type="button"
        aria-label="Cerrar acciones del mapa"
        className="pointer-events-auto absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Acciones del punto"
        className="pointer-events-auto absolute inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] rounded-xl border bg-card p-3 shadow-card"
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Coordenadas</div>
            <div className="truncate font-mono text-sm">{formatLngLat(lng, lat)}</div>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            title="Cerrar"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-1">
          <button
            type="button"
            className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm"
            onClick={onCopyCoordinates}
          >
            <ClipboardCopy className="h-4 w-4 shrink-0 opacity-70" />
            Copiar coordenadas
          </button>
          <button
            type="button"
            className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm"
            onClick={onGetInfo}
          >
            <Info className="h-4 w-4 shrink-0 opacity-70" />
            Obtener información
          </button>
        </div>
      </div>
    </div>
  );
}
