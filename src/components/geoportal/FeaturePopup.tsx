import React, { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { ScrollArea } from "../ui/ScrollArea";

export function FeaturePopup({
  map,
  lngLat,
  feature,
  onClose,
}: {
  map: maplibregl.Map;
  lngLat: [number, number];
  feature: any;
  onClose: () => void;
}): JSX.Element {
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    const p = map.project({ lng: lngLat[0], lat: lngLat[1] });
    return { x: p.x, y: p.y };
  });
  const [anchorClass, setAnchorClass] = useState<string>(
    "translate-x-2 -translate-y-full",
  );

  useEffect(() => {
    function sync() {
      const p = map.project({ lng: lngLat[0], lat: lngLat[1] });
      setPos({ x: p.x, y: p.y });
      try {
        const cont = map.getContainer() as HTMLElement;
        const cw = cont.clientWidth;
        const ch = cont.clientHeight;
        const approxW = 320;
        const approxH = 220;
        const nearRight = p.x + approxW + 16 > cw;
        const nearTop = p.y - approxH < 0;
        if (nearRight && nearTop)
          setAnchorClass("-translate-x-full translate-y-2"); // left and below
        else if (nearRight)
          setAnchorClass("-translate-x-full -translate-y-full"); // left and above
        else if (nearTop)
          setAnchorClass("translate-x-2 translate-y-2"); // right and below
        else setAnchorClass("translate-x-2 -translate-y-full"); // right and above
      } catch {}
    }
    map.on("move", sync);
    map.on("resize", sync);
    return () => {
      map.off("move", sync);
      map.off("resize", sync);
    };
  }, [map, lngLat]);

  const props = feature.properties ?? {};
  const keys = Object.keys(props);

  return (
    <div
      className="absolute z-20"
      style={{
        left: 0,
        top: 0,
        transform: `translate(${pos.x}px, ${pos.y}px)`,
      }}
    >
      <div
        className={`surface border p-2 rounded-md max-w-xs ${anchorClass}`}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="text-sm font-medium">Propiedades</div>
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            X
          </button>
        </div>
        <div className="max-h-60 overflow-auto pr-2">
          <table className="w-full text-xs">
            <tbody>
              {keys.map((k) => (
                <tr key={k}>
                  <td className="py-1 pr-2 text-muted-foreground align-top">
                    {k}
                  </td>
                  <td className="py-1 break-all">{String(props[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
