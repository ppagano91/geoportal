import type { LayerStats } from '../types/geoportal'

export function computeLayerStats(fc: GeoJSON.FeatureCollection): LayerStats {
	const featureCount = fc.features.length
	const propertyKeysSet = new Set<string>()
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
	const numericRanges: Record<string, { min: number; max: number }> = {}
	const uniqueValues: Record<string, Set<string>> = {}

	function visitCoords(coords: any) {
		if (typeof coords[0] === 'number') {
			const [x, y] = coords as [number, number]
			if (Number.isFinite(x) && Number.isFinite(y)) {
				minX = Math.min(minX, x); minY = Math.min(minY, y)
				maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
			}
		} else {
			for (const c of coords) visitCoords(c)
		}
	}

	for (const f of fc.features) {
		if (f.geometry?.type && f.geometry?.coordinates) {
			visitCoords((f.geometry as any).coordinates)
		}
		const props = f.properties ?? {}
		for (const k of Object.keys(props)) {
			propertyKeysSet.add(k)
			const v = props[k]
			if (typeof v === 'number' && Number.isFinite(v)) {
				const r = numericRanges[k] ?? { min: v, max: v }
				r.min = Math.min(r.min, v); r.max = Math.max(r.max, v)
				numericRanges[k] = r
			} else if (v != null) {
				const s = uniqueValues[k] ?? new Set<string>()
				s.add(String(v))
				uniqueValues[k] = s
			}
		}
	}

	const bounds = (minX !== Infinity && minY !== Infinity && maxX !== -Infinity && maxY !== -Infinity)
		? [minX, minY, maxX, maxY] as [number, number, number, number]
		: undefined

	return {
		featureCount,
		propertyKeys: [...propertyKeysSet],
		bounds,
		numericRanges: Object.fromEntries(Object.entries(numericRanges)),
		uniqueValues: Object.fromEntries(Object.entries(uniqueValues).map(([k, v]) => [k, [...v]]))
	}
}



