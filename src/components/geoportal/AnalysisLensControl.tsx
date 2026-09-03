import React, { useContext, useMemo } from "react";
import { CircleDot } from "lucide-react";
import { GeoPortalContext } from "../../shell/GeoPortalApp";
import { Label } from "../ui/Label";
import { Select } from "../ui/Select";
import { Switch } from "../ui/Switch";
import { cn } from "../../utils/cn";
import { useResponsive } from "../../hooks/useResponsive";
import { fieldTypeLabel } from "../../persistence/editableLayers";
import {
	getLayerFields,
	isStatisticsSourceLayer,
} from "../../statistics/statistics";
import {
	LENS_RADIUS_OPTIONS,
	mapUiSurfaceProps,
} from "../../analysis/lens";

export function AnalysisLensControl(): JSX.Element {
	const ctx = useContext(GeoPortalContext)!;
	const { state, dispatch, drawEngineRef, measureEngineRef } = ctx;
	const { isMobile } = useResponsive();
	const lens = state.analysisLens;
	const active = !!lens?.active;

	const layers = useMemo(
		() => state.layers.filter(isStatisticsSourceLayer),
		[state.layers],
	);
	const selectedLayer = layers.find((layer) => layer.id === lens?.layerId);
	const fields = useMemo(
		() => (selectedLayer ? getLayerFields(selectedLayer) : []),
		[selectedLayer],
	);

	function toggle() {
		if (!active) {
			measureEngineRef.current?.setMode("none");
			drawEngineRef.current?.setMode("none");
		}
		dispatch({ type: "toggleAnalysisLens" });
	}

	const btn = isMobile ? "h-11 w-11 p-0" : "h-9 w-9 p-0";
	const col = isMobile ? "w-11" : "w-9";
	const layerOptions = [
		{ value: "", label: layers.length === 0 ? "Sin capas" : "Seleccione una capa" },
		...layers.map((layer) => ({ value: layer.id, label: layer.name })),
	];
	const fieldOptions = [
		{ value: "", label: "Sin campo" },
		...fields.map((field) => ({
			value: field.name,
			label: `${field.name} (${fieldTypeLabel(field.type)})`,
		})),
	];
	const radiusOptions = LENS_RADIUS_OPTIONS.map((option) => ({
		value: String(option.meters),
		label: option.label,
	}));

	return (
		<div className="flex items-start gap-1 tablet:gap-2" {...mapUiSurfaceProps}>
			<div className={cn("surface flex flex-col items-center p-0.5", col)}>
				<button
					type="button"
					className={cn(
						"flex items-center justify-center text-xs",
						btn,
						active && "rounded-md bg-primary text-primary-foreground",
					)}
					title="Lente de análisis"
					aria-label="Lente de análisis"
					aria-pressed={active}
					aria-expanded={active}
					onClick={toggle}
				>
					<CircleDot className="h-4 w-4" />
				</button>
			</div>
			{active ? (
				<div
					className="surface grid w-[min(16rem,calc(100vw-5rem))] gap-2 px-2.5 py-2 text-xs shadow-md"
					role="dialog"
					aria-label="Lente de análisis"
				>
					<div className="text-sm font-semibold">Lente de análisis</div>
					<div className="grid gap-1">
						<Label className="text-xs">Capa</Label>
						<Select
							value={lens?.layerId ?? ""}
							onValueChange={(layerId) =>
								dispatch({
									type: "setAnalysisLens",
									patch: {
										layerId: layerId || undefined,
										field: undefined,
									},
								})
							}
							options={layerOptions}
							className="h-8 max-md:h-11"
						/>
					</div>
					<div className="grid gap-1">
						<Label className="text-xs">Radio</Label>
						<Select
							value={String(lens?.radiusMeters ?? 250)}
							onValueChange={(value) =>
								dispatch({
									type: "setAnalysisLens",
									patch: { radiusMeters: Number(value) },
								})
							}
							options={radiusOptions}
							className="h-8 max-md:h-11"
						/>
					</div>
					<div className="grid gap-1">
						<Label className="text-xs">Campo</Label>
						<Select
							value={lens?.field ?? ""}
							onValueChange={(field) =>
								dispatch({
									type: "setAnalysisLens",
									patch: { field: field || undefined },
								})
							}
							options={fieldOptions}
							className="h-8 max-md:h-11"
						/>
					</div>
					<div className="flex items-center justify-between gap-2 pt-0.5">
						<span className="font-medium">Activo</span>
						<Switch
							checked={active}
							onCheckedChange={(checked) => {
								if (!checked) dispatch({ type: "toggleAnalysisLens" });
							}}
							aria-label="Lente activo"
						/>
					</div>
				</div>
			) : null}
		</div>
	);
}
