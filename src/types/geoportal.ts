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
export type EditableGeometryType = 'Point' | 'LineString' | 'Polygon'

export interface Layer {
	id: string
	name: string
	visible: boolean
	type: 'base' | 'user' | 'system' | 'wms' | 'drawing' | 'editable'
	data?: GeoJSON.FeatureCollection
	geometryType?: GeometryType
	pointStyle?: PointStyle
	lineStyle?: LineStyle
	polygonStyle?: PolygonStyle
	cluster?: ClusterConfig
	stats?: LayerStats
	wmsUrl?: string
	wmsLayers?: string
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

export type BaseMapStyle = 'streets' | 'satellite' | 'topo' | 'dark'

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
	drawings: GeoJSON.FeatureCollection
	wmsDialogOpen: boolean
	compareEnabled?: boolean
	terrainEnabled?: boolean
}


