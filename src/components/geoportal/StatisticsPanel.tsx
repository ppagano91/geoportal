import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Eye, X } from "lucide-react";
import { GeoPortalContext } from "../../shell/GeoPortalApp";
import { Label } from "../ui/Label";
import { Select } from "../ui/Select";
import { ScrollArea } from "../ui/ScrollArea";
import { Button } from "../ui/Button";
import { cn } from "../../utils/cn";
import { useResponsive } from "../../hooks/useResponsive";
import { fieldTypeLabel } from "../../persistence/editableLayers";
import { zoomToFeatureCollection } from "../../utils/geo";
import {
	calculateCategoricalStats,
	calculateDateStats,
	calculateGeneralFieldStats,
	calculateHistogram,
	calculateNumericStats,
	collectFieldValues,
	formatDateDisplay,
	formatPercentage,
	formatStatNumber,
	getLayerFields,
	isStatisticsSourceLayer,
	type AnalyzableField,
	type CategoryBucket,
	type HistogramBin,
} from "../../statistics/statistics";
import {
	areaUnitForTotal,
	calculateGeometryStats,
	formatAreaM2,
	formatLengthM,
	geometryFamilyLabel,
	lengthUnitForTotal,
	type GeometryStats,
	type LineGeometryStats,
	type PolygonGeometryStats,
} from "../../statistics/geometryStatistics";
import {
	categorySelectionKey,
	getFeatureIdsForCategory,
	getFeatureIdsForHistogramBin,
	getSelectedFeatures,
	histogramSelectionKey,
	toFeatureIdSet,
	type FeatureId,
} from "../../statistics/selection";
import { CategoryChart, HistogramChart } from "./StatisticsChart";

type StatsScope = "all" | "selection";

function Kpi({
	label,
	value,
}: {
	label: string;
	value: string | number;
}): JSX.Element {
	return (
		<div className="rounded-md border bg-muted/40 px-2.5 py-2">
			<div className="text-[11px] leading-tight text-muted-foreground">{label}</div>
			<div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
		</div>
	);
}

function StatRow({
	label,
	value,
}: {
	label: string;
	value: string;
}): JSX.Element {
	return (
		<div className="flex items-baseline justify-between gap-3 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="min-w-0 text-right font-medium tabular-nums">{value}</span>
		</div>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}): JSX.Element {
	return (
		<section className="grid gap-2">
			<h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
				{title}
			</h3>
			{children}
		</section>
	);
}

function EmptyNote({ children }: { children: React.ReactNode }): JSX.Element {
	return (
		<p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
			{children}
		</p>
	);
}

function PolygonBlock({ stats }: { stats: PolygonGeometryStats }): JSX.Element {
	const unit = areaUnitForTotal(stats.area.total);
	return (
		<div className="grid gap-1.5">
			<StatRow label="Tipo" value={geometryFamilyLabel("Polygon")} />
			<StatRow label="Entidades" value={formatStatNumber(stats.featureCount, 0)} />
			<StatRow label="Área total" value={formatAreaM2(stats.area.total, unit)} />
			<StatRow label="Área promedio" value={formatAreaM2(stats.area.mean, unit)} />
			<StatRow label="Área mínima" value={formatAreaM2(stats.area.min, unit)} />
			<StatRow label="Área máxima" value={formatAreaM2(stats.area.max, unit)} />
		</div>
	);
}

function LineBlock({ stats }: { stats: LineGeometryStats }): JSX.Element {
	const unit = lengthUnitForTotal(stats.length.total);
	return (
		<div className="grid gap-1.5">
			<StatRow label="Tipo" value={geometryFamilyLabel("Line")} />
			<StatRow label="Entidades" value={formatStatNumber(stats.featureCount, 0)} />
			<StatRow
				label="Longitud total"
				value={formatLengthM(stats.length.total, unit)}
			/>
			<StatRow
				label="Longitud promedio"
				value={formatLengthM(stats.length.mean, unit)}
			/>
			<StatRow
				label="Longitud mínima"
				value={formatLengthM(stats.length.min, unit)}
			/>
			<StatRow
				label="Longitud máxima"
				value={formatLengthM(stats.length.max, unit)}
			/>
		</div>
	);
}

function GeometrySection({ stats }: { stats: GeometryStats }): JSX.Element {
	if (stats.family === "none") {
		return (
			<Section title="Geometría">
				<EmptyNote>{stats.error}</EmptyNote>
			</Section>
		);
	}

	if (stats.family === "Point") {
		return (
			<Section title="Geometría">
				<div className="grid gap-1.5">
					<StatRow label="Tipo" value={geometryFamilyLabel("Point")} />
					<StatRow
						label="Entidades"
						value={formatStatNumber(stats.featureCount, 0)}
					/>
					<StatRow
						label="Puntos"
						value={formatStatNumber(stats.pointCount, 0)}
					/>
				</div>
			</Section>
		);
	}

	if (stats.family === "Line") {
		return (
			<Section title="Geometría">
				<LineBlock stats={stats} />
			</Section>
		);
	}

	if (stats.family === "Polygon") {
		return (
			<Section title="Geometría">
				<PolygonBlock stats={stats} />
			</Section>
		);
	}

	return (
		<Section title="Geometría">
			<div className="grid gap-3">
				<StatRow label="Tipo" value={geometryFamilyLabel("mixed")} />
				<StatRow
					label="Entidades"
					value={formatStatNumber(stats.featureCount, 0)}
				/>
				{stats.polygon ? <PolygonBlock stats={stats.polygon} /> : null}
				{stats.line ? <LineBlock stats={stats.line} /> : null}
				{stats.point ? (
					<div className="grid gap-1.5">
						<StatRow label="Tipo" value={geometryFamilyLabel("Point")} />
						<StatRow
							label="Entidades"
							value={formatStatNumber(stats.point.featureCount, 0)}
						/>
						<StatRow
							label="Puntos"
							value={formatStatNumber(stats.point.pointCount, 0)}
						/>
					</div>
				) : null}
			</div>
		</Section>
	);
}

function ScopeToggle({
	scope,
	onChange,
	selectionCount,
	disabledSelection,
}: {
	scope: StatsScope;
	onChange: (scope: StatsScope) => void;
	selectionCount: number;
	disabledSelection: boolean;
}): JSX.Element {
	return (
		<div
			role="group"
			aria-label="Ámbito de estadísticas"
			className="grid grid-cols-2 gap-1 rounded-md border bg-muted/40 p-1"
		>
			<button
				type="button"
				aria-pressed={scope === "all"}
				className={cn(
					"h-9 rounded px-2 text-xs font-medium tablet:h-8",
					scope === "all"
						? "bg-background text-foreground shadow-sm"
						: "text-muted-foreground hover:text-foreground",
				)}
				onClick={() => onChange("all")}
			>
				Toda la capa
			</button>
			<button
				type="button"
				aria-pressed={scope === "selection"}
				disabled={disabledSelection}
				className={cn(
					"h-9 rounded px-2 text-xs font-medium tablet:h-8 disabled:pointer-events-none disabled:opacity-50",
					scope === "selection"
						? "bg-background text-foreground shadow-sm"
						: "text-muted-foreground hover:text-foreground",
				)}
				onClick={() => onChange("selection")}
			>
				Selección ({formatStatNumber(selectionCount, 0)})
			</button>
		</div>
	);
}

function FieldStatsBody({
	field,
	values,
	activeKey,
	onSelectCategory,
	onSelectBin,
}: {
	field: AnalyzableField;
	values: unknown[];
	activeKey?: string;
	onSelectCategory: (bucket: CategoryBucket) => void;
	onSelectBin: (bin: HistogramBin) => void;
}): JSX.Element {
	const general = useMemo(() => calculateGeneralFieldStats(values), [values]);
	const numeric = useMemo(
		() => (field.type === "number" ? calculateNumericStats(values) : null),
		[field.type, values],
	);
	const histogram = useMemo(
		() => (field.type === "number" ? calculateHistogram(values) : []),
		[field.type, values],
	);
	const categorical = useMemo(
		() =>
			field.type === "string" || field.type === "boolean"
				? calculateCategoricalStats(values)
				: null,
		[field.type, values],
	);
	const dates = useMemo(
		() => (field.type === "date" ? calculateDateStats(values) : null),
		[field.type, values],
	);

	if (general.withData === 0) {
		return (
			<>
				<Section title="Resumen">
					<div className="grid grid-cols-2 gap-2">
						<Kpi label="Entidades" value={formatStatNumber(general.featureCount, 0)} />
						<Kpi label="Sin datos" value={formatStatNumber(general.withoutData, 0)} />
					</div>
				</Section>
				<EmptyNote>El campo seleccionado no contiene datos</EmptyNote>
			</>
		);
	}

	return (
		<>
			<Section title="Resumen">
				<div className="grid grid-cols-2 gap-2">
					<Kpi label="Entidades" value={formatStatNumber(general.featureCount, 0)} />
					<Kpi label="Con datos" value={formatStatNumber(general.withData, 0)} />
					<Kpi label="Sin datos" value={formatStatNumber(general.withoutData, 0)} />
					<Kpi
						label="Valores únicos"
						value={formatStatNumber(general.uniqueCount, 0)}
					/>
				</div>
			</Section>

			{field.type === "number" && numeric ? (
				<Section title="Estadísticas">
					<div className="grid gap-1.5">
						<StatRow label="Mínimo" value={formatStatNumber(numeric.min, 2)} />
						<StatRow label="Máximo" value={formatStatNumber(numeric.max, 2)} />
						<StatRow label="Promedio" value={formatStatNumber(numeric.mean, 2)} />
						<StatRow label="Mediana" value={formatStatNumber(numeric.median, 2)} />
						<StatRow label="Suma" value={formatStatNumber(numeric.sum, 2)} />
					</div>
				</Section>
			) : null}

			{field.type === "number" && histogram.length > 0 ? (
				<Section title="Distribución">
					<HistogramChart
						bins={histogram}
						activeKey={activeKey}
						onSelect={onSelectBin}
					/>
				</Section>
			) : null}

			{categorical ? (
				<Section title="Distribución">
					<CategoryChart
						buckets={categorical.buckets}
						activeKey={activeKey}
						onSelect={onSelectCategory}
					/>
					<ul className="grid gap-1 text-sm">
						{categorical.buckets.map((bucket) => {
							const key = categorySelectionKey(bucket);
							const active = activeKey === key;
							return (
								<li key={key}>
									<button
										type="button"
										title={`Seleccionar ${bucket.value}`}
										aria-pressed={active}
										className={cn(
											"flex min-h-9 w-full items-baseline justify-between gap-3 rounded-md px-1.5 text-left tablet:min-h-7",
											active
												? "bg-foreground/10 font-medium"
												: "hover:bg-muted/80",
										)}
										onClick={() => onSelectCategory(bucket)}
									>
										<span className="min-w-0 truncate">{bucket.value}</span>
										<span className="shrink-0 tabular-nums text-muted-foreground">
											{formatStatNumber(bucket.count, 0)} · {formatPercentage(bucket.percentage)}
										</span>
									</button>
								</li>
							);
						})}
					</ul>
				</Section>
			) : null}

			{field.type === "date" ? (
				<Section title="Estadísticas">
					{dates ? (
						<div className="grid gap-1.5">
							<StatRow label="Fecha mínima" value={formatDateDisplay(dates.min)} />
							<StatRow label="Fecha máxima" value={formatDateDisplay(dates.max)} />
						</div>
					) : (
						<EmptyNote>El campo seleccionado no contiene datos</EmptyNote>
					)}
				</Section>
			) : null}
		</>
	);
}

export function StatisticsPanel(): JSX.Element | null {
	const ctx = useContext(GeoPortalContext)!;
	const { state, dispatch, mapRef } = ctx;
	const { isMobile } = useResponsive();
	const [layerId, setLayerId] = useState("");
	const [fieldName, setFieldName] = useState("");
	const [scope, setScope] = useState<StatsScope>("all");
	const prevLayerFieldRef = useRef({ layerId: "", fieldName: "" });

	const layers = useMemo(
		() => state.layers.filter(isStatisticsSourceLayer),
		[state.layers],
	);

	useEffect(() => {
		if (!state.statisticsOpen) return;
		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") {
				dispatch({ type: "closeStatistics" });
			}
		}
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [dispatch, state.statisticsOpen]);

	useEffect(() => {
		if (!state.statisticsOpen) return;
		setLayerId((current) => {
			if (current && layers.some((layer) => layer.id === current)) return current;
			const active = layers.find((layer) => layer.id === state.activeLayerId);
			return active?.id ?? "";
		});
	}, [layers, state.activeLayerId, state.statisticsOpen]);

	const selectedLayer = layers.find((layer) => layer.id === layerId);
	const fields = useMemo(
		() => (selectedLayer ? getLayerFields(selectedLayer) : []),
		[selectedLayer],
	);

	useEffect(() => {
		setFieldName((current) => {
			if (current && fields.some((field) => field.name === current)) return current;
			return fields[0]?.name ?? "";
		});
	}, [fields, layerId]);

	useEffect(() => {
		const prev = prevLayerFieldRef.current;
		if (prev.layerId === layerId && prev.fieldName === fieldName) return;
		const hadPrevious = prev.layerId !== "" || prev.fieldName !== "";
		prevLayerFieldRef.current = { layerId, fieldName };
		if (hadPrevious) {
			dispatch({ type: "clearStatisticsSelection" });
		}
	}, [dispatch, fieldName, layerId]);

	const selectedField = fields.find((field) => field.name === fieldName);
	const allFeatures = selectedLayer?.data?.features ?? [];
	const selectionForLayer =
		state.statisticsSelection?.layerId === layerId
			? state.statisticsSelection
			: undefined;
	const selectedIdSet = useMemo(
		() => toFeatureIdSet(selectionForLayer?.featureIds),
		[selectionForLayer],
	);
	const selectedFeatures = useMemo(
		() => getSelectedFeatures(allFeatures, selectedIdSet),
		[allFeatures, selectedIdSet],
	);

	useEffect(() => {
		if (
			selectionForLayer &&
			selectionForLayer.featureIds.length > 0 &&
			selectedFeatures.length === 0
		) {
			dispatch({ type: "clearStatisticsSelection" });
		}
	}, [dispatch, selectedFeatures.length, selectionForLayer]);

	useEffect(() => {
		if (selectedFeatures.length > 0) setScope("selection");
		else setScope("all");
	}, [selectedFeatures.length, selectionForLayer?.key]);

	const analysisFeatures =
		scope === "selection" && selectedFeatures.length > 0
			? selectedFeatures
			: allFeatures;
	const fieldValues = useMemo(
		() =>
			selectedField
				? collectFieldValues(analysisFeatures, selectedField.name)
				: [],
		[analysisFeatures, selectedField],
	);
	const geometryStats = useMemo(
		() => (selectedLayer ? calculateGeometryStats(analysisFeatures) : null),
		[analysisFeatures, selectedLayer],
	);
	const selectionPercentage =
		allFeatures.length === 0
			? 0
			: (selectedFeatures.length / allFeatures.length) * 100;

	function applySelection(key: string, ids: FeatureId[]) {
		if (!layerId) return;
		if (selectionForLayer?.key === key) {
			dispatch({ type: "clearStatisticsSelection" });
			return;
		}
		if (ids.length === 0) {
			dispatch({ type: "clearStatisticsSelection" });
			return;
		}
		dispatch({
			type: "setStatisticsSelection",
			selection: { layerId, featureIds: ids, key },
		});
	}

	function handleSelectCategory(bucket: CategoryBucket) {
		if (!selectedField) return;
		applySelection(
			categorySelectionKey(bucket),
			getFeatureIdsForCategory(allFeatures, selectedField.name, bucket),
		);
	}

	function handleSelectBin(bin: HistogramBin) {
		if (!selectedField) return;
		applySelection(
			histogramSelectionKey(bin),
			getFeatureIdsForHistogramBin(allFeatures, selectedField.name, bin),
		);
	}

	function viewSelection() {
		const map = mapRef.current;
		if (!map || selectedFeatures.length === 0) return;
		zoomToFeatureCollection(map, {
			type: "FeatureCollection",
			features: selectedFeatures,
		});
		if (isMobile) {
			dispatch({ type: "closeStatistics", keepSelection: true });
		}
	}

	if (!state.statisticsOpen) return null;

	const layerOptions = [
		{ value: "", label: "Seleccione una capa" },
		...layers.map((layer) => ({ value: layer.id, label: layer.name })),
	];
	const fieldOptions =
		fields.length === 0
			? [{ value: "", label: "Sin campos" }]
			: fields.map((field) => ({
					value: field.name,
					label: `${field.name} (${fieldTypeLabel(field.type)})`,
				}));
	const hasSelection = selectedFeatures.length > 0;

	return (
		<aside
			className={cn(
				"gp-sidebar-panel z-sidebar flex flex-col overflow-hidden bg-background",
				isMobile
					? "absolute inset-0"
					: "absolute bottom-2 right-16 top-2 w-[min(24rem,calc(100%-6rem))] max-w-[420px] min-w-0 rounded-lg border bg-card shadow-card",
			)}
			aria-label="Estadísticas de capa"
			role="dialog"
			aria-modal={isMobile}
		>
			<div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
				<BarChart3 className="h-4 w-4 shrink-0 text-primary" />
				<h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
					Estadísticas
				</h2>
				<button
					type="button"
					aria-label="Cerrar panel"
					title="Cerrar"
					className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground tablet:h-9 tablet:w-9"
					onClick={() => dispatch({ type: "closeStatistics" })}
				>
					<X className="h-4 w-4" />
				</button>
			</div>

			<div className="shrink-0 grid gap-3 border-b px-3 py-3">
				<div className="grid gap-1">
					<Label>Capa</Label>
					<Select
						value={layerId}
						onValueChange={setLayerId}
						options={layerOptions}
						className="max-md:h-11"
					/>
				</div>
				<div className="grid gap-1">
					<Label>Campo</Label>
					<Select
						value={fieldName}
						onValueChange={setFieldName}
						options={fieldOptions}
						className="max-md:h-11"
					/>
				</div>
			</div>

			<ScrollArea className="min-h-0 flex-1 overflow-x-hidden px-3 py-3">
				<div className="grid gap-5">
					{!selectedLayer ? (
						<EmptyNote>
							{layers.length === 0
								? "No hay capas vectoriales disponibles"
								: "Seleccione una capa"}
						</EmptyNote>
					) : allFeatures.length === 0 ? (
						<EmptyNote>La capa no contiene entidades</EmptyNote>
					) : (
						<>
							{hasSelection ? (
								<Section title="Selección actual">
									<div className="grid gap-2">
										<div className="grid grid-cols-2 gap-2">
											<Kpi
												label="Entidades"
												value={formatStatNumber(selectedFeatures.length, 0)}
											/>
											<Kpi
												label="% de la capa"
												value={formatPercentage(selectionPercentage)}
											/>
										</div>
										<div className="flex flex-wrap gap-2">
											<Button
												type="button"
												variant="outline"
												size="sm"
												className="max-md:h-11"
												onClick={() =>
													dispatch({ type: "clearStatisticsSelection" })
												}
											>
												Limpiar selección
											</Button>
											<Button
												type="button"
												variant="secondary"
												size="sm"
												className="max-md:h-11"
												onClick={viewSelection}
											>
												<Eye className="mr-1.5 h-3.5 w-3.5" />
												Ver selección
											</Button>
										</div>
									</div>
								</Section>
							) : null}

							{hasSelection ? (
								<ScopeToggle
									scope={scope}
									onChange={setScope}
									selectionCount={selectedFeatures.length}
									disabledSelection={!hasSelection}
								/>
							) : null}

							{!selectedField ? (
								<EmptyNote>La capa no contiene atributos analizables</EmptyNote>
							) : (
								<FieldStatsBody
									field={selectedField}
									values={fieldValues}
									activeKey={selectionForLayer?.key}
									onSelectCategory={handleSelectCategory}
									onSelectBin={handleSelectBin}
								/>
							)}
							{geometryStats ? <GeometrySection stats={geometryStats} /> : null}
						</>
					)}
				</div>
			</ScrollArea>
		</aside>
	);
}
