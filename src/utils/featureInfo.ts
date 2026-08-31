import type { Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl'
import { isDrawingSessionLayer } from '../persistence/drawingLayers'
import type {
	FeatureInfoFeature,
	FeatureInfoLayerType,
	FeatureInfoResult,
	Layer,
} from '../types/geoportal'

const MEASURE_PREFIX = 'td-measure'
const TERRA_DRAW_LAYER_IDS = [
	'td-polygon',
	'td-polygon-outline',
	'td-linestring',
	'td-point',
	'td-point-marker',
] as const

/** Tolerancia en píxeles alrededor del cursor para puntos y líneas. */
export const FEATURE_INFO_TOLERANCE_PX = 6

const GEOJSON_LAYER_PREFIXES = [
	'pt-sym-',
	'pt-un-',
	'pt-us-',
	'pt-',
	'ln-',
	'pf-',
	'pl-',
] as const

export function formatLngLat(lng: number, lat: number): string {
	return `${lng.toFixed(6)}, ${lat.toFixed(6)}`
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
	if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text)
			return true
		} catch {
			return copyTextFallback(text)
		}
	}
	return copyTextFallback(text)
}

function copyTextFallback(text: string): boolean {
	try {
		const el = document.createElement('textarea')
		el.value = text
		el.setAttribute('readonly', '')
		el.style.position = 'fixed'
		el.style.left = '-9999px'
		document.body.appendChild(el)
		el.select()
		const ok = document.execCommand('copy')
		document.body.removeChild(el)
		return ok
	} catch {
		return false
	}
}

export function formatFeatureInfoValue(value: unknown): string {
	if (value == null || value === '') return '—'
	if (typeof value === 'string') return value.trim() === '' ? '—' : value
	if (typeof value === 'number' || typeof value === 'boolean') return String(value)
	try {
		return JSON.stringify(value)
	} catch {
		return '—'
	}
}

export function featureInfoLayerType(layer: Layer): FeatureInfoLayerType {
	if (layer.type === 'wms') return 'wms'
	if (layer.type === 'wfs') return 'wfs'
	return 'editable'
}

export function featureInfoLayerKindLabel(type: FeatureInfoLayerType): string {
	if (type === 'wms') return 'WMS'
	if (type === 'wfs') return 'WFS'
	return 'Capa local'
}

export function isQueryableVectorLayer(layer: Layer): boolean {
	if (!layer.visible) return false
	if (layer.type === 'wms' || layer.type === 'base' || layer.type === 'system') return false
	if (isDrawingSessionLayer(layer)) return false
	return (
		layer.type === 'wfs' ||
		layer.type === 'editable' ||
		layer.type === 'user' ||
		layer.type === 'drawing'
	)
}

function featureIdFromHit(hit: MapGeoJSONFeature): string | number | undefined {
	if (typeof hit.id === 'number' && Number.isFinite(hit.id)) return hit.id
	if (typeof hit.id === 'string' && hit.id.trim() !== '') return hit.id
	const fromProps = hit.properties?.id
	if (typeof fromProps === 'number' && Number.isFinite(fromProps)) return fromProps
	if (typeof fromProps === 'string' && fromProps.trim() !== '') return fromProps
	return undefined
}

function propertiesFromHit(hit: MapGeoJSONFeature): Record<string, unknown> | undefined {
	const props = hit.properties
	if (props == null || typeof props !== 'object') return undefined
	return { ...props }
}

function stablePropsKey(properties: Record<string, unknown> | undefined): string {
	if (!properties) return ''
	return Object.keys(properties)
		.sort()
		.map((key) => `${key}:${JSON.stringify(properties[key])}`)
		.join('|')
}

function featureDedupeKey(layerId: string, hit: MapGeoJSONFeature): string {
	const id = featureIdFromHit(hit)
	if (id != null) return `${layerId}::id::${String(id)}`
	return `${layerId}::props::${stablePropsKey(propertiesFromHit(hit))}`
}

function isSkippedMapLibreLayer(layerId: string, sourceId: string): boolean {
	if (layerId.startsWith(MEASURE_PREFIX) || sourceId.startsWith(MEASURE_PREFIX)) return true
	if (layerId.startsWith('gp-selected') || sourceId === 'gp-selected-feature') return true
	if (layerId.startsWith('wms-') || sourceId.startsWith('wms-src-')) return true
	if (layerId === 'buildings-3d' || sourceId === 'vect-maptiler') return true
	if (layerId.startsWith('cl-') || layerId.startsWith('cl-t-')) return true
	return false
}

function logicalLayerFromHit(
	hit: MapGeoJSONFeature,
	layers: Layer[],
	editingLayerId?: string,
): Layer | undefined {
	if (hit.properties?.point_count != null) return undefined
	const sourceId = typeof hit.source === 'string' ? hit.source : ''
	const layerId = hit.layer?.id ?? ''
	if (isSkippedMapLibreLayer(layerId, sourceId)) return undefined

	if (sourceId.startsWith('src-')) {
		const id = sourceId.slice('src-'.length)
		const layer = layers.find((item) => item.id === id)
		return layer && isQueryableVectorLayer(layer) ? layer : undefined
	}

	for (const prefix of GEOJSON_LAYER_PREFIXES) {
		if (layerId.startsWith(prefix)) {
			const id = layerId.slice(prefix.length)
			const layer = layers.find((item) => item.id === id)
			return layer && isQueryableVectorLayer(layer) ? layer : undefined
		}
	}

	const isTerraDrawLayer =
		(TERRA_DRAW_LAYER_IDS as readonly string[]).includes(layerId) ||
		layerId.startsWith('td-') ||
		sourceId.startsWith('td-')
	if (isTerraDrawLayer && editingLayerId) {
		if (layerId.startsWith(MEASURE_PREFIX) || sourceId.startsWith(MEASURE_PREFIX)) {
			return undefined
		}
		const layer = layers.find((item) => item.id === editingLayerId)
		return layer && isQueryableVectorLayer(layer) ? layer : undefined
	}

	return undefined
}

function featureFromLayerData(
	layer: Layer,
	featureId: string | number | undefined,
): GeoJSON.Feature | undefined {
	if (!layer.data || featureId == null) return undefined
	return layer.data.features.find((feature) => String(feature.id) === String(featureId))
}

function toFeatureInfoFeature(layer: Layer, hit: MapGeoJSONFeature): FeatureInfoFeature {
	const id = featureIdFromHit(hit)
	const original = featureFromLayerData(layer, id)
	const properties =
		(original?.properties as Record<string, unknown> | null | undefined) ??
		propertiesFromHit(hit) ??
		{}
	return {
		id: original?.id ?? id,
		properties,
	}
}

export function queryVectorFeatureInfo(
	map: MapLibreMap,
	point: { x: number; y: number },
	layers: Layer[],
	editingLayerId?: string,
): FeatureInfoResult[] {
	const pad = FEATURE_INFO_TOLERANCE_PX
	const hits = map.queryRenderedFeatures([
		[point.x - pad, point.y - pad],
		[point.x + pad, point.y + pad],
	])

	const seen = new Set<string>()
	const byLayer = new Map<string, FeatureInfoFeature[]>()

	for (const hit of hits) {
		const layer = logicalLayerFromHit(hit, layers, editingLayerId)
		if (!layer) continue
		const key = featureDedupeKey(layer.id, hit)
		if (seen.has(key)) continue
		seen.add(key)
		const list = byLayer.get(layer.id) ?? []
		list.push(toFeatureInfoFeature(layer, hit))
		byLayer.set(layer.id, list)
	}

	const results: FeatureInfoResult[] = []
	for (const layer of layers) {
		const features = byLayer.get(layer.id)
		if (!features || features.length === 0) continue
		results.push({
			layerId: layer.id,
			layerName: layer.name,
			layerType: featureInfoLayerType(layer),
			features,
		})
	}
	return results
}

export function mergeFeatureInfoResults(
	layers: Layer[],
	vectorResults: FeatureInfoResult[],
	wmsResults: FeatureInfoResult[],
): FeatureInfoResult[] {
	const vectorById = new Map(vectorResults.map((item) => [item.layerId, item]))
	const wmsById = new Map(wmsResults.map((item) => [item.layerId, item]))
	const out: FeatureInfoResult[] = []
	for (const layer of layers) {
		const item = vectorById.get(layer.id) ?? wmsById.get(layer.id)
		if (!item) continue
		if (item.features.length === 0 && !item.error) continue
		out.push(item)
	}
	return out
}
