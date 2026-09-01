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

  const coords = formatLngLat(lng, lat);

  return (
    <div className="z-action-sheet pointer-events-none absolute inset-0 isolate">
      <button
        type="button"
        aria-label="Cerrar acciones del mapa"
        className="pointer-events-auto absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Acciones del punto"
        className="pointer-events-auto absolute inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] rounded-xl border bg-card px-2 py-1.5 shadow-card"
      >
        <div className="flex items-center gap-0.5">
          <div className="min-w-0 flex-1 truncate font-mono text-[13px] tabular-nums leading-none">
            {coords}
          </div>
          <button
            type="button"
            title="Copiar coordenadas"
            aria-label="Copiar coordenadas"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onCopyCoordinates}
          >
            <ClipboardCopy className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Cerrar"
            title="Cerrar"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
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
  );
}
