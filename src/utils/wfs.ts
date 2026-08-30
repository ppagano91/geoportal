import type { GeometryType } from '../types/geoportal'

/** Límite de entidades por GetFeature. No paginar en esta etapa. */
export const DEFAULT_WFS_FEATURE_LIMIT = 5000

export const WFS_PREFERRED_VERSION = '2.0.0'

export type WfsFeatureType = {
	name: string
	title: string
}

export type WfsCapabilities = {
	version: string
	featureTypes: WfsFeatureType[]
}

export type WfsGetFeatureResult = {
	collection: GeoJSON.FeatureCollection
	truncated: boolean
	geometryTypes: GeometryType[]
}

export class WfsQueryError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'WfsQueryError'
	}
}

const GEOMETRY_TYPES = new Set<GeometryType>([
	'Point',
	'MultiPoint',
	'LineString',
	'MultiLineString',
	'Polygon',
	'MultiPolygon',
])

const OGC_PARAM_KEYS = new Set([
	'service',
	'request',
	'version',
	'acceptversions',
	'typename',
	'typenames',
	'outputformat',
	'srsname',
	'count',
	'maxfeatures',
	'resulttype',
	'startindex',
])

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
	if (message) return `El servicio WFS respondió con un error: ${message}`
	return 'El servicio WFS respondió con un error.'
}

export function isNetworkFailure(err: unknown): boolean {
	if (!(err instanceof Error)) return false
	if (err.name === 'TypeError' || err.name === 'NetworkError') return true
	const msg = err.message.toLowerCase()
	return msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('cors')
}

function looksLikeXml(text: string): boolean {
	const trimmed = text.trimStart()
	return trimmed.startsWith('<') || trimmed.startsWith('\uFEFF<')
}

function parseXml(txt: string): Document {
	return new window.DOMParser().parseFromString(txt, 'text/xml')
}

function throwIfOgcXmlError(txt: string): void {
	if (!looksLikeXml(txt)) return
	const xml = parseXml(txt)
	if (hasParserError(xml) || !xml.documentElement) return
	const ogcError = extractOgcExceptionMessage(xml)
	if (ogcError) throw new WfsQueryError(ogcError)
}

export function isWfs2(version: string): boolean {
	return version.trim().startsWith('2')
}

export function buildWfsUrl(serviceUrl: string, params: Record<string, string>): string {
	let url: URL
	try {
		url = new URL(serviceUrl)
	} catch {
		throw new WfsQueryError('La URL del servicio WFS no es válida.')
	}
	for (const key of [...url.searchParams.keys()]) {
		if (OGC_PARAM_KEYS.has(key.toLowerCase())) {
			url.searchParams.delete(key)
		}
	}
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value)
	}
	return url.toString()
}

function collectFeatureTypes(xml: Document): WfsFeatureType[] {
	const byName = new Map<string, WfsFeatureType>()
	for (const el of Array.from(xml.getElementsByTagName('*'))) {
		if (el.localName !== 'FeatureType') continue
		const name = directChildText(el, 'Name')
		if (!name) continue
		if (byName.has(name)) continue
		byName.set(name, {
			name,
			title: directChildText(el, 'Title') || name,
		})
	}
	return Array.from(byName.values())
}

export function parseWfsCapabilitiesXml(txt: string): WfsCapabilities {
	const xml = parseXml(txt)
	if (hasParserError(xml) || !xml.documentElement) {
		throw new WfsQueryError(
			'La respuesta del servidor no es un documento WFS GetCapabilities válido.',
		)
	}

	const ogcError = extractOgcExceptionMessage(xml)
	if (ogcError) throw new WfsQueryError(ogcError)

	const root = xml.documentElement
	if (root.localName !== 'WFS_Capabilities') {
		throw new WfsQueryError(
			'La respuesta del servidor no es un documento WFS GetCapabilities válido.',
		)
	}

	const version = (root.getAttribute('version') ?? WFS_PREFERRED_VERSION).trim() || WFS_PREFERRED_VERSION
	return {
		version,
		featureTypes: collectFeatureTypes(xml),
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isGeographicCrsName(name: string): boolean {
	const n = name.toUpperCase()
	return (
		n.includes('4326') ||
		n.includes('CRS84') ||
		n.includes('CRS:84') ||
		n.includes('OGC:CRS84')
	)
}

function geojsonCrsName(value: unknown): string | undefined {
	if (!isRecord(value) || !('crs' in value) || value.crs == null) return undefined
	if (!isRecord(value.crs)) return undefined
	if (isRecord(value.crs.properties) && typeof value.crs.properties.name === 'string') {
		return value.crs.properties.name
	}
	if (typeof value.crs.name === 'string') return value.crs.name
	return undefined
}

function visitPositions(coords: unknown, visit: (lng: number, lat: number) => void): void {
	if (!Array.isArray(coords) || coords.length === 0) return
	if (typeof coords[0] === 'number') {
		const lng = coords[0]
		const lat = coords[1]
		if (Number.isFinite(lng) && Number.isFinite(lat)) visit(lng, lat)
		return
	}
	for (const child of coords) visitPositions(child, visit)
}

function geometryHasPlausible4326(geometry: GeoJSON.Geometry): boolean {
	if (geometry.type === 'GeometryCollection') {
		return geometry.geometries.every(geometryHasPlausible4326)
	}
	if (!('coordinates' in geometry)) return false
	let ok = true
	visitPositions(geometry.coordinates, (lng, lat) => {
		if (lng < -180 || lng > 180 || lat < -90 || lat > 90) ok = false
	})
	return ok
}

export function collectGeometryTypes(fc: GeoJSON.FeatureCollection): GeometryType[] {
	const types = new Set<GeometryType>()
	for (const feature of fc.features) {
		const type = feature.geometry?.type
		if (type && GEOMETRY_TYPES.has(type as GeometryType)) {
			types.add(type as GeometryType)
		}
	}
	return Array.from(types)
}

export function geometryFamilies(types: GeometryType[]): {
	point: boolean
	line: boolean
	polygon: boolean
} {
	return {
		point: types.some((t) => t === 'Point' || t === 'MultiPoint'),
		line: types.some((t) => t === 'LineString' || t === 'MultiLineString'),
		polygon: types.some((t) => t === 'Polygon' || t === 'MultiPolygon'),
	}
}

/** Tipo único si hay uno solo; si hay varios de la misma familia, el primero. Mixed families → undefined. */
export function primaryGeometryType(types: GeometryType[]): GeometryType | undefined {
	if (types.length === 0) return undefined
	if (types.length === 1) return types[0]
	const families = geometryFamilies(types)
	const familyCount = Number(families.point) + Number(families.line) + Number(families.polygon)
	if (familyCount === 1) return types[0]
	return undefined
}

function isGeoJSONFeature(value: unknown): value is GeoJSON.Feature {
	return isRecord(value) && value.type === 'Feature'
}

function isValidGeometry(value: unknown): value is GeoJSON.Geometry {
	if (!isRecord(value) || typeof value.type !== 'string') return false
	if (value.type === 'GeometryCollection') return false
	return GEOMETRY_TYPES.has(value.type as GeometryType) && 'coordinates' in value
}

function featureIdFromGeoJSON(
	feature: GeoJSON.Feature,
	fallback: string,
): string | number {
	if (typeof feature.id === 'string' || typeof feature.id === 'number') {
		return feature.id
	}
	return fallback
}

export function normalizeWfsFeatureCollection(
	value: unknown,
	limit: number = DEFAULT_WFS_FEATURE_LIMIT,
): WfsGetFeatureResult {
	if (!isRecord(value) || value.type !== 'FeatureCollection' || !Array.isArray(value.features)) {
		throw new WfsQueryError('La respuesta de GetFeature no es un GeoJSON FeatureCollection válido.')
	}

	const crsName = geojsonCrsName(value)
	if (crsName && !isGeographicCrsName(crsName)) {
		throw new WfsQueryError(
			'El servicio no devolvió geometrías en EPSG:4326. No se puede dibujar la capa sin reproyectar.',
		)
	}

	const seenIds = new Set<string>()
	const features: GeoJSON.Feature[] = []
	for (let index = 0; index < value.features.length; index += 1) {
		const item = value.features[index]
		if (!isGeoJSONFeature(item) || !isValidGeometry(item.geometry)) continue
		if (!geometryHasPlausible4326(item.geometry)) {
			throw new WfsQueryError(
				'El servicio no devolvió geometrías utilizables en EPSG:4326. No se puede dibujar la capa sin reproyectar.',
			)
		}
		const properties = isRecord(item.properties) ? item.properties : {}
		let id = featureIdFromGeoJSON(item, `wfs-${index}`)
		let key = String(id)
		if (seenIds.has(key)) {
			id = `wfs-${index}`
			key = String(id)
		}
		seenIds.add(key)
		features.push({
			type: 'Feature',
			id,
			geometry: item.geometry,
			properties,
		})
	}

	const collection: GeoJSON.FeatureCollection = {
		type: 'FeatureCollection',
		features,
	}

	const numberReturned =
		typeof value.numberReturned === 'number' ? value.numberReturned : undefined
	const numberMatched =
		typeof value.numberMatched === 'number'
			? value.numberMatched
			: typeof value.totalFeatures === 'number'
				? value.totalFeatures
				: undefined
	const truncated =
		features.length >= limit ||
		(numberReturned != null && numberReturned >= limit) ||
		(numberMatched != null && numberMatched > features.length && features.length >= limit)

	if (value.features.length > 0 && features.length === 0) {
		throw new WfsQueryError('La capa no contiene geometrías vectoriales utilizables.')
	}

	return {
		collection,
		truncated,
		geometryTypes: collectGeometryTypes(collection),
	}
}

async function readResponseText(res: Response): Promise<string> {
	return res.text()
}

export async function fetchWfsCapabilities(serviceUrl: string): Promise<WfsCapabilities> {
	const capsUrl = buildWfsUrl(serviceUrl, {
		service: 'WFS',
		request: 'GetCapabilities',
		version: WFS_PREFERRED_VERSION,
	})
	let res: Response
	try {
		res = await fetch(capsUrl)
	} catch (err) {
		if (isNetworkFailure(err)) {
			throw new WfsQueryError(
				'No se pudo conectar con el servicio WFS. Verificá la URL, la disponibilidad del servidor o la configuración CORS.',
			)
		}
		throw err
	}
	if (!res.ok) {
		throw new WfsQueryError(
			`No se pudo consultar el servicio WFS. El servidor respondió con HTTP ${res.status}.`,
		)
	}
	const txt = await readResponseText(res)
	const contentType = (res.headers.get('content-type') ?? '').toLowerCase()
	if (contentType.includes('text/html')) {
		throw new WfsQueryError(
			'La respuesta del servidor no es un documento WFS GetCapabilities válido.',
		)
	}
	return parseWfsCapabilitiesXml(txt)
}

export async function fetchWfsFeatures(options: {
	serviceUrl: string
	typeName: string
	version?: string
	limit?: number
}): Promise<WfsGetFeatureResult> {
	const version = options.version?.trim() || WFS_PREFERRED_VERSION
	const limit = options.limit ?? DEFAULT_WFS_FEATURE_LIMIT
	const wfs2 = isWfs2(version)
	const params: Record<string, string> = {
		service: 'WFS',
		request: 'GetFeature',
		version,
		outputFormat: 'application/json',
		srsName: 'EPSG:4326',
	}
	if (wfs2) {
		params.typeNames = options.typeName
		params.count = String(limit)
	} else {
		params.typeName = options.typeName
		params.maxFeatures = String(limit)
	}

	const getFeatureUrl = buildWfsUrl(options.serviceUrl, params)
	let res: Response
	try {
		res = await fetch(getFeatureUrl)
	} catch (err) {
		if (isNetworkFailure(err)) {
			throw new WfsQueryError(
				'No se pudo conectar con el servicio WFS. Verificá la URL, la disponibilidad del servidor o la configuración CORS.',
			)
		}
		throw err
	}
	if (!res.ok) {
		const txt = await readResponseText(res).catch(() => '')
		throwIfOgcXmlError(txt)
		throw new WfsQueryError(
			`No se pudo obtener la capa «${options.typeName}». El servidor respondió con HTTP ${res.status}.`,
		)
	}

	const txt = await readResponseText(res)
	throwIfOgcXmlError(txt)

	let parsed: unknown
	try {
		parsed = JSON.parse(txt)
	} catch {
		throw new WfsQueryError(
			`La respuesta de GetFeature para «${options.typeName}» no es GeoJSON.`,
		)
	}

	try {
		return normalizeWfsFeatureCollection(parsed, limit)
	} catch (err) {
		if (err instanceof WfsQueryError) {
			throw new WfsQueryError(
				`No se pudo cargar «${options.typeName}»: ${err.message}`,
			)
		}
		throw err
	}
}
