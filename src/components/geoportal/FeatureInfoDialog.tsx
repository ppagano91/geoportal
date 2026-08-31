import React from "react";
import { ClipboardCopy } from "lucide-react";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/Dialog";
import { Button } from "../ui/Button";
import { ScrollArea } from "../ui/ScrollArea";
import type { FeatureInfoFeature, FeatureInfoResult } from "../../types/geoportal";
import {
  featureInfoLayerKindLabel,
  formatFeatureInfoValue,
  formatLngLat,
} from "../../utils/featureInfo";

function FeatureBlock({
  feature,
  index,
  total,
}: {
  feature: FeatureInfoFeature;
  index: number;
  total: number;
}): JSX.Element {
  const properties = feature.properties ?? {};
  const keys = Object.keys(properties);
  return (
    <div className="grid gap-1.5">
      {total > 1 && (
        <div className="text-xs font-medium text-muted-foreground">
          Entidad {index + 1}
        </div>
      )}
      {feature.id != null && (
        <div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          <div className="text-muted-foreground">ID</div>
          <div className="min-w-0 break-all font-medium">{String(feature.id)}</div>
        </div>
      )}
      {feature.text ? (
        <p className="whitespace-pre-wrap break-words text-sm">{feature.text}</p>
      ) : keys.length === 0 && feature.id == null ? (
        <p className="text-sm text-muted-foreground">Sin atributos.</p>
      ) : (
        <div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          {keys.map((key) => (
            <React.Fragment key={key}>
              <div className="truncate text-muted-foreground" title={key}>
                {key}
              </div>
              <div className="min-w-0 break-all">
                {formatFeatureInfoValue(properties[key])}
              </div>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

export function FeatureInfoDialog({
  open,
  lng,
  lat,
  loading,
  results,
  wmsFailureCount,
  onClose,
  onCopyCoordinates,
}: {
  open: boolean;
  lng: number;
  lat: number;
  loading: boolean;
  results: FeatureInfoResult[];
  wmsFailureCount: number;
  onClose: () => void;
  onCopyCoordinates: () => void;
}): JSX.Element | null {
  const coords = formatLngLat(lng, lat);
  const hasResults = results.some((item) => item.features.length > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      showClose
      className="h-[min(32rem,calc(100vh-5rem))] max-h-[calc(100vh-5rem)] w-full max-w-lg overflow-hidden p-0"
    >
      <DialogHeader className="shrink-0 border-b px-4 py-3 pr-14">
        <DialogTitle>Información del punto</DialogTitle>
        <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-mono text-xs text-foreground">{coords}</span>
          <button
            type="button"
            title="Copiar coordenadas"
            aria-label="Copiar coordenadas"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onCopyCoordinates}
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
          </button>
        </div>
      </DialogHeader>

      <ScrollArea className="min-h-0 flex-1 px-4 py-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Consultando información...</p>
        ) : (
          <div className="grid gap-4">
            {wmsFailureCount > 0 && (
              <p className="text-xs text-muted-foreground" role="status">
                {wmsFailureCount === 1
                  ? "No se pudo consultar 1 capa WMS."
                  : `No se pudo consultar ${wmsFailureCount} capas WMS.`}
              </p>
            )}
            {!hasResults ? (
              <p className="text-sm text-muted-foreground">
                No se encontraron entidades en este punto.
              </p>
            ) : (
              results.map((result) => {
                const count = result.features.length;
                return (
                  <section key={result.layerId} className="grid gap-2">
                    <header className="border-b pb-1.5">
                      <h4 className="text-sm font-semibold">
                        {result.layerName}
                        {count > 1 ? ` — ${count} entidades` : ""}
                      </h4>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {featureInfoLayerKindLabel(result.layerType)}
                      </p>
                    </header>
                    <div className="grid gap-3">
                      {result.features.map((feature, index) => (
                        <FeatureBlock
                          key={`${result.layerId}:${String(feature.id ?? index)}`}
                          feature={feature}
                          index={index}
                          total={count}
                        />
                      ))}
                    </div>
                  </section>
                );
              })
            )}
          </div>
        )}
      </ScrollArea>

      {/* <DialogFooter className="flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3">
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      </DialogFooter> */}
    </Dialog>
  );
}
