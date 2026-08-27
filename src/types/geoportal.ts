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

export interface Layer {
	id: string
	name: string
	visible: boolean
	type: 'base' | 'user' | 'system' | 'wms' | 'drawing'
	data?: GeoJSON.FeatureCollection
	geometryType?: GeometryType
	pointStyle?: PointStyle
	lineStyle?: LineStyle
	polygonStyle?: PolygonStyle
	cluster?: ClusterConfig
	stats?: LayerStats
	wmsUrl?: string
	wmsLayers?: string
}

export type BaseMapStyle = 'streets' | 'satellite' | 'topo' | 'dark'

export interface GeoPortalState {
	layers: Layer[]
	activeLayerId?: string
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


