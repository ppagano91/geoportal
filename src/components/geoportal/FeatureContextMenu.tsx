import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ClipboardCopy, Info, Locate, Pencil, Trash2 } from "lucide-react";

const ITEM_CLASS =
  "flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left desktop:min-h-0 hover:bg-muted disabled:pointer-events-none disabled:opacity-50";

export function FeatureContextMenu({
  x,
  y,
  container,
  editAttributesDisabled = false,
  onClose,
  onEditAttributes,
  onZoom,
  onDelete,
  onCopyCoordinates,
  onGetInfo,
}: {
  x: number;
  y: number;
  container: HTMLElement;
  editAttributesDisabled?: boolean;
  onClose: () => void;
  onEditAttributes?: () => void;
  onZoom?: () => void;
  onDelete?: () => void;
  onCopyCoordinates: () => void;
  onGetInfo: () => void;
}): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const showFeatureActions = !!(onEditAttributes && onZoom && onDelete);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const mw = el.offsetWidth;
    const mh = el.offsetHeight;
    const pw = container.clientWidth;
    const ph = container.clientHeight;
    let left = x;
    let top = y;
    if (left + mw > pw - 8) left = Math.max(8, pw - mw - 8);
    if (top + mh > ph - 8) top = Math.max(8, ph - mh - 8);
    left = Math.max(8, left);
    top = Math.max(8, top);
    setPos({ left, top });
  }, [x, y, container, showFeatureActions]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (event.button === 2) return;
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      className="surface absolute z-action-sheet min-w-[12.5rem] overflow-hidden rounded-md border py-1 text-sm shadow-md"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {showFeatureActions && (
        <>
          <button
            type="button"
            role="menuitem"
            disabled={editAttributesDisabled}
            title="Editar atributos"
            className={ITEM_CLASS}
            onClick={onEditAttributes}
          >
            <Pencil className="h-3.5 w-3.5 shrink-0 opacity-70" />
            Editar atributos
          </button>
          <button
            type="button"
            role="menuitem"
            className={ITEM_CLASS}
            onClick={onZoom}
          >
            <Locate className="h-3.5 w-3.5 shrink-0 opacity-70" />
            Zoom a entidad
          </button>
          <button
            type="button"
            role="menuitem"
            className={`${ITEM_CLASS} text-destructive`}
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
            Eliminar
          </button>
          <div className="my-1 border-t" />
        </>
      )}
      <button
        type="button"
        role="menuitem"
        className={ITEM_CLASS}
        onClick={onCopyCoordinates}
      >
        <ClipboardCopy className="h-3.5 w-3.5 shrink-0 opacity-70" />
        Copiar coordenadas
      </button>
      <button
        type="button"
        role="menuitem"
        className={ITEM_CLASS}
        onClick={onGetInfo}
      >
        <Info className="h-3.5 w-3.5 shrink-0 opacity-70" />
        Obtener información
      </button>
    </div>
  );
}
