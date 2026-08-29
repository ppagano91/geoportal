import type {
	EditableGeometryType,
	EditableLayer,
	FieldType,
	GeoPortalState,
	Layer,
	LayerField,
} from "../types/geoportal";

const DEFAULT_EDITABLE_COLOR = "#0ea5e9";

const FIELD_TYPES = new Set<FieldType>([
	"string",
	"number",
	"boolean",
	"date",
]);

const EDITABLE_GEOMETRY_TYPES = new Set<EditableGeometryType>([
	"Point",
	"LineString",
	"Polygon",
]);

const RESERVED_FIELD_NAMES = new Set(["id", "type", "geometry", "properties"]);

const FIELD_NAME_RE = /^[\p{L}_][\p{L}\p{N}_]*$/u;

export const EDITABLE_GEOMETRY_OPTIONS: Array<{
	value: EditableGeometryType;
	label: string;
}> = [
	{ value: "Point", label: "Punto" },
	{ value: "LineString", label: "Línea" },
	{ value: "Polygon", label: "Polígono" },
];

export const FIELD_TYPE_OPTIONS: Array<{ value: FieldType; label: string }> = [
	{ value: "string", label: "Texto" },
	{ value: "number", label: "Número" },
	{ value: "boolean", label: "Booleano" },
	{ value: "date", label: "Fecha" },
];

export function isEditableLayer(layer: Layer): layer is EditableLayer {
	return layer.type === "editable";
}

export function getEditableLayerById(
	layers: Layer[],
	id?: string,
): EditableLayer | undefined {
	if (!id) return undefined;
	const layer = layers.find((item) => item.id === id);
	return layer && isEditableLayer(layer) ? layer : undefined;
}

export function geometryTypeToDrawMode(
	type: EditableGeometryType,
): Extract<GeoPortalState["drawMode"], "point" | "line" | "polygon"> {
	switch (type) {
		case "Point":
			return "point";
		case "LineString":
			return "line";
		case "Polygon":
			return "polygon";
	}
}

export function isDrawModeAllowedForEditable(
	mode: GeoPortalState["drawMode"],
	geometryType: EditableGeometryType,
): boolean {
	if (mode === "none" || mode === "select") return true;
	return mode === geometryTypeToDrawMode(geometryType);
}

export function getDrawDocument(
	state: Pick<GeoPortalState, "layers" | "editingLayerId" | "drawings">,
): GeoJSON.FeatureCollection {
	const editable = getEditableLayerById(state.layers, state.editingLayerId);
	if (editable?.data) return editable.data;
	return state.drawings;
}

const TERRA_DRAW_META_KEYS = new Set(["mode", "selected"]);

function persistedProperties(
	previous: GeoJSON.GeoJsonProperties | null | undefined,
): GeoJSON.GeoJsonProperties {
	if (!previous) return {};
	const next: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(previous)) {
		if (TERRA_DRAW_META_KEYS.has(key)) continue;
		next[key] = value;
	}
	return next;
}

/** Conserva ids estables, descarta geometrías incompatibles y no copia el store de Terra Draw. */
export function snapshotToEditableFeatures(
	snapshot: GeoJSON.FeatureCollection,
	layer: EditableLayer,
): GeoJSON.FeatureCollection {
	const previousById = new Map(
		(layer.data?.features ?? []).map((feature) => [String(feature.id), feature]),
	);
	const features: GeoJSON.Feature[] = [];
	const seen = new Set<string>();

	for (const feature of snapshot.features) {
		if (!feature.geometry || feature.geometry.type !== layer.geometryType) {
			continue;
		}
		const id =
			typeof feature.id === "string" || typeof feature.id === "number"
				? feature.id
				: crypto.randomUUID();
		const key = String(id);
		if (seen.has(key)) continue;
		seen.add(key);
		const previous = previousById.get(key);
		features.push({
			type: "Feature",
			id,
			geometry: JSON.parse(JSON.stringify(feature.geometry)) as GeoJSON.Geometry,
			properties: persistedProperties(previous?.properties),
		});
	}

	return { type: "FeatureCollection", features };
}

export function isEditableGeometryType(
	value: unknown,
): value is EditableGeometryType {
	return (
		typeof value === "string" &&
		EDITABLE_GEOMETRY_TYPES.has(value as EditableGeometryType)
	);
}

export function isFieldType(value: unknown): value is FieldType {
	return typeof value === "string" && FIELD_TYPES.has(value as FieldType);
}

export function geometryTypeLabel(type?: string): string {
	switch (type) {
		case "Point":
			return "Punto";
		case "LineString":
			return "Línea";
		case "Polygon":
			return "Polígono";
		case "MultiPoint":
			return "Multipunto";
		case "MultiLineString":
			return "Multilínea";
		case "MultiPolygon":
			return "Multipolígono";
		default:
			return type ?? "Desconocido";
	}
}

export function fieldTypeLabel(type: FieldType): string {
	return FIELD_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

export function validateLayerName(name: string): string | null {
	if (name.trim() === "") {
		return "El nombre de la capa es obligatorio.";
	}
	return null;
}

export function validateFieldName(name: string): string | null {
	const trimmed = name.trim();
	if (trimmed === "") {
		return "El nombre del campo es obligatorio.";
	}
	if (trimmed.length > 64) {
		return `El nombre «${trimmed}» es demasiado largo.`;
	}
	if (!FIELD_NAME_RE.test(trimmed)) {
		return `El nombre «${trimmed}» no es válido. Debe empezar con una letra y solo contener letras, números y guión bajo.`;
	}
	if (RESERVED_FIELD_NAMES.has(trimmed.toLowerCase())) {
		return `El nombre «${trimmed}» está reservado.`;
	}
	return null;
}

export function parseEditableFields(
	drafts: Array<{ name: string; type: FieldType }>,
): { fields: LayerField[] } | { error: string } {
	const fields: LayerField[] = [];
	const seen = new Map<string, string>();

	for (const draft of drafts) {
		const name = draft.name.trim();
		if (name === "") {
			return {
				error:
					"Hay campos sin nombre. Completalos o eliminalos antes de crear la capa.",
			};
		}
		const invalid = validateFieldName(name);
		if (invalid) {
			return { error: invalid };
		}
		if (!isFieldType(draft.type)) {
			return { error: `El tipo del campo «${name}» no es válido.` };
		}
		const key = name.toLowerCase();
		const previous = seen.get(key);
		if (previous != null) {
			return {
				error: `Hay campos duplicados: «${previous}» y «${name}». Cada campo debe tener un nombre único.`,
			};
		}
		seen.set(key, name);
		fields.push({ name, type: draft.type });
	}

	return { fields };
}

export function normalizeLayerFields(value: unknown): LayerField[] | null {
	if (value == null) return [];
	if (!Array.isArray(value)) return null;

	const fields: LayerField[] = [];
	const seen = new Set<string>();
	for (const item of value) {
		if (!isRecord(item)) continue;
		if (typeof item.name !== "string" || !isFieldType(item.type)) continue;
		const name = item.name.trim();
		if (validateFieldName(name) != null) continue;
		const key = name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		fields.push({ name, type: item.type });
	}
	return fields;
}

export function createEditableLayer(options: {
	id?: string;
	name: string;
	geometryType: EditableGeometryType;
	fields: LayerField[];
	visible?: boolean;
	color?: string;
}): EditableLayer {
	const color = options.color ?? DEFAULT_EDITABLE_COLOR;
	const name = options.name.trim();
	const fields = options.fields.map((field) => ({
		name: field.name.trim(),
		type: field.type,
	}));
	const data: GeoJSON.FeatureCollection = {
		type: "FeatureCollection",
		features: [],
	};

	return {
		id: options.id ?? crypto.randomUUID(),
		name,
		type: "editable",
		visible: options.visible ?? true,
		geometryType: options.geometryType,
		fields,
		data,
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
		stats: {
			featureCount: 0,
			geometryType: options.geometryType,
			propertyKeys: fields.map((field) => field.name),
		},
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
