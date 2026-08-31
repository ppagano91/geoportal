import type { Map as MapLibreMap } from 'maplibre-gl'
import type { FeatureInfoFeature, Layer } from '../types/geoportal'

/** Límite de entidades por GetFeatureInfo. Una constante para no repetir el valor. */
export const DEFAULT_WMS_FEATURE_INFO_COUNT = 10

/** Mismo CRS que el GetMap teselado actual (`wmsTileTemplate`). */
export const WMS_MAP_CRS = 'EPSG:3857'

/** Fallback si GetCapabilities no trajo versión. Coincide con el GetMap actual. */
export const WMS_FALLBACK_VERSION = '1.1.1'

export const WMS_INFO_FORMAT_PREFERENCE = [
	'application/json',
	'application/geo+json',
	'text/plain',
	'text/html',
] as const

const WMS_JSON_FORMAT_ALIASES = [
	'application/json',
	'application/geo+json',
	'application/vnd.geo+json',
	'application/geojson',
]

const WMS_OGC_PARAM_KEYS = new Set([
	'service',
	'request',
	'version',
	'layers',
	'query_layers',
	'bbox',
	'width',
	'height',
	'crs',
	'srs',
	'i',
	'j',
	'x',
	'y',
	'info_format',
	'feature_count',
	'styles',
	'format',
	'transparent',
	'exceptions',
	'bgcolor',
])

export type WmsLayerOption = {
	name: string
	title: string
	queryable: boolean
}

export type WmsCapabilities = {
	version: string
	infoFormats: string[]
	layers: WmsLayerOption[]
}

export class WmsQueryError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'WmsQueryError'
	}
}

function directChildText(el: Element, localName: string): string {
	for (const child of Array.from(el.children)) {
		if (child.localName === localName) {
			return (child.textContent ?? '').trim()
		}
	}
	return ''
}

function hasParserError(xml: Document): boolean {
	if (xml.documentElement?.localName === 'parsererror') return true
	return xml.getElementsByTagName('parsererror').length > 0
}

function firstByLocalName(xml: Document, localName: string): Element | undefined {
	const all = xml.getElementsByTagName('*')
	for (const el of Array.from(all)) {
		if (el.localName === localName) return el
	}
	return undefined
}

function sanitizeExceptionMessage(raw: string): string {
	const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
	if (text.length > 240) return `${text.slice(0, 237)}...`
	return text
}

function extractOgcExceptionMessage(xml: Document): string | null {
	const rootName = xml.documentElement?.localName ?? ''
	const isExceptionDocument =
		rootName === 'ServiceExceptionReport' ||
		rootName === 'ExceptionReport' ||
		firstByLocalName(xml, 'ServiceException') != null ||
		firstByLocalName(xml, 'ExceptionReport') != null

	if (!isExceptionDocument) return null

	const raw =
		firstByLocalName(xml, 'ServiceException')?.textContent ??
		firstByLocalName(xml, 'ExceptionText')?.textContent ??
		firstByLocalName(xml, 'Exception')?.getAttribute('exceptionCode') ??
		''
	const message = sanitizeExceptionMessage(raw)
	if (message) return `El servicio WMS respondió con un error: ${message}`
	return 'El servicio WMS respondió con un error.'
}

function parseXml(txt: string): Document {
	return new window.DOMParser().parseFromString(txt, 'text/xml')
}

function looksLikeXml(text: string): boolean {
	const trimmed = text.trimStart()
	return trimmed.startsWith('<') || trimmed.startsWith('\uFEFF<')
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isNetworkFailure(err: unknown): boolean {
	if (!(err instanceof Error)) return false
	if (err.name === 'AbortError') return false
	if (err.name === 'TypeError' || err.name === 'NetworkError') return true
	const msg = err.message.toLowerCase()
	return msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('cors')
}

export function isWms13(version: string): boolean {
	return version.trim().startsWith('1.3')
}

function isEpsg4326(crs: string): boolean {
	const n = crs.trim().toUpperCase()
	if (n.includes('CRS:84') || n.includes('CRS84') || n.includes('OGC:CRS84')) return false
	return n.includes('EPSG:4326') || n === '4326'
}

function resolveQueryableAttr(el: Element, inherited: boolean): boolean {
	const raw = el.getAttribute('queryable')
	if (raw == null || raw.trim() === '') return inherited
	const value = raw.trim().toLowerCase()
	if (value === '1' || value === 'true') return true
	if (value === '0' || value === 'false') return false
	return inherited
}

function collectSelectableLayers(
	el: Element,
	byName: Map<string, WmsLayerOption>,
	inheritedQueryable: boolean,
): void {
	if (el.localName === 'Layer') {
		const queryable = resolveQueryableAttr(el, inheritedQueryable)
		const name = directChildText(el, 'Name')
		if (name && !byName.has(name)) {
			byName.set(name, {
				name,
				title: directChildText(el, 'Title') || name,
				queryable,
			})
		}
		for (const child of Array.from(el.children)) {
			collectSelectableLayers(child, byName, queryable)
		}
		return
	}
	for (const child of Array.from(el.children)) {
		collectSelectableLayers(child, byName, inheritedQueryable)
	}
}

function collectGetFeatureInfoFormats(xml: Document): string[] {
	const formats: string[] = []
	const seen = new Set<string>()
	for (const el of Array.from(xml.getElementsByTagName('*'))) {
		if (el.localName !== 'GetFeatureInfo') continue
		for (const child of Array.from(el.children)) {
			if (child.localName !== 'Format') continue
			const value = (child.textContent ?? '').trim()
			if (!value || seen.has(value)) continue
			seen.add(value)
			formats.push(value)
		}
	}
	return formats
}

export function parseWmsCapabilitiesXml(txt: string): WmsCapabilities {
	const xml = parseXml(txt)
	if (hasParserError(xml) || !xml.documentElement) {
		throw new WmsQueryError('La respuesta del servidor no es un documento WMS GetCapabilities válido.')
	}

	const ogcError = extractOgcExceptionMessage(xml)
	if (ogcError) throw new WmsQueryError(ogcError)

	const byName = new Map<string, WmsLayerOption>()
	collectSelectableLayers(xml.documentElement, byName, false)
	const version = (xml.documentElement.getAttribute('version') ?? '').trim()
	return {
		version,
		infoFormats: collectGetFeatureInfoFormats(xml),
		layers: Array.from(byName.values()),
	}
}

export function pickWmsInfoFormat(formats: string[]): string | undefined {
	if (formats.length === 0) return undefined
	const lower = formats.map((item) => item.toLowerCase())
	for (const preferred of WMS_INFO_FORMAT_PREFERENCE) {
		const index = lower.indexOf(preferred)
		if (index >= 0) return formats[index]
	}
	for (const alias of WMS_JSON_FORMAT_ALIASES) {
		const index = lower.indexOf(alias)
		if (index >= 0) return formats[index]
	}
	return undefined
}

export function isJsonInfoFormat(format: string): boolean {
	const lower = format.toLowerCase()
	return WMS_JSON_FORMAT_ALIASES.some((alias) => lower === alias || lower.startsWith(`${alias};`))
}

export function isHtmlInfoFormat(format: string): boolean {
	const lower = format.toLowerCase()
	return lower === 'text/html' || lower.startsWith('text/html;')
}

export function lngLatToEpsg3857(lng: number, lat: number): [number, number] {
	const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat))
	const x = (lng * 20037508.342789244) / 180
	const y =
		(Math.log(Math.tan(((90 + clampedLat) * Math.PI) / 360)) * 20037508.342789244) /
		Math.PI
	return [x, y]
}

/**
 * Construye el BBOX WMS. Para WMS 1.3.0 + EPSG:4326 usa orden lat,lon.
 * EPSG:3857 (el del GetMap actual) siempre es minx,miny,maxx,maxy.
 */
export function formatWmsBbox(
	minX: number,
	minY: number,
	maxX: number,
	maxY: number,
	version: string,
	crs: string,
): string {
	if (isWms13(version) && isEpsg4326(crs)) {
		return `${minY},${minX},${maxY},${maxX}`
	}
	return `${minX},${minY},${maxX},${maxY}`
}

export function mapBoundsToWmsBbox(map: MapLibreMap, version: string, crs = WMS_MAP_CRS): string {
	const bounds = map.getBounds()
	if (crs === WMS_MAP_CRS) {
		const [minX, minY] = lngLatToEpsg3857(bounds.getWest(), bounds.getSouth())
		const [maxX, maxY] = lngLatToEpsg3857(bounds.getEast(), bounds.getNorth())
		return formatWmsBbox(minX, minY, maxX, maxY, version, crs)
	}
	return formatWmsBbox(
		bounds.getWest(),
		bounds.getSouth(),
		bounds.getEast(),
		bounds.getNorth(),
		version,
		crs,
	)
}

export function buildWmsUrl(serviceUrl: string, params: Record<string, string>): string {
	let url: URL
	try {
		url = new URL(serviceUrl)
	} catch {
		throw new WmsQueryError('La URL del servicio WMS no es válida.')
	}
	for (const key of [...url.searchParams.keys()]) {
		if (WMS_OGC_PARAM_KEYS.has(key.toLowerCase())) {
			url.searchParams.delete(key)
		}
	}
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value)
	}
	return url.toString()
}

export function htmlToSafeText(html: string): string {
	const doc = new window.DOMParser().parseFromString(html, 'text/html')
	return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function featureIdFromUnknown(value: unknown): string | number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return value
	if (typeof value === 'string' && value.trim() !== '') return value
	return undefined
}

function propertiesFromUnknown(value: unknown): Record<string, unknown> | undefined {
	if (!isRecord(value)) return undefined
	return value
}

function parseGeoJsonFeature(value: unknown): FeatureInfoFeature | undefined {
	if (!isRecord(value)) return undefined
	const id = featureIdFromUnknown(value.id)
	const properties = propertiesFromUnknown(value.properties) ?? (value.type === 'Feature' ? {} : undefined)
	if (value.type === 'Feature' || properties != null || id != null) {
		return { id, properties: properties ?? {} }
	}
	return undefined
}

function parseGeoJsonFeatureInfo(value: unknown): FeatureInfoFeature[] {
	if (Array.isArray(value)) {
		return value.flatMap((item) => parseGeoJsonFeatureInfo(item))
	}
	if (!isRecord(value)) return []
	if (value.type === 'FeatureCollection' || Array.isArray(value.features)) {
		const features = Array.isArray(value.features) ? value.features : []
		return features
			.map((item) => parseGeoJsonFeature(item))
			.filter((item): item is FeatureInfoFeature => item != null)
	}
	const single = parseGeoJsonFeature(value)
	return single ? [single] : []
}

export function parseWmsFeatureInfoBody(
	text: string,
	infoFormat: string,
): FeatureInfoFeature[] {
	const trimmed = text.trim()
	if (!trimmed) return []

	if (looksLikeXml(trimmed)) {
		const xml = parseXml(trimmed)
		if (!hasParserError(xml) && xml.documentElement) {
			const ogcError = extractOgcExceptionMessage(xml)
			if (ogcError) throw new WmsQueryError(ogcError)
		}
	}

	if (isJsonInfoFormat(infoFormat)) {
		try {
			const parsed: unknown = JSON.parse(trimmed)
			return parseGeoJsonFeatureInfo(parsed)
		} catch (err) {
			if (err instanceof WmsQueryError) throw err
			throw new WmsQueryError('La respuesta GetFeatureInfo no es JSON válido.')
		}
	}

	if (isHtmlInfoFormat(infoFormat)) {
		const safe = htmlToSafeText(trimmed)
		return safe ? [{ text: safe }] : []
	}

	return [{ text: trimmed }]
}

export function isQueryableWmsLayer(layer: Layer): boolean {
	return (
		layer.type === 'wms' &&
		layer.visible === true &&
		layer.wmsQueryable === true &&
		!!layer.wmsUrl &&
		!!layer.wmsLayers
	)
}

export async function fetchWmsFeatureInfo(
	layer: Layer,
	map: MapLibreMap,
	point: { x: number; y: number },
	signal?: AbortSignal,
): Promise<FeatureInfoFeature[]> {
	if (!layer.wmsUrl || !layer.wmsLayers) {
		throw new WmsQueryError('La capa WMS no tiene URL o nombre técnico.')
	}
	const infoFormat = pickWmsInfoFormat(layer.wmsInfoFormats ?? [])
	if (!infoFormat) {
		return []
	}

	const version = (layer.wmsVersion ?? '').trim() || WMS_FALLBACK_VERSION
	const canvas = map.getCanvas()
	const width = Math.max(1, Math.round(canvas.clientWidth || canvas.width || 1))
	const height = Math.max(1, Math.round(canvas.clientHeight || canvas.height || 1))
	const i = Math.max(0, Math.min(width - 1, Math.round(point.x)))
	const j = Math.max(0, Math.min(height - 1, Math.round(point.y)))
	const bbox = mapBoundsToWmsBbox(map, version, WMS_MAP_CRS)
	const wms13 = isWms13(version)

	const params: Record<string, string> = {
		SERVICE: 'WMS',
		VERSION: version,
		REQUEST: 'GetFeatureInfo',
		LAYERS: layer.wmsLayers,
		QUERY_LAYERS: layer.wmsLayers,
		STYLES: '',
		BBOX: bbox,
		WIDTH: String(width),
		HEIGHT: String(height),
		INFO_FORMAT: infoFormat,
		FEATURE_COUNT: String(DEFAULT_WMS_FEATURE_INFO_COUNT),
		FORMAT: 'image/png',
		TRANSPARENT: 'TRUE',
	}
	if (wms13) {
		params.CRS = WMS_MAP_CRS
		params.I = String(i)
		params.J = String(j)
	} else {
		params.SRS = WMS_MAP_CRS
		params.X = String(i)
		params.Y = String(j)
	}

	const requestUrl = buildWmsUrl(layer.wmsUrl, params)
	let res: Response
	try {
		res = await fetch(requestUrl, { signal })
	} catch (err) {
		if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) throw err
		if (isNetworkFailure(err)) {
			throw new WmsQueryError(
				'No se pudo conectar con el servicio WMS. Verificá la disponibilidad del servidor o la configuración CORS.',
			)
		}
		throw err
	}
	if (!res.ok) {
		throw new WmsQueryError(
			`No se pudo consultar GetFeatureInfo. El servidor respondió con HTTP ${res.status}.`,
		)
	}
	const text = await res.text()
	if (looksLikeXml(text)) {
		const xml = parseXml(text)
		if (!hasParserError(xml) && xml.documentElement) {
			const ogcError = extractOgcExceptionMessage(xml)
			if (ogcError) throw new WmsQueryError(ogcError)
		}
	}
	return parseWmsFeatureInfoBody(text, infoFormat)
}
