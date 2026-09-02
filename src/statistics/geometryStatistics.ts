import { area } from "@turf/area";
import { length } from "@turf/length";
import type { GeometryType } from "../types/geoportal";
import { formatStatNumber } from "./statistics";

export type GeometryFamily = "Point" | "Line" | "Polygon";

export type NumericExtent = {
	count: number;
	total: number;
	mean: number;
	min: number;
	max: number;
};

export type PointGeometryStats = {
	family: "Point";
	featureCount: number;
	pointCount: number;
};

export type LineGeometryStats = {
	family: "Line";
	featureCount: number;
	length: NumericExtent;
};

export type PolygonGeometryStats = {
	family: "Polygon";
	featureCount: number;
	area: NumericExtent;
};

export type MixedGeometryStats = {
	family: "mixed";
	featureCount: number;
	point?: PointGeometryStats;
	line?: LineGeometryStats;
	polygon?: PolygonGeometryStats;
};

export type GeometryStats =
	| PointGeometryStats
	| LineGeometryStats
	| PolygonGeometryStats
	| MixedGeometryStats
	| { family: "none"; error: string };

const POLYGON_TYPES = new Set<GeometryType>(["Polygon", "MultiPolygon"]);
const LINE_TYPES = new Set<GeometryType>(["LineString", "MultiLineString"]);
const POINT_TYPES = new Set<GeometryType>(["Point", "MultiPoint"]);

export function geometryFamilyOf(
	type: string | undefined,
): GeometryFamily | null {
	if (!type) return null;
	if (POLYGON_TYPES.has(type as GeometryType)) return "Polygon";
	if (LINE_TYPES.has(type as GeometryType)) return "Line";
	if (POINT_TYPES.has(type as GeometryType)) return "Point";
	return null;
}

export function geometryFamilyLabel(family: GeometryFamily | "mixed"): string {
	switch (family) {
		case "Point":
			return "Point";
		case "Line":
			return "LineString";
		case "Polygon":
			return "Polygon";
		case "mixed":
			return "Mixta";
	}
}

function extentFromValues(values: number[]): NumericExtent | null {
	if (values.length === 0) return null;
	const total = values.reduce((sum, value) => sum + value, 0);
	return {
		count: values.length,
		total,
		mean: total / values.length,
		min: Math.min(...values),
		max: Math.max(...values),
	};
}

function polygonAreaM2(feature: GeoJSON.Feature): number | null {
	const geometry = feature.geometry;
	if (!geometry || !POLYGON_TYPES.has(geometry.type as GeometryType)) {
		return null;
	}
	try {
		const value = area(feature);
		return Number.isFinite(value) ? value : null;
	} catch {
		return null;
	}
}

function lineLengthM(feature: GeoJSON.Feature): number | null {
	const geometry = feature.geometry;
	if (!geometry || !LINE_TYPES.has(geometry.type as GeometryType)) {
		return null;
	}
	try {
		const value = length(feature, { units: "meters" });
		return Number.isFinite(value) ? value : null;
	} catch {
		return null;
	}
}

function pointCountInGeometry(geometry: GeoJSON.Geometry): number {
	if (geometry.type === "Point") return 1;
	if (geometry.type === "MultiPoint") return geometry.coordinates.length;
	return 0;
}

function collectPointStats(features: GeoJSON.Feature[]): PointGeometryStats | null {
	let featureCount = 0;
	let pointCount = 0;
	for (const feature of features) {
		const geometry = feature.geometry;
		if (!geometry || !POINT_TYPES.has(geometry.type as GeometryType)) continue;
		featureCount += 1;
		pointCount += pointCountInGeometry(geometry);
	}
	if (featureCount === 0) return null;
	return { family: "Point", featureCount, pointCount };
}

function collectLineStats(features: GeoJSON.Feature[]): LineGeometryStats | null {
	const lengths: number[] = [];
	for (const feature of features) {
		const value = lineLengthM(feature);
		if (value == null) continue;
		lengths.push(value);
	}
	const extent = extentFromValues(lengths);
	if (!extent) return null;
	return { family: "Line", featureCount: extent.count, length: extent };
}

function collectPolygonStats(
	features: GeoJSON.Feature[],
): PolygonGeometryStats | null {
	const areas: number[] = [];
	for (const feature of features) {
		const value = polygonAreaM2(feature);
		if (value == null) continue;
		areas.push(value);
	}
	const extent = extentFromValues(areas);
	if (!extent) return null;
	return { family: "Polygon", featureCount: extent.count, area: extent };
}

export function calculateGeometryStats(
	features: GeoJSON.Feature[],
): GeometryStats {
	const families = new Set<GeometryFamily>();
	let validCount = 0;
	for (const feature of features) {
		const family = geometryFamilyOf(feature.geometry?.type);
		if (!family) continue;
		families.add(family);
		validCount += 1;
	}

	if (validCount === 0) {
		return {
			family: "none",
			error: "No fue posible calcular estadísticas geométricas",
		};
	}

	const point = families.has("Point") ? collectPointStats(features) : null;
	const line = families.has("Line") ? collectLineStats(features) : null;
	const polygon = families.has("Polygon") ? collectPolygonStats(features) : null;

	if (families.size === 1) {
		if (point) return point;
		if (line) return line;
		if (polygon) return polygon;
		return {
			family: "none",
			error: "No fue posible calcular estadísticas geométricas",
		};
	}

	if (!point && !line && !polygon) {
		return {
			family: "none",
			error: "No fue posible calcular estadísticas geométricas",
		};
	}

	return {
		family: "mixed",
		featureCount: validCount,
		point: point ?? undefined,
		line: line ?? undefined,
		polygon: polygon ?? undefined,
	};
}

const M2_PER_KM2 = 1_000_000;

export function formatAreaM2(m2: number, unit: "m2" | "km2"): string {
	if (unit === "km2") {
		return `${formatStatNumber(m2 / M2_PER_KM2, 3)} km²`;
	}
	return `${formatStatNumber(m2, 1)} m²`;
}

export function formatLengthM(meters: number, unit: "m" | "km"): string {
	if (unit === "km") {
		return `${formatStatNumber(meters / 1000, 3)} km`;
	}
	return `${formatStatNumber(meters, 1)} m`;
}

export function areaUnitForTotal(totalM2: number): "m2" | "km2" {
	return totalM2 >= 10_000 ? "km2" : "m2";
}

export function lengthUnitForTotal(totalM: number): "m" | "km" {
	return totalM >= 1000 ? "km" : "m";
}
