import React, { useContext } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Switch } from "../ui/Switch";
import { GeoPortalContext } from "../../shell/GeoPortalApp";
import { Moon, SunMedium, PanelLeft } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useResponsive } from "../../hooks/useResponsive";
import logoGeoPortal from "../../assets/images/favicon_geoportal.png";

export function Header(): JSX.Element {
  const ctx = useContext(GeoPortalContext)!;
  const { state, dispatch } = ctx;
  const { isMobile } = useResponsive();
  const isDark = state.theme === "dark";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);
  return (
    <header className="relative z-header w-full shrink-0 border-b bg-card/95 backdrop-blur-md">
      <div className="mx-auto flex h-12 items-center gap-2 px-3 tablet:h-14 justify-between">
        {!isMobile && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              state.sidebarOpen
                ? "Cerrar panel de capas"
                : "Abrir panel de capas"
            }
            title="Panel de capas"
            onClick={() => dispatch({ type: "toggleSidebar" })}
          >
            <img
            src={logoGeoPortal}
            alt="GeoPortal"
            className="geoportal-logo"
          />
          </Button>
        )}
        {/* <div className="geoportal-logo-wrap">
          <img
            src={logoGeoPortal}
            alt="GeoPortal"
            className="geoportal-logo"
          />
        </div> */}
        {/* {!isMobile && (
          <div className="flex-1">
            <Input
              placeholder="Buscar capas..."
              value={state.searchQuery}
              onChange={(e) =>
                dispatch({ type: "setSearch", query: e.target.value })
              }
            />
          </div>
        )} */}
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <SunMedium className="h-4 w-4 opacity-70" />
          <Switch
            checked={isDark}
            onCheckedChange={(v) =>
              dispatch({ type: "setTheme", theme: v ? "dark" : "light" })
            }
            aria-label="Toggle dark mode"
          />
          <Moon className="h-4 w-4 opacity-70" />
        </div>
        {/* <div className="ml-3 relative" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/80 to-primary shadow-card text-white flex items-center justify-center font-semibold"
            title="Usuario"
          >
            AR
          </button>
          {menuOpen && (
            <div className="fixed right-3 top-12 tablet:top-14 surface z-header w-44 p-2">
              <button className="w-full text-left px-2 py-1 rounded hover:bg-muted">
                Preferencias
              </button>
              <button className="w-full text-left px-2 py-1 rounded hover:bg-muted">
                Configuración
              </button>
              <hr className="my-1 border-border/60" />
              <button className="w-full text-left px-2 py-1 rounded hover:bg-muted text-destructive">
                Cerrar sesión
              </button>
            </div>
          )}
        </div> */}
      </div>
    </header>
  );
}
