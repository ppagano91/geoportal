import { booleanIntersects } from "@turf/boolean-intersects";
import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import { circle } from "@turf/circle";
import type { AnalysisLensState, Layer } from "../types/geoportal";
import {
	calculateCategoricalStats,
	calculateDateStats,
	calculateNumericStats,
	collectFieldValues,
	getLayerFields,
	isStatisticsSourceLayer,
	type AnalyzableField,
	type CategoricalStats,
	type DateStats,
	type NumericStats,
} from "../statistics/statistics";
import {
	calculateGeometryStats,
	type GeometryStats,
} from "../statistics/geometryStatistics";

export const DEFAULT_LENS_RADIUS_METERS = 250;

/** Throttle del análisis durante mousemove. Suficiente para 60 Hz sin saturar Turf. */
export const LENS_MOVE_INTERVAL_MS = 75;

export const LENS_RADIUS_OPTIONS = [
	{ meters: 50, label: "50 m" },
	{ meters: 100, label: "100 m" },
	{ meters: 250, label: "250 m" },
	{ meters: 500, label: "500 m" },
	{ meters: 1000, label: "1 km" },
] as const;

export type LensCircle = GeoJSON.Feature<GeoJSON.Polygon>;

export type LensFieldStats =
	| { type: "number"; name: string; stats: NumericStats }
	| { type: "string"; name: string; buckets: CategoricalStats["buckets"] }
	| { type: "boolean"; name: string; buckets: CategoricalStats["buckets"] }
	| { type: "date"; name: string; stats: DateStats };

export type LensStatistics = {
	featureCount: number
	field?: LensFieldStats
	geometry?: GeometryStats
};

/**
 * Click del lente podría fijar una selección estadística en una etapa futura.
 * No despachar ni persistir todavía.
 */
export type FixLensSelectionHandler = (payload: {
	layerId: string
	features: GeoJSON.Feature[]
}) => void;

export function defaultAnalysisLens(): AnalysisLensState {
	return { active: false, radiusMeters: DEFAULT_LENS_RADIUS_METERS };
}

export function normalizeLensRadius(meters: number): number {
	if (
		(LENS_RADIUS_OPTIONS as readonly { meters: number }[]).some(
			(option) => option.meters === meters,
		)
	) {
		return meters;
	}
	return DEFAULT_LENS_RADIUS_METERS;
}

export function formatLensRadius(meters: number): string {
	const option = LENS_RADIUS_OPTIONS.find((item) => item.meters === meters);
	if (option) return option.label;
	if (meters >= 1000) return `${meters / 1000} km`;
	return `${meters} m`;
}

export function resolveLensLayerId(
	layers: Layer[],
	currentId: string | undefined,
	preferredId: string | undefined,
): string | undefined {
	const sources = layers.filter(isStatisticsSourceLayer);
	if (currentId && sources.some((layer) => layer.id === currentId)) {
		return currentId;
	}
	if (preferredId && sources.some((layer) => layer.id === preferredId)) {
		return preferredId;
	}
	return sources[0]?.id;
}

export function pruneAnalysisLens(
	lens: AnalysisLensState | undefined,
	layers: Layer[],
): AnalysisLensState | undefined {
	if (!lens) return lens;
	if (!lens.layerId) {
		return {
			...lens,
			radiusMeters: normalizeLensRadius(lens.radiusMeters),
		};
	}
	const layer = layers.find((item) => item.id === lens.layerId);
	if (!layer || !isStatisticsSourceLayer(layer)) {
		return {
			...lens,
			layerId: undefined,
			field: undefined,
			radiusMeters: normalizeLensRadius(lens.radiusMeters),
		};
	}
	if (!lens.field) {
		return {
			...lens,
			radiusMeters: normalizeLensRadius(lens.radiusMeters),
		};
	}
	const fields = getLayerFields(layer);
	if (fields.some((field) => field.name === lens.field)) {
		return {
			...lens,
			radiusMeters: normalizeLensRadius(lens.radiusMeters),
		};
	}
	return {
		...lens,
		field: undefined,
		radiusMeters: normalizeLensRadius(lens.radiusMeters),
	};
}

export function withLensInactive(
	lens: AnalysisLensState | undefined,
): AnalysisLensState | undefined {
	if (!lens?.active) return lens;
	return { ...lens, active: false };
}

export function createLensGeometry(
	center: [number, number],
	radiusMeters: number,
): LensCircle | null {
	if (!Number.isFinite(center[0]) || !Number.isFinite(center[1])) return null;
	if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) return null;
	try {
		return circle(center, radiusMeters / 1000, {
			units: "kilometers",
			steps: 64,
		});
	} catch {
		return null;
	}
}

/**
 * Recorre la FeatureCollection completa en cada evaluación.
 * Datasets grandes (miles de features complejas) pueden notar el costo;
 * una etapa futura podría indexar con rbush / flatbush.
 */
export function getFeaturesInLens(
	collection: GeoJSON.FeatureCollection | undefined,
	lens: LensCircle | null,
): GeoJSON.Feature[] {
	if (!collection || !lens) return [];
	const hits: GeoJSON.Feature[] = [];
	for (const feature of collection.features) {
		if (geometryHitsLens(feature.geometry, lens)) hits.push(feature);
	}
	return hits;
}

function geometryHitsLens(
	geometry: GeoJSON.Geometry | null | undefined,
	lens: LensCircle,
): boolean {
	if (!geometry) return false;
	try {
		switch (geometry.type) {
			case "Point":
				return booleanPointInPolygon(geometry.coordinates, lens);
			case "MultiPoint":
				for (const coordinates of geometry.coordinates) {
					if (booleanPointInPolygon(coordinates, lens)) return true;
				}
				return false;
			case "LineString":
			case "MultiLineString":
			case "Polygon":
			case "MultiPolygon":
				return booleanIntersects(geometry, lens);
			case "GeometryCollection":
				return geometry.geometries.some((part) =>
					geometryHitsLens(part, lens),
				);
			default:
				return false;
		}
	} catch {
		return false;
	}
}

export function getLensStatistics(
	features: GeoJSON.Feature[],
	field: AnalyzableField | undefined,
): LensStatistics {
	const featureCount = features.length;
	if (featureCount === 0) return { featureCount: 0 };
	if (!field) {
		return {
			featureCount,
			geometry: calculateGeometryStats(features),
		};
	}
	const values = collectFieldValues(features, field.name);
	switch (field.type) {
		case "number": {
			const stats = calculateNumericStats(values);
			return stats
				? { featureCount, field: { type: "number", name: field.name, stats } }
				: { featureCount };
		}
		case "boolean": {
			const categorical = calculateCategoricalStats(values, 2);
			const buckets = categorical.buckets.filter((bucket) => !bucket.isOther);
			return buckets.length > 0
				? { featureCount, field: { type: "boolean", name: field.name, buckets } }
				: { featureCount };
		}
		case "date": {
			const stats = calculateDateStats(values);
			return stats
				? { featureCount, field: { type: "date", name: field.name, stats } }
				: { featureCount };
		}
		default: {
			const categorical = calculateCategoricalStats(values, 3);
			const buckets = categorical.buckets
				.filter((bucket) => !bucket.isOther)
				.slice(0, 3);
			return buckets.length > 0
				? { featureCount, field: { type: "string", name: field.name, buckets } }
				: { featureCount };
		}
	}
}

export function isMapUiEvent(event: Event | { target: EventTarget | null }): boolean {
	const target = event.target;
	if (!(target instanceof Element)) return false;
	return target.closest('[data-map-ui="true"]') != null;
}

export function stopMapUiEvent(event: { stopPropagation: () => void }): void {
	event.stopPropagation();
}

export const mapUiSurfaceProps = {
	"data-map-ui": "true" as const,
	onPointerDown: stopMapUiEvent,
	onMouseDown: stopMapUiEvent,
	onClick: stopMapUiEvent,
	onTouchStart: stopMapUiEvent,
	onContextMenu: (event: { preventDefault: () => void; stopPropagation: () => void }) => {
		event.preventDefault();
		event.stopPropagation();
	},
};

export function createLensMoveScheduler<T>(
	fn: (value: T) => void,
	intervalMs = LENS_MOVE_INTERVAL_MS,
): { schedule: (value: T) => void; cancel: () => void } {
	let raf = 0;
	let timer = 0;
	let last = 0;
	let queued: T | null = null;
	let hasQueued = false;

	const flush = () => {
		raf = 0;
		if (!hasQueued) return;
		hasQueued = false;
		last = performance.now();
		fn(queued as T);
	};

	const kick = () => {
		timer = 0;
		raf = requestAnimationFrame(flush);
	};

	return {
		schedule(value: T) {
			queued = value;
			hasQueued = true;
			if (raf || timer) return;
			const wait = Math.max(0, intervalMs - (performance.now() - last));
			if (wait === 0) kick();
			else timer = window.setTimeout(kick, wait);
		},
		cancel() {
			if (raf) cancelAnimationFrame(raf);
			if (timer) window.clearTimeout(timer);
			raf = 0;
			timer = 0;
			hasQueued = false;
			queued = null;
		},
	};
}
