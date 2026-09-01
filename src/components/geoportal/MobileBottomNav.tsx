import React from "react";
import { Globe, Layers, Waypoints } from "lucide-react";
import type { MobilePanel } from "../../config/breakpoints";
import { cn } from "../../utils/cn";

const ITEMS: Array<{
  id: Exclude<MobilePanel, null>;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    id: "layers",
    label: "Capas",
    icon: <Layers className="h-5 w-5" />,
  },
  {
    id: "wms",
    label: "WMS",
    icon: <Globe className="h-5 w-5" />,
  },
  {
    id: "wfs",
    label: "WFS",
    icon: <Waypoints className="h-5 w-5" />,
  },
];

export function MobileBottomNav({
  active,
  onChange,
}: {
  active: MobilePanel;
  onChange: (panel: MobilePanel) => void;
}): JSX.Element {
  return (
    <nav
      className="relative z-mobile-nav flex shrink-0 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      aria-label="Navegación del visor"
    >
      {ITEMS.map((item) => {
        const selected = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            aria-pressed={selected}
            title={item.label}
            className={cn(
              "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px]",
              selected
                ? "text-primary"
                : "text-muted-foreground",
            )}
            onClick={() => onChange(selected ? null : item.id)}
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
