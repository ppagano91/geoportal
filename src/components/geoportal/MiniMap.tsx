import React, { useEffect, useRef, useState } from "react";
import maplibregl, { Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ChevronDown, ChevronUp } from "lucide-react";

export function MiniMap({ styleUrl }: { styleUrl: string }): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!open) return;
    const mainMap: Map | null = (window as any).maplibreglMap ?? null;
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: styleUrl,
      attributionControl: false,
      interactive: false,
      center: mainMap?.getCenter() ?? { lng: 0, lat: 0 },
      zoom: (mainMap?.getZoom() ?? 3) - 3,
    });
    mapRef.current = map;
    function sync() {
      if (!map || !mainMap) return;
      const c = mainMap.getCenter();
      map.setCenter(c);
      map.setZoom(mainMap.getZoom() - 3);
      map.setBearing(mainMap.getBearing());
    }
    mainMap?.on("move", sync);
    return () => {
      mainMap?.off("move", sync);
      map.remove();
      mapRef.current = null;
    };
  }, [styleUrl, open]);

  return (
    <div className="surface border p-0 overflow-hidden">
      <div className="flex items-center justify-between px-2 border-b">
        {open && <span className="text-sm">Minimapa</span>}
        <button
          className="text-muted-foreground"
          onClick={() => setOpen((v) => !v)}
        >
          🗺
        </button>

        {/* <button className="text-xs" onClick={() => setOpen((v) => !v)}>
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </button> */}
      </div>
      {open && <div ref={containerRef} className="h-40 w-56" />}
    </div>
  );
}
