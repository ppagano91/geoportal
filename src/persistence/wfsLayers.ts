import type {
	ClusterConfig,
	EditableLayer,
	GeometryType,
	Layer,
	LineStyle,
	PointStyle,
	PolygonStyle,
	WfsLayer,
} from '../types/geoportal'
import {
	createEditableLayer,
	isEditableGeometryType,
	uniqueLocalLayerName,
} from './editableLayers'
import { createEditableLayerFromGeoJSON, inferFieldsFromFeatures } from './importGeoJSON'
import { computeLayerStats } from '../utils/stats'
import {
	collectGeometryTypes,
	primaryGeometryType,
} from '../utils/wfs'

export const WFS_LAYERS_STORAGE_KEY = 'geoportal:wfs-layers:v1'
export const WFS_LAYERS_VERSION = 1 as const

const DEFAULT_WFS_COLOR = '#0ea5e9'

const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = {
	type: 'FeatureCollection',
	features: [],
}

const GEOMETRY_TYPES = new Set<GeometryType>([
	'Point',
	'MultiPoint',
	'LineString',
	'MultiLineString',
	'Polygon',
	'MultiPolygon',
])

type WfsLayersPayloadV1 = {
	version: typeof WFS_LAYERS_VERSION
	layers: WfsLayerMetadata[]
}

type WfsLayerMetadata = {
	id: string
	name: string
	type: 'wfs'
	visible: boolean
	wfsUrl: string
	wfsTypeName: string
	wfsVersion?: string
	geometryType?: GeometryType
	pointStyle?: PointStyle
	lineStyle?: LineStyle
	polygonStyle?: PolygonStyle
	cluster?: WfsLayer['cluster']
}

let lastWrittenJson = ''

export function isWfsLayer(layer: Layer): layer is WfsLayer {
	return layer.type === 'wfs' && typeof layer.wfsUrl === 'string' && typeof layer.wfsTypeName === 'string'
}

export function createWfsLayer(options: {
	id?: string
	name: string
	wfsUrl: string
	wfsTypeName: string
	wfsVersion?: string
	visible?: boolean
	data?: GeoJSON.FeatureCollection
	truncated?: boolean
	color?: string
	geometryType?: GeometryType
	pointStyle?: PointStyle
	lineStyle?: LineStyle
	polygonStyle?: PolygonStyle
	cluster?: WfsLayer['cluster']
}): WfsLayer {
	const color = options.color ?? DEFAULT_WFS_COLOR
	const data = options.data ?? { type: 'FeatureCollection', features: [] }
	const geometryTypes = collectGeometryTypes(data)
	const geometryType =
		options.geometryType && GEOMETRY_TYPES.has(options.geometryType)
			? options.geometryType
			: primaryGeometryType(geometryTypes)
	const stats = computeLayerStats(data)
	const fields = inferFieldsFromFeatures(data.features)

	return {
		id: options.id ?? crypto.randomUUID(),
		name: options.name,
		type: 'wfs',
		visible: options.visible ?? true,
		wfsUrl: options.wfsUrl,
		wfsTypeName: options.wfsTypeName,
		wfsVersion: options.wfsVersion,
		wfsTruncated: options.truncated ?? false,
		data,
		geometryType,
		fields,
		stats: {
			...stats,
			geometryType,
			propertyKeys: fields.map((field) => field.name),
		},
		pointStyle: options.pointStyle ?? {
			type: 'circle',
			size: 10,
			color,
			strokeColor: color,
			strokeWidth: 1.5,
		},
		lineStyle: options.lineStyle ?? { color, width: 2, lineCap: 'round' },
		polygonStyle: options.polygonStyle ?? {
			fillColor: color,
			fillOpacity: 0.2,
			strokeColor: color,
			strokeWidth: 1.5,
		},
		cluster: options.cluster,
	}
}

export type ConvertWfsResult =
	| { layer: EditableLayer; truncated: boolean }
	| { error: string }

/**
 * Copia el FeatureCollection cargado de un WFS a una EditableLayer independiente.
 * No muta ni reutiliza la capa WFS original.
 */
export function createEditableLayerFromWfs(
	source: Layer,
	existingLayers: Layer[],
): ConvertWfsResult {
	if (!isWfsLayer(source)) {
		return { error: 'No se pudo crear la capa local.' }
	}

	const cloned = cloneJson(source.data)
	if (!cloned || cloned.type !== 'FeatureCollection' || !Array.isArray(cloned.features)) {
		return { error: 'No se pudo crear la capa local.' }
	}

	const name = uniqueLocalLayerName(source.name, existingLayers)
	const truncated = !!source.wfsTruncated

	if (cloned.features.length === 0) {
		if (!isEditableGeometryType(source.geometryType)) {
			if (source.geometryType) {
				return {
					error:
						'La capa contiene tipos de geometría no compatibles con la edición actual.',
				}
			}
			return {
				error:
					'No se puede crear una capa editable porque la capa WFS no contiene entidades y no se pudo determinar su tipo de geometría.',
			}
		}
		return {
			layer: withCopiedWfsStyle(
				createEditableLayer({
					name,
					geometryType: source.geometryType,
					fields: inferFieldsFromFeatures([]),
					data: { type: 'FeatureCollection', features: [] },
					visible: source.visible,
				}),
				source,
			),
			truncated,
		}
	}

	const types = collectGeometryTypes(cloned)
	if (types.length === 0) {
		return { error: 'No se pudo crear la capa local.' }
	}
	if (types.length > 1) {
		return {
			error:
				'No se puede convertir esta capa porque contiene distintos tipos de geometría.',
		}
	}
	if (!isEditableGeometryType(types[0])) {
		return {
			error: 'La capa contiene tipos de geometría no compatibles con la edición actual.',
		}
	}

	const result = createEditableLayerFromGeoJSON({ name, geojson: cloned })
	if ('error' in result) {
		return { error: 'No se pudo crear la capa local.' }
	}

	return {
		layer: withCopiedWfsStyle(
			{ ...result.layer, visible: source.visible },
			source,
		),
		truncated,
	}
}

function withCopiedWfsStyle(layer: EditableLayer, source: WfsLayer): EditableLayer {
	const pointStyle = cloneJson(source.pointStyle)
	const lineStyle = cloneJson(source.lineStyle)
	const polygonStyle = cloneJson(source.polygonStyle)
	const cluster = cloneJson(source.cluster)
	return {
		...layer,
		pointStyle: pointStyle ?? layer.pointStyle,
		lineStyle: lineStyle ?? layer.lineStyle,
		polygonStyle: polygonStyle ?? layer.polygonStyle,
		cluster: cluster ?? layer.cluster,
	}
}

function cloneJson<T>(value: T): T | undefined {
	if (value == null) return undefined
	try {
		return JSON.parse(JSON.stringify(value)) as T
	} catch {
		return undefined
	}
}

export function wfsLayerFromGetFeature(options: {
	serviceUrl: string
	typeName: string
	title: string
	version?: string
	collection: GeoJSON.FeatureCollection
	truncated: boolean
}): WfsLayer {
	return createWfsLayer({
		name: options.title || options.typeName,
		wfsUrl: options.serviceUrl,
		wfsTypeName: options.typeName,
		wfsVersion: options.version,
		data: options.collection,
		truncated: options.truncated,
	})
}

export function patchWfsLayerData(
	layer: WfsLayer,
	collection: GeoJSON.FeatureCollection,
	truncated: boolean,
): WfsLayer {
	const geometryTypes = collectGeometryTypes(collection)
	const geometryType = primaryGeometryType(geometryTypes)
	const stats = computeLayerStats(collection)
	const fields = inferFieldsFromFeatures(collection.features)
	return {
		...layer,
		data: collection,
		wfsTruncated: truncated,
		geometryType,
		fields,
		stats: {
			...stats,
			geometryType,
			propertyKeys: fields.map((field) => field.name),
		},
	}
}

export function loadWfsLayers(): WfsLayer[] {
	if (typeof localStorage === 'undefined') return []
	let raw: string | null
	try {
		raw = localStorage.getItem(WFS_LAYERS_STORAGE_KEY)
	} catch (error) {
		console.warn('[geoportal] no se pudo leer las capas WFS de localStorage', error)
		return []
	}
	if (raw == null || raw.trim() === '') {
		lastWrittenJson = serializePayload([])
		return []
	}
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch (error) {
		console.warn('[geoportal] capas WFS en localStorage no son JSON válido; se ignoran', error)
		return []
	}
	const layers = parseWfsLayersPayload(parsed)
	lastWrittenJson = serializePayload(layers.map(toMetadata))
	return layers
}

export function saveWfsLayers(layers: Layer[]): void {
	if (typeof localStorage === 'undefined') return
	const persisted = layers.filter(isWfsLayer).map(toMetadata)
	const nextJson = serializePayload(persisted)
	if (nextJson === lastWrittenJson) return
	try {
		localStorage.setItem(WFS_LAYERS_STORAGE_KEY, nextJson)
		lastWrittenJson = nextJson
	} catch (error) {
		console.warn(
			'[geoportal] no se pudieron guardar las capas WFS en localStorage (no se persiste el GeoJSON)',
			error,
		)
	}
}

function toMetadata(layer: WfsLayer): WfsLayerMetadata {
	const meta: WfsLayerMetadata = {
		id: layer.id,
		name: layer.name,
		type: 'wfs',
		visible: layer.visible,
		wfsUrl: layer.wfsUrl,
		wfsTypeName: layer.wfsTypeName,
		wfsVersion: layer.wfsVersion,
		geometryType: layer.geometryType,
	}
	if (layer.pointStyle) meta.pointStyle = layer.pointStyle
	if (layer.lineStyle) meta.lineStyle = layer.lineStyle
	if (layer.polygonStyle) meta.polygonStyle = layer.polygonStyle
	if (layer.cluster) meta.cluster = layer.cluster
	return meta
}

function parseWfsLayersPayload(value: unknown): WfsLayer[] {
	if (!isRecord(value)) return []
	if (value.version !== WFS_LAYERS_VERSION) {
		console.warn(
			`[geoportal] versión incompatible de capas WFS persistidas (${String(value.version)}); se ignoran`,
		)
		return []
	}
	if (!Array.isArray(value.layers)) return []
	const layers: WfsLayer[] = []
	const seenIds = new Set<string>()
	for (const item of value.layers) {
		const layer = normalizePersistedWfsLayer(item)
		if (!layer || seenIds.has(layer.id)) continue
		seenIds.add(layer.id)
		layers.push(layer)
	}
	return layers
}

function normalizePersistedWfsLayer(value: unknown): WfsLayer | null {
	if (!isRecord(value)) return null
	if (typeof value.id !== 'string' || value.id.trim() === '') return null
	if (typeof value.name !== 'string') return null
	if (value.type !== 'wfs') return null
	if (typeof value.visible !== 'boolean') return null
	if (typeof value.wfsUrl !== 'string' || value.wfsUrl.trim() === '') return null
	if (typeof value.wfsTypeName !== 'string' || value.wfsTypeName.trim() === '') return null

	return createWfsLayer({
		id: value.id,
		name: value.name,
		visible: value.visible,
		wfsUrl: value.wfsUrl,
		wfsTypeName: value.wfsTypeName,
		wfsVersion: typeof value.wfsVersion === 'string' ? value.wfsVersion : undefined,
		geometryType:
			typeof value.geometryType === 'string' && GEOMETRY_TYPES.has(value.geometryType as GeometryType)
				? (value.geometryType as GeometryType)
				: undefined,
		pointStyle: normalizePointStyle(value.pointStyle),
		lineStyle: normalizeLineStyle(value.lineStyle),
		polygonStyle: normalizePolygonStyle(value.polygonStyle),
		cluster: normalizeCluster(value.cluster),
		data: EMPTY_FEATURE_COLLECTION,
	})
}

function serializePayload(layers: WfsLayerMetadata[]): string {
	const payload: WfsLayersPayloadV1 = {
		version: WFS_LAYERS_VERSION,
		layers,
	}
	return JSON.stringify(payload)
}

function normalizePointStyle(value: unknown): PointStyle | undefined {
	if (!isRecord(value)) return undefined
	const types = new Set(['circle', 'marker', 'square', 'triangle', 'star'])
	if (typeof value.type !== 'string' || !types.has(value.type)) return undefined
	if (typeof value.size !== 'number' || !Number.isFinite(value.size)) return undefined
	if (typeof value.color !== 'string') return undefined
	if (typeof value.strokeColor !== 'string') return undefined
	if (typeof value.strokeWidth !== 'number' || !Number.isFinite(value.strokeWidth)) {
		return undefined
	}
	return {
		type: value.type as PointStyle['type'],
		size: value.size,
		color: value.color,
		strokeColor: value.strokeColor,
		strokeWidth: value.strokeWidth,
	}
}

function normalizeLineStyle(value: unknown): LineStyle | undefined {
	if (!isRecord(value)) return undefined
	if (typeof value.color !== 'string') return undefined
	if (typeof value.width !== 'number' || !Number.isFinite(value.width)) return undefined
	const lineCap =
		value.lineCap === 'butt' || value.lineCap === 'round' || value.lineCap === 'square'
			? value.lineCap
			: undefined
	return { color: value.color, width: value.width, lineCap }
}

function normalizePolygonStyle(value: unknown): PolygonStyle | undefined {
	if (!isRecord(value)) return undefined
	if (typeof value.fillColor !== 'string') return undefined
	if (typeof value.fillOpacity !== 'number' || !Number.isFinite(value.fillOpacity)) {
		return undefined
	}
	if (typeof value.strokeColor !== 'string') return undefined
	if (typeof value.strokeWidth !== 'number' || !Number.isFinite(value.strokeWidth)) {
		return undefined
	}
	return {
		fillColor: value.fillColor,
		fillOpacity: value.fillOpacity,
		strokeColor: value.strokeColor,
		strokeWidth: value.strokeWidth,
	}
}

function normalizeCluster(value: unknown): ClusterConfig | undefined {
	if (!isRecord(value)) return undefined
	if (typeof value.enabled !== 'boolean') return undefined
	if (typeof value.radius !== 'number' || !Number.isFinite(value.radius)) return undefined
	if (typeof value.maxZoom !== 'number' || !Number.isFinite(value.maxZoom)) return undefined
	if (typeof value.minPoints !== 'number' || !Number.isFinite(value.minPoints)) return undefined
	return {
		enabled: value.enabled,
		radius: value.radius,
		maxZoom: value.maxZoom,
		minPoints: value.minPoints,
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
