import type {
	EditableGeometryType,
	EditableLayer,
	FieldType,
	LayerField,
} from "../types/geoportal";
import {
	createEditableLayer,
	isEditableGeometryType,
} from "./editableLayers";

const MIXED_GEOMETRY_ERROR =
	"El GeoJSON contiene más de un tipo de geometría y no puede importarse como una única capa editable.";

const INVALID_GEOJSON_ERROR = "El archivo no es un GeoJSON válido.";

const NO_GEOMETRY_ERROR = "El GeoJSON no contiene geometrías válidas.";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SKIP_PROPERTY_KEYS = new Set([
	"id",
	"type",
	"geometry",
	"properties",
	"mode",
	"selected",
]);

export type ImportGeoJSONResult =
	| { layer: EditableLayer }
	| { error: string };

/**
 * Convierte un GeoJSON cargado en memoria en una capa editable local.
 * No muta el archivo original: trabaja sobre una copia parseada.
 */
export function createEditableLayerFromGeoJSON(options: {
	name: string;
	geojson: unknown;
}): ImportGeoJSONResult {
	const collection = asFeatureCollection(options.geojson);
	if (!collection) {
		return { error: INVALID_GEOJSON_ERROR };
	}

	const sourceFeatures = collection.features.filter(isGeoJSONFeature);
	const geometry = detectEditableGeometryType(sourceFeatures);
	if ("error" in geometry) {
		return geometry;
	}

	const features: GeoJSON.Feature[] = [];
	const matching = sourceFeatures.filter(
		(feature) => feature.geometry?.type === geometry.geometryType,
	);
	for (let index = 0; index < matching.length; index += 1) {
		const next = normalizeImportedFeature(matching[index], matching, index);
		if (next) features.push(next);
	}

	if (features.length === 0) {
		return { error: NO_GEOMETRY_ERROR };
	}

	return {
		layer: createEditableLayer({
			name: options.name.trim() || "Capa importada",
			geometryType: geometry.geometryType,
			fields: inferFieldsFromFeatures(features),
			data: { type: "FeatureCollection", features },
		}),
	};
}

function asFeatureCollection(
	value: unknown,
): GeoJSON.FeatureCollection | null {
	if (!isRecord(value)) return null;
	if (value.type === "FeatureCollection" && Array.isArray(value.features)) {
		return {
			type: "FeatureCollection",
			features: value.features as GeoJSON.Feature[],
		};
	}
	if (value.type === "Feature") {
		return {
			type: "FeatureCollection",
			features: [value as unknown as GeoJSON.Feature],
		};
	}
	return null;
}

function detectEditableGeometryType(
	features: GeoJSON.Feature[],
): { geometryType: EditableGeometryType } | { error: string } {
	const types = new Set<string>();
	for (const feature of features) {
		const type = feature.geometry?.type;
		if (!type) continue;
		types.add(type);
	}

	if (types.size === 0) {
		return { error: NO_GEOMETRY_ERROR };
	}

	if (types.size > 1) {
		return { error: MIXED_GEOMETRY_ERROR };
	}

	const only = [...types][0];
	if (isEditableGeometryType(only)) {
		return { geometryType: only };
	}

	return {
		error: `El GeoJSON contiene geometrías ${only} que no se pueden importar como capa editable en esta etapa.`,
	};
}

/**
 * Unión de keys de todas las features. Tipos inconsistentes → string.
 * No falla la importación.
 */
export function inferFieldsFromFeatures(features: GeoJSON.Feature[]): LayerField[] {
	const order: string[] = [];
	const valuesByName = new Map<string, unknown[]>();

	for (const feature of features) {
		if (!isRecord(feature.properties)) continue;
		for (const [rawName, value] of Object.entries(feature.properties)) {
			const name = rawName.trim();
			if (name === "" || SKIP_PROPERTY_KEYS.has(name.toLowerCase())) {
				continue;
			}
			let bucket = valuesByName.get(name);
			if (!bucket) {
				bucket = [];
				valuesByName.set(name, bucket);
				order.push(name);
			}
			bucket.push(value);
		}
	}

	return order.map((name) => ({
		name,
		type: inferFieldType(valuesByName.get(name) ?? []),
	}));
}

function inferFieldType(values: unknown[]): FieldType {
	const present = values.filter((value) => value != null && value !== "");
	if (present.length === 0) return "string";

	const types = new Set<FieldType>();
	for (const value of present) {
		types.add(classifyValue(value));
	}
	if (types.size === 1) {
		return [...types][0];
	}
	return "string";
}

function classifyValue(value: unknown): FieldType {
	if (typeof value === "boolean") return "boolean";
	if (typeof value === "number" && Number.isFinite(value)) return "number";
	if (typeof value === "string" && DATE_RE.test(value)) return "date";
	return "string";
}

function normalizeImportedFeature(
	feature: GeoJSON.Feature,
	siblings: GeoJSON.Feature[],
	index: number,
): GeoJSON.Feature | null {
	if (!feature.geometry) return null;
	const geometry = cloneJson(feature.geometry);
	if (!geometry) return null;
	const properties = isRecord(feature.properties)
		? (cloneJson(feature.properties) ?? {})
		: {};
	return {
		type: "Feature",
		id: stableFeatureId(feature, siblings, index),
		geometry,
		properties,
	};
}

/**
 * Conserva feature.id si es string o number y no está duplicado.
 * Si falta o colisiona, asigna un UUID una sola vez (no se regenera en F5).
 */
function stableFeatureId(
	feature: GeoJSON.Feature,
	siblings: GeoJSON.Feature[],
	index: number,
): string | number {
	const id = feature.id;
	if (typeof id === "string" || typeof id === "number") {
		const key = String(id);
		const firstIndex = siblings.findIndex(
			(item) =>
				(typeof item.id === "string" || typeof item.id === "number") &&
				String(item.id) === key,
		);
		if (firstIndex === index) return id;
	}
	return crypto.randomUUID();
}

function isGeoJSONFeature(value: unknown): value is GeoJSON.Feature {
	return isRecord(value) && value.type === "Feature";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T | undefined {
	try {
		return JSON.parse(JSON.stringify(value)) as T;
	} catch {
		return undefined;
	}
}
