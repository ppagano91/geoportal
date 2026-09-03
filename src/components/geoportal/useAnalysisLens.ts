import { useEffect, useMemo, useRef, useState } from "react";
import type { Map, MapMouseEvent } from "maplibre-gl";
import type { AnalysisLensState, Layer } from "../../types/geoportal";
import { getLayerFields } from "../../statistics/statistics";
import {
	createLensGeometry,
	createLensMoveScheduler,
	getFeaturesInLens,
	getLensStatistics,
	type LensCircle,
	type LensStatistics,
} from "../../analysis/lens";
import {
	clearAnalysisLensOverlay,
	syncAnalysisLensOverlay,
} from "../../analysis/lensOverlay";
import { restoreMapCursor } from "./terraDraw";

export type LensPointer = {
	lng: number
	lat: number
	x: number
	y: number
	radiusPx: number
};

export type AnalysisLensView = {
	pointer: LensPointer | null
	stats: LensStatistics
	syncOverlay: (map: Map) => void
};

function metersToRadiusPx(
	map: Map,
	lng: number,
	lat: number,
	radiusMeters: number,
): number {
	const center = map.project([lng, lat]);
	const earth = 6378137;
	const dLat = (radiusMeters / earth) * (180 / Math.PI);
	const edge = map.project([lng, lat + dLat]);
	const px = Math.hypot(edge.x - center.x, edge.y - center.y);
	return Number.isFinite(px) ? px : 0;
}

function projectPointer(
	map: Map,
	lng: number,
	lat: number,
	radiusMeters: number,
): LensPointer {
	const point = map.project([lng, lat]);
	return {
		lng,
		lat,
		x: point.x,
		y: point.y,
		radiusPx: metersToRadiusPx(map, lng, lat, radiusMeters),
	};
}

export function useAnalysisLens({
	mapRef,
	layers,
	lens,
	isMobile,
}: {
	mapRef: { current: Map | null }
	layers: Layer[]
	lens: AnalysisLensState | undefined
	isMobile: boolean
}): AnalysisLensView {
	const active = !!lens?.active;
	const radiusMeters = lens?.radiusMeters ?? 250;
	const [center, setCenter] = useState<{ lng: number; lat: number } | null>(
		null,
	);
	const [pointer, setPointer] = useState<LensPointer | null>(null);
	const overlayRef = useRef<{
		circle: LensCircle | null
		features: GeoJSON.Feature[]
	}>({ circle: null, features: [] });

	const layer = layers.find((item) => item.id === lens?.layerId);
	const field = useMemo(() => {
		if (!layer || !lens?.field) return undefined;
		return getLayerFields(layer).find((item) => item.name === lens.field);
	}, [layer, lens?.field]);

	const circle = useMemo(() => {
		if (!active || !center) return null;
		return createLensGeometry([center.lng, center.lat], radiusMeters);
	}, [active, center, radiusMeters]);

	const features = useMemo(
		() => getFeaturesInLens(layer?.data, circle),
		[layer?.data, circle],
	);

	const stats = useMemo(
		() => getLensStatistics(features, field),
		[features, field],
	);

	overlayRef.current = { circle, features };

	const syncOverlay = (map: Map) => {
		if (!active || !overlayRef.current.circle) {
			clearAnalysisLensOverlay(map);
			return;
		}
		syncAnalysisLensOverlay(
			map,
			overlayRef.current.circle,
			overlayRef.current.features,
		);
	};

	useEffect(() => {
		if (!active) {
			setCenter(null);
			setPointer(null);
		}
	}, [active]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		if (!active || !circle) {
			clearAnalysisLensOverlay(map);
			return;
		}
		syncAnalysisLensOverlay(map, circle, features);
	}, [active, circle, features, mapRef]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map || !active || !center) {
			setPointer(null);
			return;
		}
		const update = () => {
			setPointer(projectPointer(map, center.lng, center.lat, radiusMeters));
		};
		update();
		map.on("move", update);
		return () => {
			map.off("move", update);
		};
	}, [active, center, mapRef, radiusMeters]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map || !active) return;

		const applyLngLat = (lng: number, lat: number, showPointer: boolean) => {
			setCenter({ lng, lat });
			if (showPointer) {
				setPointer(projectPointer(map, lng, lat, radiusMeters));
			}
		};

		const scheduler = createLensMoveScheduler<{ lng: number; lat: number }>(
			(value) => applyLngLat(value.lng, value.lat, true),
		);

		const applyCursor = () => {
			try {
				map.getCanvas().style.cursor = "crosshair";
				map.getCanvasContainer().style.cursor = "crosshair";
			} catch {
				/* canvas may be gone */
			}
		};
		applyCursor();

		const onMove = (event: MapMouseEvent) => {
			if (isMobile) return;
			applyCursor();
			scheduler.schedule({ lng: event.lngLat.lng, lat: event.lngLat.lat });
		};
		const onLeave = () => {
			if (isMobile) return;
			scheduler.cancel();
			setCenter(null);
			setPointer(null);
			clearAnalysisLensOverlay(map);
		};
		const onClick = (event: MapMouseEvent) => {
			if (!isMobile) {
				// Futuro: click podría fijar la selección estadística.
				return;
			}
			applyLngLat(event.lngLat.lng, event.lngLat.lat, true);
		};

		const canvas = map.getCanvas();
		const onCanvasEnter = (event: MouseEvent) => {
			if (isMobile) return;
			applyCursor();
			const rect = canvas.getBoundingClientRect();
			const lngLat = map.unproject([
				event.clientX - rect.left,
				event.clientY - rect.top,
			]);
			scheduler.schedule({ lng: lngLat.lng, lat: lngLat.lat });
		};

		map.on("mousemove", onMove);
		map.on("click", onClick);
		canvas.addEventListener("mouseenter", onCanvasEnter);
		canvas.addEventListener("mouseleave", onLeave);
		return () => {
			scheduler.cancel();
			map.off("mousemove", onMove);
			map.off("click", onClick);
			canvas.removeEventListener("mouseenter", onCanvasEnter);
			canvas.removeEventListener("mouseleave", onLeave);
			restoreMapCursor(map);
		};
	}, [active, isMobile, mapRef, radiusMeters]);

	return {
		pointer: active ? pointer : null,
		stats,
		syncOverlay,
	};
}
