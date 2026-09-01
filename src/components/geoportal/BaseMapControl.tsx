import React, { useContext, useEffect, useRef, useState } from "react";
import { GeoPortalContext } from "../../shell/GeoPortalApp";
import { Globe, Map, Satellite, Mountain, Moon } from "lucide-react";
import { cn } from "../../utils/cn";

export function BaseMapControl(): JSX.Element {
  const ctx = useContext(GeoPortalContext)!;
  const { state, dispatch } = ctx;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const items: Array<{ key: any; label: string; icon: React.ReactNode }> = [
    { key: "streets", label: "Calles", icon: <Map className="h-4 w-4" /> },
    {
      key: "satellite",
      label: "Satélite",
      icon: <Satellite className="h-4 w-4" />,
    },
    {
      key: "topo",
      label: "Topográfico",
      icon: <Mountain className="h-4 w-4" />,
    },
    { key: "dark", label: "Oscuro", icon: <Moon className="h-4 w-4" /> },
  ];
  return (
    <div ref={ref} className="maplibregl-ctrl maplibregl-ctrl-group relative">
      <button
        type="button"
        className="maplibregl-ctrl-custom-layers"
        title="Mapas base"
        aria-label="Mapas base"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="maplibregl-ctrl-icon"></span>
      </button>
      {open && (
        <div className="surface absolute right-0 top-full z-40 mt-1 w-44 p-2 max-md:right-full max-md:top-0 max-md:mt-0 max-md:mr-1">
          <div className="text-xs text-muted-foreground mb-1">Mapas base</div>
          <div className="flex flex-col">
            {items.map((it) => (
              <div
                key={it.key}
                className={cn(
                  "w-full flex text-left rounded min-h-11 items-center cursor-pointer p-1 gap-2",
                  state.baseMap === it.key
                    ? "bg-primary text-primary-foreground hover:bg-primary"
                    : "hover:bg-muted"
                )}
                onClick={() => {
                  setOpen(false);
                  dispatch({ type: "setBaseMap", baseMap: it.key });
                }}
              >
                <span className="flex items-center justify-center">
                  {it.icon}
                </span>

                <span className="text-sm">{it.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
