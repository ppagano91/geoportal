import type {
	DrawingLayer,
	EditableLayer,
	GeometryType,
	Layer,
	LineStyle,
	PointStyle,
	PolygonStyle,
} from "../types/geoportal";
import {
	isEditableGeometryType,
	isEditableLayer,
	normalizeLayerFields,
} from "./editableLayers";

export const DRAWING_LAYERS_STORAGE_KEY = "geoportal:drawing-layers:v1";
export const DRAWING_LAYERS_VERSION = 1 as const;
export const DRAWING_SESSION_LAYER_ID = "gp-drawing-session";
export const DRAWING_SESSION_LAYER_NAME = "Dibujos";

export const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = {
	type: "FeatureCollection",
	features: [],
};

export function emptyFeatureCollection(): GeoJSON.FeatureCollection {
	return { type: "FeatureCollection", features: [] };
}

const DEFAULT_DRAWING_COLOR = "#0ea5e9";

const GEOMETRY_TYPES = new Set<GeometryType>([
	"Point",
	"MultiPoint",
	"LineString",
	"MultiLineString",
	"Polygon",
	"MultiPolygon",
]);

type PersistedOperationalLayer = DrawingLayer | EditableLayer;

type DrawingLayersPayloadV1 = {
	version: typeof DRAWING_LAYERS_VERSION;
	layers: PersistedOperationalLayer[];
};

let lastWrittenJson = "";

export function isDrawingSessionLayer(
	layer: Pick<Layer, "id"> | string,
): boolean {
	const id = typeof layer === "string" ? layer : layer.id;
	return id === DRAWING_SESSION_LAYER_ID;
}

export function shouldRenderDrawingLayerAsGeoJson(
	layer: Layer,
	terraDrawTargetLayerId?: string,
): boolean {
	if (isDrawingSessionLayer(layer)) return false;
	if (
		layer.type === "editable" &&
		terraDrawTargetLayerId != null &&
		layer.id === terraDrawTargetLayerId
	) {
		return false;
	}
	return true;
}

export function inferGeometryType(
	fc: GeoJSON.FeatureCollection,
): GeometryType | undefined {
	for (const feature of fc.features) {
		const type = feature.geometry?.type;
		if (type && GEOMETRY_TYPES.has(type as GeometryType)) {
			return type as GeometryType;
		}
	}
	return undefined;
}

export function createDrawingLayer(options: {
	id: string;
	name: string;
	data: GeoJSON.FeatureCollection;
	color?: string;
	visible?: boolean;
}): DrawingLayer {
	const color = options.color ?? DEFAULT_DRAWING_COLOR;
	return {
		id: options.id,
		name: options.name,
		type: "drawing",
		visible: options.visible ?? true,
		data: cloneFeatureCollection(options.data),
		geometryType: inferGeometryType(options.data),
		pointStyle: {
			type: "circle",
			size: 10,
			color,
			strokeColor: color,
			strokeWidth: 1.5,
		},
		lineStyle: { color, width: 2, lineCap: "round" },
		polygonStyle: {
			fillColor: color,
			fillOpacity: 0.2,
			strokeColor: color,
			strokeWidth: 1.5,
		},
	};
}

export function createDrawingSessionLayer(
	data: GeoJSON.FeatureCollection = EMPTY_FEATURE_COLLECTION,
): DrawingLayer {
	return createDrawingLayer({
		id: DRAWING_SESSION_LAYER_ID,
		name: DRAWING_SESSION_LAYER_NAME,
		data,
	});
}

export function getSessionDrawings(
	layers: Layer[],
): GeoJSON.FeatureCollection {
	const session = layers.find(isDrawingSessionLayer);
	return session?.data
		? cloneFeatureCollection(session.data)
		: cloneFeatureCollection(EMPTY_FEATURE_COLLECTION);
}

export function upsertDrawingSessionLayer(
	layers: Layer[],
	drawings: GeoJSON.FeatureCollection,
): Layer[] {
	const data = cloneFeatureCollection(drawings);
	const index = layers.findIndex(isDrawingSessionLayer);
	if (data.features.length === 0) {
		if (index < 0) return layers;
		return layers.filter((_, i) => i !== index);
	}
	if (index < 0) {
		return [createDrawingSessionLayer(data), ...layers];
	}
	const current = layers[index];
	const next: DrawingLayer = {
		...current,
		type: "drawing",
		data,
		geometryType: inferGeometryType(data),
	};
	const copy = layers.slice();
	copy[index] = next;
	return copy;
}

export function featureCollectionsEqual(
	a: GeoJSON.FeatureCollection,
	b: GeoJSON.FeatureCollection,
): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

export function loadDrawingLayers(): Layer[] {
	if (typeof localStorage === "undefined") {
		return [];
	}
	let raw: string | null;
	try {
		raw = localStorage.getItem(DRAWING_LAYERS_STORAGE_KEY);
	} catch (error) {
		console.warn(
			"[geoportal] no se pudo leer las capas dibujadas de localStorage",
			error,
		);
		return [];
	}
	if (raw == null || raw.trim() === "") {
		lastWrittenJson = serializePayload([]);
		return [];
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		console.warn(
			"[geoportal] capas dibujadas en localStorage no son JSON válido; se ignoran",
			error,
		);
		return [];
	}
	const layers = parseDrawingLayersPayload(parsed);
	lastWrittenJson = serializePayload(layers);
	return layers;
}

export function saveDrawingLayers(layers: Layer[]): void {
	if (typeof localStorage === "undefined") return;
	const persistedLayers = layers
		.filter(isPersistedOperationalLayer)
		.map((layer) => normalizePersistedLayer(layer))
		.filter((layer): layer is PersistedOperationalLayer => layer != null);
	const nextJson = serializePayload(persistedLayers);
	if (nextJson === lastWrittenJson) return;
	try {
		localStorage.setItem(DRAWING_LAYERS_STORAGE_KEY, nextJson);
		lastWrittenJson = nextJson;
	} catch (error) {
		console.warn(
			"[geoportal] no se pudieron guardar las capas persistidas en localStorage",
			error,
		);
	}
}

function isPersistedOperationalLayer(
	layer: Layer,
): layer is PersistedOperationalLayer {
	return layer.type === "drawing" || isEditableLayer(layer);
}

function parseDrawingLayersPayload(value: unknown): PersistedOperationalLayer[] {
	if (!isRecord(value)) {
		console.warn(
			"[geoportal] capas persistidas en localStorage tienen estructura inválida; se ignoran",
		);
		return [];
	}
	if (value.version !== DRAWING_LAYERS_VERSION) {
		console.warn(
			`[geoportal] versión incompatible de capas persistidas (${String(value.version)}); se ignoran`,
		);
		return [];
	}
	if (!Array.isArray(value.layers)) {
		console.warn(
			"[geoportal] capas persistidas en localStorage no incluyen un array de capas; se ignoran",
		);
		return [];
	}

	const layers: PersistedOperationalLayer[] = [];
	const seenIds = new Set<string>();
	let skipped = 0;
	for (const item of value.layers) {
		const layer = normalizePersistedLayer(item);
		if (!layer) {
			skipped += 1;
			continue;
		}
		if (seenIds.has(layer.id)) {
			skipped += 1;
			continue;
		}
		seenIds.add(layer.id);
		layers.push(layer);
	}
	if (skipped > 0) {
		console.warn(
			`[geoportal] se omitieron ${skipped} capa(s) persistida(s) inválidas o duplicadas en localStorage`,
		);
	}
	return layers;
}

function normalizePersistedLayer(
	value: unknown,
): PersistedOperationalLayer | null {
	if (!isRecord(value)) return null;
	if (value.type === "editable") {
		return normalizeEditableLayer(value);
	}
	return normalizeDrawingLayer(value);
}

function normalizeEditableLayer(value: unknown): EditableLayer | null {
	if (!isRecord(value)) return null;
	if (typeof value.id !== "string" || value.id.trim() === "") return null;
	if (typeof value.name !== "string") return null;
	if (value.type !== "editable") return null;
	if (typeof value.visible !== "boolean") return null;
	if (!isEditableGeometryType(value.geometryType)) return null;
	const fields = normalizeLayerFields(value.fields);
	if (fields == null) return null;
	const data =
		value.data == null
			? emptyFeatureCollection()
			: normalizeFeatureCollection(value.data);
	if (!data) return null;

	const layer: EditableLayer = {
		id: value.id,
		name: value.name,
		type: "editable",
		visible: value.visible,
		geometryType: value.geometryType,
		fields,
		data,
		stats: {
			featureCount: data.features.length,
			geometryType: value.geometryType,
			propertyKeys: fields.map((field) => field.name),
		},
	};

	const pointStyle = normalizePointStyle(value.pointStyle);
	if (pointStyle) layer.pointStyle = pointStyle;
	const lineStyle = normalizeLineStyle(value.lineStyle);
	if (lineStyle) layer.lineStyle = lineStyle;
	const polygonStyle = normalizePolygonStyle(value.polygonStyle);
	if (polygonStyle) layer.polygonStyle = polygonStyle;

	return layer;
}

function normalizeDrawingLayer(value: unknown): DrawingLayer | null {
	if (!isRecord(value)) return null;
	if (typeof value.id !== "string" || value.id.trim() === "") return null;
	if (typeof value.name !== "string") return null;
	if (value.type !== "drawing") return null;
	if (typeof value.visible !== "boolean") return null;
	const data = normalizeFeatureCollection(value.data);
	if (!data) return null;

	const layer: DrawingLayer = {
		id: value.id,
		name: value.name,
		type: "drawing",
		visible: value.visible,
		data,
		geometryType:
			typeof value.geometryType === "string" &&
			GEOMETRY_TYPES.has(value.geometryType as GeometryType)
				? (value.geometryType as GeometryType)
				: inferGeometryType(data),
	};

	const pointStyle = normalizePointStyle(value.pointStyle);
	if (pointStyle) layer.pointStyle = pointStyle;
	const lineStyle = normalizeLineStyle(value.lineStyle);
	if (lineStyle) layer.lineStyle = lineStyle;
	const polygonStyle = normalizePolygonStyle(value.polygonStyle);
	if (polygonStyle) layer.polygonStyle = polygonStyle;

	return layer;
}

function normalizeFeatureCollection(
	value: unknown,
): GeoJSON.FeatureCollection | null {
	if (!isRecord(value) || value.type !== "FeatureCollection") return null;
	if (!Array.isArray(value.features)) return null;
	const seenIds = new Set<string>();
	const features: GeoJSON.Feature[] = [];
	for (const item of value.features) {
		const feature = normalizeFeature(item);
		if (!feature) continue;
		if (feature.id != null) {
			const key = String(feature.id);
			if (seenIds.has(key)) continue;
			seenIds.add(key);
		}
		features.push(feature);
	}
	return { type: "FeatureCollection", features };
}

function normalizeFeature(value: unknown): GeoJSON.Feature | null {
	if (!isRecord(value) || value.type !== "Feature") return null;
	if (!isRecord(value.geometry)) return null;
	const geometryType = value.geometry.type;
	if (typeof geometryType !== "string" || !GEOMETRY_TYPES.has(geometryType as GeometryType)) {
		return null;
	}
	if (!("coordinates" in value.geometry)) return null;
	const geometry = jsonClone(value.geometry) as GeoJSON.Geometry | undefined;
	if (!geometry) return null;

	const properties = isRecord(value.properties)
		? sanitizeProperties(value.properties)
		: {};

	const feature: GeoJSON.Feature = {
		type: "Feature",
		geometry,
		properties,
	};
	if (typeof value.id === "string" || typeof value.id === "number") {
		feature.id = value.id;
	}
	return feature;
}

function sanitizeProperties(
	properties: Record<string, unknown>,
): GeoJSON.GeoJsonProperties {
	const next: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(properties)) {
		if (key === "selected") continue;
		const cloned = jsonClone(value);
		if (cloned !== undefined) next[key] = cloned;
	}
	return next;
}

function normalizePointStyle(value: unknown): PointStyle | undefined {
	if (!isRecord(value)) return undefined;
	const types = new Set(["circle", "marker", "square", "triangle", "star"]);
	if (typeof value.type !== "string" || !types.has(value.type)) return undefined;
	if (typeof value.size !== "number" || !Number.isFinite(value.size)) return undefined;
	if (typeof value.color !== "string") return undefined;
	if (typeof value.strokeColor !== "string") return undefined;
	if (typeof value.strokeWidth !== "number" || !Number.isFinite(value.strokeWidth)) {
		return undefined;
	}
	return {
		type: value.type as PointStyle["type"],
		size: value.size,
		color: value.color,
		strokeColor: value.strokeColor,
		strokeWidth: value.strokeWidth,
	};
}

function normalizeLineStyle(value: unknown): LineStyle | undefined {
	if (!isRecord(value)) return undefined;
	if (typeof value.color !== "string") return undefined;
	if (typeof value.width !== "number" || !Number.isFinite(value.width)) return undefined;
	const lineCap =
		value.lineCap === "butt" || value.lineCap === "round" || value.lineCap === "square"
			? value.lineCap
			: undefined;
	return { color: value.color, width: value.width, lineCap };
}

function normalizePolygonStyle(value: unknown): PolygonStyle | undefined {
	if (!isRecord(value)) return undefined;
	if (typeof value.fillColor !== "string") return undefined;
	if (typeof value.fillOpacity !== "number" || !Number.isFinite(value.fillOpacity)) {
		return undefined;
	}
	if (typeof value.strokeColor !== "string") return undefined;
	if (typeof value.strokeWidth !== "number" || !Number.isFinite(value.strokeWidth)) {
		return undefined;
	}
	return {
		fillColor: value.fillColor,
		fillOpacity: value.fillOpacity,
		strokeColor: value.strokeColor,
		strokeWidth: value.strokeWidth,
	};
}

function serializePayload(layers: PersistedOperationalLayer[]): string {
	const payload: DrawingLayersPayloadV1 = {
		version: DRAWING_LAYERS_VERSION,
		layers,
	};
	return JSON.stringify(payload);
}

function cloneFeatureCollection(
	fc: GeoJSON.FeatureCollection,
): GeoJSON.FeatureCollection {
	return jsonClone(fc) ?? { type: "FeatureCollection", features: [] };
}

function jsonClone<T>(value: T): T | undefined {
	try {
		return JSON.parse(JSON.stringify(value)) as T;
	} catch {
		return undefined;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
