import {
	formatCategoryValue,
	isMissingValue,
	valueInHistogramBin,
	type CategoryBucket,
	type HistogramBin,
} from "./statistics";

export type FeatureId = string | number;

/**
 * Identidad estable de una feature, sin mutar el modelo.
 * 1. feature.id
 * 2. properties.id (ya usado al resolver hits de MapLibre)
 * 3. undefined — no se usa el índice del array
 */
export function getFeatureId(feature: GeoJSON.Feature): FeatureId | undefined {
	if (typeof feature.id === "string" || typeof feature.id === "number") {
		if (typeof feature.id === "string" && feature.id.trim() === "") {
			return undefined;
		}
		return feature.id;
	}
	const fromProps = feature.properties?.id;
	if (typeof fromProps === "string" || typeof fromProps === "number") {
		if (typeof fromProps === "string" && fromProps.trim() === "") {
			return undefined;
		}
		return fromProps;
	}
	return undefined;
}

export function featureIdKey(id: FeatureId): string {
	return String(id);
}

export function toFeatureIdSet(
	ids: ReadonlyArray<FeatureId> | undefined,
): Set<string> {
	const set = new Set<string>();
	if (!ids) return set;
	for (const id of ids) set.add(featureIdKey(id));
	return set;
}

export function getSelectedFeatures(
	features: GeoJSON.Feature[],
	selectedIds: ReadonlySet<string>,
): GeoJSON.Feature[] {
	if (selectedIds.size === 0) return [];
	const selected: GeoJSON.Feature[] = [];
	for (const feature of features) {
		const id = getFeatureId(feature);
		if (id == null) continue;
		if (!selectedIds.has(featureIdKey(id))) continue;
		selected.push(feature);
	}
	return selected;
}

export function categorySelectionKey(bucket: CategoryBucket): string {
	return bucket.isOther ? "cat:__other__" : `cat:${bucket.value}`;
}

export function histogramSelectionKey(bin: HistogramBin): string {
	return `bin:${bin.min}:${bin.max}:${bin.isLast ? 1 : 0}`;
}

function collectFeatureIds(
	features: GeoJSON.Feature[],
	matches: (feature: GeoJSON.Feature) => boolean,
): FeatureId[] {
	const ids: FeatureId[] = [];
	for (const feature of features) {
		if (!matches(feature)) continue;
		const id = getFeatureId(feature);
		if (id == null) continue;
		ids.push(id);
	}
	return ids;
}

export function getFeatureIdsForCategory(
	features: GeoJSON.Feature[],
	fieldName: string,
	bucket: CategoryBucket,
): FeatureId[] {
	const wanted = new Set(bucket.values);
	if (wanted.size === 0) return [];
	return collectFeatureIds(features, (feature) => {
		const raw = feature.properties?.[fieldName];
		if (isMissingValue(raw)) return false;
		return wanted.has(formatCategoryValue(raw));
	});
}

export function getFeatureIdsForHistogramBin(
	features: GeoJSON.Feature[],
	fieldName: string,
	bin: HistogramBin,
): FeatureId[] {
	return collectFeatureIds(features, (feature) => {
		const raw = feature.properties?.[fieldName];
		return typeof raw === "number" && valueInHistogramBin(raw, bin);
	});
}
