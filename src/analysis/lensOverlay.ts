import type { GeoJSONSource, Map } from "maplibre-gl";
import type { LensCircle } from "./lens";

export const LENS_SOURCE_ID = "gp-analysis-lens";
export const LENS_SELECTION_SOURCE_ID = "gp-analysis-lens-selection";

const LENS_LAYER_IDS = [
	"gp-analysis-lens-fill",
	"gp-analysis-lens-outline",
] as const;

const LENS_SELECTION_LAYER_IDS = [
	"gp-analysis-lens-selection-fill",
	"gp-analysis-lens-selection-line-halo",
	"gp-analysis-lens-selection-line",
	"gp-analysis-lens-selection-point-halo",
	"gp-analysis-lens-selection-point",
] as const;

const EMPTY: GeoJSON.FeatureCollection = {
	type: "FeatureCollection",
	features: [],
};

function highlightCollection(
	features: GeoJSON.Feature[],
): GeoJSON.FeatureCollection {
	return {
		type: "FeatureCollection",
		features: features
			.filter((feature) => feature.geometry != null)
			.map((feature) => ({
				type: "Feature" as const,
				id: feature.id,
				geometry: feature.geometry as GeoJSON.Geometry,
				properties: {},
			})),
	};
}

function ensureLensCircleLayers(map: Map) {
	if (!map.getSource(LENS_SOURCE_ID)) {
		map.addSource(LENS_SOURCE_ID, {
			type: "geojson",
			data: EMPTY,
		});
	}
	if (!map.getLayer("gp-analysis-lens-fill")) {
		map.addLayer({
			id: "gp-analysis-lens-fill",
			type: "fill",
			source: LENS_SOURCE_ID,
			paint: {
				"fill-color": "#0ea5e9",
				"fill-opacity": 0.12,
			},
		});
	}
	if (!map.getLayer("gp-analysis-lens-outline")) {
		map.addLayer({
			id: "gp-analysis-lens-outline",
			type: "line",
			source: LENS_SOURCE_ID,
			paint: {
				"line-color": "#0284c7",
				"line-width": 2,
				"line-opacity": 0.9,
			},
		});
	}
}

function ensureLensSelectionLayers(map: Map) {
	if (!map.getSource(LENS_SELECTION_SOURCE_ID)) {
		map.addSource(LENS_SELECTION_SOURCE_ID, {
			type: "geojson",
			data: EMPTY,
		});
	}
	if (!map.getLayer("gp-analysis-lens-selection-fill")) {
		map.addLayer({
			id: "gp-analysis-lens-selection-fill",
			type: "fill",
			source: LENS_SELECTION_SOURCE_ID,
			filter: [
				"in",
				["geometry-type"],
				["literal", ["Polygon", "MultiPolygon"]],
			],
			paint: {
				"fill-color": "#38bdf8",
				"fill-opacity": 0.28,
			},
		});
	}
	if (!map.getLayer("gp-analysis-lens-selection-line-halo")) {
		map.addLayer({
			id: "gp-analysis-lens-selection-line-halo",
			type: "line",
			source: LENS_SELECTION_SOURCE_ID,
			filter: [
				"in",
				["geometry-type"],
				["literal", ["LineString", "MultiLineString", "Polygon", "MultiPolygon"]],
			],
			paint: {
				"line-color": "#ffffff",
				"line-width": 6,
				"line-opacity": 0.9,
			},
		});
	}
	if (!map.getLayer("gp-analysis-lens-selection-line")) {
		map.addLayer({
			id: "gp-analysis-lens-selection-line",
			type: "line",
			source: LENS_SELECTION_SOURCE_ID,
			filter: [
				"in",
				["geometry-type"],
				["literal", ["LineString", "MultiLineString", "Polygon", "MultiPolygon"]],
			],
			paint: {
				"line-color": "#0284c7",
				"line-width": 2.5,
			},
		});
	}
	if (!map.getLayer("gp-analysis-lens-selection-point-halo")) {
		map.addLayer({
			id: "gp-analysis-lens-selection-point-halo",
			type: "circle",
			source: LENS_SELECTION_SOURCE_ID,
			filter: [
				"in",
				["geometry-type"],
				["literal", ["Point", "MultiPoint"]],
			],
			paint: {
				"circle-radius": 11,
				"circle-color": "#ffffff",
				"circle-opacity": 0.95,
			},
		});
	}
	if (!map.getLayer("gp-analysis-lens-selection-point")) {
		map.addLayer({
			id: "gp-analysis-lens-selection-point",
			type: "circle",
			source: LENS_SELECTION_SOURCE_ID,
			filter: [
				"in",
				["geometry-type"],
				["literal", ["Point", "MultiPoint"]],
			],
			paint: {
				"circle-radius": 7,
				"circle-color": "#0ea5e9",
				"circle-stroke-color": "#0c4a6e",
				"circle-stroke-width": 1.5,
			},
		});
	}
}

export function moveAnalysisLensLayersToTop(map: Map) {
	for (const id of LENS_SELECTION_LAYER_IDS) {
		if (map.getLayer(id)) map.moveLayer(id);
	}
	for (const id of LENS_LAYER_IDS) {
		if (map.getLayer(id)) map.moveLayer(id);
	}
}

export function syncAnalysisLensOverlay(
	map: Map,
	circle: LensCircle | null,
	features: GeoJSON.Feature[],
) {
	try {
		ensureLensSelectionLayers(map);
		ensureLensCircleLayers(map);
		const selection = map.getSource(LENS_SELECTION_SOURCE_ID) as
			| GeoJSONSource
			| undefined;
		const lens = map.getSource(LENS_SOURCE_ID) as GeoJSONSource | undefined;
		selection?.setData(highlightCollection(features));
		lens?.setData(
			circle
				? { type: "FeatureCollection", features: [circle] }
				: EMPTY,
		);
		moveAnalysisLensLayersToTop(map);
	} catch {
		// style may not be ready
	}
}

export function clearAnalysisLensOverlay(map: Map) {
	syncAnalysisLensOverlay(map, null, []);
}

export function isAnalysisLensMapLibreId(layerId: string, sourceId: string): boolean {
	return (
		layerId.startsWith("gp-analysis-lens") ||
		sourceId === LENS_SOURCE_ID ||
		sourceId === LENS_SELECTION_SOURCE_ID
	);
}
