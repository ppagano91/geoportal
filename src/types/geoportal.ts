export type GeometryType =
	| 'Point'
	| 'MultiPoint'
	| 'LineString'
	| 'MultiLineString'
	| 'Polygon'
	| 'MultiPolygon'

export interface PointStyle {
	type: 'circle' | 'marker' | 'square' | 'triangle' | 'star'
	size: number // pixels
	color: string // hex
	strokeColor: string // hex
	strokeWidth: number // pixels
}

export interface LineStyle {
	color: string
	width: number
	lineCap?: 'butt' | 'round' | 'square'
}

export interface PolygonStyle {
	fillColor: string
	fillOpacity: number // 0..1
	strokeColor: string
	strokeWidth: number
}

export interface ClusterConfig {
	enabled: boolean
	radius: number
	maxZoom: number
	minPoints: number
}

export interface LayerStats {
	featureCount: number
	geometryType?: GeometryType
	propertyKeys: string[]
	bounds?: [number, number, number, number] // [minX, minY, maxX, maxY] in lon/lat
	numericRanges?: Record<string, { min: number; max: number }>
	uniqueValues?: Record<string, string[]>
}

export type FieldType = 'string' | 'number' | 'boolean' | 'date'

export interface LayerField {
	name: string
	type: FieldType
}

/** Tipo geométrico único de una capa editable (sin geometrías mixtas). */
export type EditableGeometryType = 'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon'

export interface Layer {
	id: string
	name: string
	visible: boolean
	type: 'base' | 'user' | 'system' | 'wms' | 'wfs' | 'drawing' | 'editable'
	data?: GeoJSON.FeatureCollection
	geometryType?: GeometryType
	pointStyle?: PointStyle
	lineStyle?: LineStyle
	polygonStyle?: PolygonStyle
	cluster?: ClusterConfig
	stats?: LayerStats
	wmsUrl?: string
	wmsLayers?: string
	/** Versión WMS negociada en GetCapabilities, p.ej. `"1.3.0"` o `"1.1.1"`. */
	wmsVersion?: string
	/** True si la capa anuncia `queryable` (con herencia de layers padre). */
	wmsQueryable?: boolean
	/** Formatos de GetFeatureInfo anunciados por el servicio. */
	wmsInfoFormats?: string[]
	/** URL base del servicio WFS (sin GetFeature). */
	wfsUrl?: string
	/** FeatureType técnico (`Name` de GetCapabilities). */
	wfsTypeName?: string
	/** Versión WFS negociada con el servidor, p.ej. `"2.0.0"`. */
	wfsVersion?: string
	/** True si GetFeature devolvió exactamente el límite configurado. */
	wfsTruncated?: boolean
	/** Esquema de atributos. Obligatorio en capas `editable`. */
	fields?: LayerField[]
}

/** Capa de geometrías dibujadas. Fuente de verdad serializable (GeoJSON), no el store interno de Terra Draw. */
export type DrawingLayer = Layer & {
	type: 'drawing'
	data: GeoJSON.FeatureCollection
}

/** Capa vectorial creada por el usuario, con esquema de campos y un único tipo geométrico. */
export type EditableLayer = Layer & {
	type: 'editable'
	geometryType: EditableGeometryType
	fields: LayerField[]
	data: GeoJSON.FeatureCollection
}

/** Capa WFS remota, vectorial y de solo lectura. No es una EditableLayer. */
export type WfsLayer = Layer & {
	type: 'wfs'
	wfsUrl: string
	wfsTypeName: string
	data: GeoJSON.FeatureCollection
}

/** Capa WMS raster. La consulta de atributos usa GetFeatureInfo, no queryRenderedFeatures. */
export type WmsLayer = Layer & {
	type: 'wms'
	wmsUrl: string
	wmsLayers: string
}

export type FeatureInfoLayerType = 'wms' | 'wfs' | 'editable'

export type FeatureInfoFeature = {
	id?: string | number
	properties?: Record<string, unknown>
	text?: string
}

export type FeatureInfoResult = {
	layerId: string
	layerName: string
	layerType: FeatureInfoLayerType
	features: FeatureInfoFeature[]
	error?: string
}

export type BaseMapStyle = 'streets' | 'satellite' | 'topo' | 'dark'

/** Modo de la herramienta de medición. No se persiste. */
export type MeasureMode = 'none' | 'distance' | 'area'

/**
 * Selección estadística temporal (multi-feature).
 * Independiente de `selectedFeatureId` (edición / atributos / menú contextual).
 * No se persiste.
 */
export type StatisticsSelection = {
	layerId: string
	featureIds: Array<string | number>
	/** Identifica la barra/bin activo para toggle visual. */
	key: string
}

export interface GeoPortalState {
	layers: Layer[]
	/** Capa seleccionada en el sidebar (propiedades, estilo, acciones). No implica edición. */
	activeLayerId?: string
	/** Capa editable conectada a Terra Draw. Solo una a la vez. */
	editingLayerId?: string
	/** Entidad objetivo de acciones contextuales. */
	selectedFeatureId?: string | number
	/** Capa de la entidad seleccionada. Junto con `selectedFeatureId` identifica la feature. */
	selectedFeatureLayerId?: string
	/** Modal de atributos de una entidad. */
	featureAttributesOpen?: boolean
	/** Capa cuya tabla de atributos está abierta. Solo una a la vez. */
	attributeTableLayerId?: string
	layerSettingsOpen?: boolean
	searchQuery: string
	sidebarOpen: boolean
	theme: 'light' | 'dark'
	baseMap: BaseMapStyle
	drawMode: 'none' | 'point' | 'line' | 'polygon' | 'rectangle' | 'circle' | 'select'
	/** Herramienta de medición temporal. Independiente de dibujo libre y de edición GIS. */
	measureMode: MeasureMode
	drawings: GeoJSON.FeatureCollection
	wmsDialogOpen: boolean
	wfsDialogOpen: boolean
	/** Panel de estadísticas de capa. No persiste resultados; son datos derivados. */
	statisticsOpen?: boolean
	/** Features resaltadas desde el gráfico de estadísticas. Temporal; no persiste. */
	statisticsSelection?: StatisticsSelection
	compareEnabled?: boolean
	terrainEnabled?: boolean
}


