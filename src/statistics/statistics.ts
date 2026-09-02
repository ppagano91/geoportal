import type { FieldType, Layer, LayerField } from "../types/geoportal";

const VECTOR_LAYER_TYPES = new Set<Layer["type"]>([
	"editable",
	"drawing",
	"wfs",
	"user",
]);

const INTERNAL_PROPERTY_KEYS = new Set([
	"__id",
	"__selected",
	"__internal",
	"geometry",
	"type",
	"properties",
	"mode",
	"selected",
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/;

export type AnalyzableField = {
	name: string;
	type: FieldType;
	source: "schema" | "inferred";
};

export type GeneralFieldStats = {
	featureCount: number;
	withData: number;
	withoutData: number;
	uniqueCount: number;
};

export type NumericStats = {
	count: number;
	min: number;
	max: number;
	mean: number;
	median: number;
	sum: number;
};

export type HistogramBin = {
	start: number;
	end: number;
	count: number;
	label: string;
};

export type CategoryBucket = {
	value: string;
	count: number;
	percentage: number;
};

export type CategoricalStats = {
	buckets: CategoryBucket[];
	truncated: boolean;
	otherCount: number;
};

export type DateStats = {
	count: number;
	min: string;
	max: string;
};

export function isStatisticsSourceLayer(layer: Layer): boolean {
	if (!VECTOR_LAYER_TYPES.has(layer.type)) return false;
	return layer.data?.type === "FeatureCollection";
}

export function isMissingValue(value: unknown): boolean {
	return value === null || value === undefined || value === "";
}

export function isInternalPropertyKey(key: string): boolean {
	const name = key.trim();
	if (name === "") return true;
	if (name.startsWith("__")) return true;
	return INTERNAL_PROPERTY_KEYS.has(name.toLowerCase());
}

export function getLayerFields(layer: Layer): AnalyzableField[] {
	const features = layer.data?.features ?? [];
	if (layer.fields && layer.fields.length > 0) {
		return layer.fields
			.filter((field) => !isInternalPropertyKey(field.name))
			.map((field) => ({
				name: field.name,
				type: field.type,
				source: "schema" as const,
			}));
	}
	return inferFieldsFromProperties(features);
}

function inferFieldsFromProperties(
	features: GeoJSON.Feature[],
): AnalyzableField[] {
	const order: string[] = [];
	const valuesByName = new Map<string, unknown[]>();

	for (const feature of features) {
		const properties = feature.properties;
		if (!properties || typeof properties !== "object") continue;
		for (const [rawName, value] of Object.entries(properties)) {
			if (isInternalPropertyKey(rawName)) continue;
			let bucket = valuesByName.get(rawName);
			if (!bucket) {
				bucket = [];
				valuesByName.set(rawName, bucket);
				order.push(rawName);
			}
			bucket.push(value);
		}
	}

	return order.map((name) => ({
		name,
		type: detectFieldType(undefined, valuesByName.get(name) ?? []),
		source: "inferred",
	}));
}

export function detectFieldType(
	field: Pick<LayerField, "type"> | undefined,
	values: unknown[],
): FieldType {
	if (field?.type) return field.type;

	const present = values.filter((value) => !isMissingValue(value));
	if (present.length === 0) return "string";

	const types = new Set<FieldType>();
	for (const value of present) {
		types.add(classifyValue(value));
	}
	if (types.size === 1) return [...types][0];
	return "string";
}

function classifyValue(value: unknown): FieldType {
	if (typeof value === "boolean") return "boolean";
	if (typeof value === "number" && Number.isFinite(value)) return "number";
	if (typeof value === "string" && DATE_RE.test(value.trim())) return "date";
	return "string";
}

export function collectFieldValues(
	features: GeoJSON.Feature[],
	fieldName: string,
): unknown[] {
	return features.map((feature) => feature.properties?.[fieldName]);
}

export function calculateGeneralFieldStats(values: unknown[]): GeneralFieldStats {
	const featureCount = values.length;
	let withData = 0;
	const unique = new Set<string>();
	for (const value of values) {
		if (isMissingValue(value)) continue;
		if (typeof value === "number" && Number.isNaN(value)) continue;
		withData += 1;
		unique.add(uniqueKey(value));
	}
	return {
		featureCount,
		withData,
		withoutData: featureCount - withData,
		uniqueCount: unique.size,
	};
}

function uniqueKey(value: unknown): string {
	if (typeof value === "number") return `n:${value}`;
	if (typeof value === "boolean") return `b:${value}`;
	return `s:${String(value)}`;
}

export function finiteNumbers(values: unknown[]): number[] {
	const numbers: number[] = [];
	for (const value of values) {
		if (typeof value === "number" && Number.isFinite(value)) {
			numbers.push(value);
		}
	}
	return numbers;
}

export function calculateNumericStats(values: unknown[]): NumericStats | null {
	const numbers = finiteNumbers(values);
	if (numbers.length === 0) return null;
	const sorted = [...numbers].sort((a, b) => a - b);
	const sum = sorted.reduce((total, value) => total + value, 0);
	return {
		count: sorted.length,
		min: sorted[0],
		max: sorted[sorted.length - 1],
		mean: sum / sorted.length,
		median: medianOfSorted(sorted),
		sum,
	};
}

export function medianOfSorted(sorted: number[]): number {
	const n = sorted.length;
	if (n === 0) return NaN;
	const mid = Math.floor(n / 2);
	if (n % 2 === 1) return sorted[mid];
	return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function histogramBinCount(sampleSize: number): number {
	if (sampleSize <= 1) return 1;
	if (sampleSize <= 4) return Math.min(sampleSize, 4);
	const sturges = Math.ceil(Math.log2(sampleSize) + 1);
	return Math.min(12, Math.max(5, sturges));
}

function niceNumber(range: number, round: boolean): number {
	if (!Number.isFinite(range) || range <= 0) return 1;
	const exponent = Math.floor(Math.log10(range));
	const fraction = range / 10 ** exponent;
	let nice: number;
	if (round) {
		if (fraction < 1.5) nice = 1;
		else if (fraction < 3) nice = 2;
		else if (fraction < 7) nice = 5;
		else nice = 10;
	} else {
		if (fraction <= 1) nice = 1;
		else if (fraction <= 2) nice = 2;
		else if (fraction <= 5) nice = 5;
		else nice = 10;
	}
	return nice * 10 ** exponent;
}

function formatBinEdge(value: number): string {
	const abs = Math.abs(value);
	const digits = abs >= 1000 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
	return new Intl.NumberFormat("es-AR", {
		maximumFractionDigits: digits,
		minimumFractionDigits: 0,
	}).format(value);
}

export function calculateHistogram(values: unknown[]): HistogramBin[] {
	const numbers = finiteNumbers(values);
	if (numbers.length === 0) return [];

	const min = Math.min(...numbers);
	const max = Math.max(...numbers);
	if (min === max) {
		return [
			{
				start: min,
				end: max,
				count: numbers.length,
				label: formatBinEdge(min),
			},
		];
	}

	let binCount = histogramBinCount(numbers.length);
	let width = niceNumber((max - min) / binCount, true);
	if (width <= 0) width = max - min;

	let start = Math.floor(min / width) * width;
	let end = Math.ceil(max / width) * width;
	if (end <= start) end = start + width;
	binCount = Math.round((end - start) / width);
	if (binCount > 12) {
		width = niceNumber((max - min) / 12, true);
		start = Math.floor(min / width) * width;
		end = Math.ceil(max / width) * width;
		binCount = Math.max(1, Math.round((end - start) / width));
	}
	if (numbers.length <= 4 && binCount > numbers.length) {
		binCount = numbers.length;
		width = (end - start) / binCount;
	}
	binCount = Math.max(1, Math.min(12, binCount));

	const bins: HistogramBin[] = Array.from({ length: binCount }, (_, index) => {
		const binStart = start + index * width;
		const binEnd = index === binCount - 1 ? end : start + (index + 1) * width;
		return {
			start: binStart,
			end: binEnd,
			count: 0,
			label: `${formatBinEdge(binStart)}–${formatBinEdge(binEnd)}`,
		};
	});

	for (const value of numbers) {
		let index = Math.floor((value - start) / width);
		if (index < 0) index = 0;
		if (index >= binCount) index = binCount - 1;
		bins[index].count += 1;
	}
	return bins;
}

export function formatCategoryValue(value: unknown): string {
	if (typeof value === "boolean") return value ? "Sí" : "No";
	return String(value);
}

export function calculateCategoricalStats(
	values: unknown[],
	topN = 10,
): CategoricalStats {
	const counts = new Map<string, number>();
	let total = 0;
	for (const value of values) {
		if (isMissingValue(value)) continue;
		const key = formatCategoryValue(value);
		counts.set(key, (counts.get(key) ?? 0) + 1);
		total += 1;
	}

	const ranked = [...counts.entries()].sort((a, b) => {
		if (b[1] !== a[1]) return b[1] - a[1];
		return a[0].localeCompare(b[0], "es");
	});

	if (ranked.length <= topN) {
		return {
			buckets: ranked.map(([value, count]) => ({
				value,
				count,
				percentage: total === 0 ? 0 : (count / total) * 100,
			})),
			truncated: false,
			otherCount: 0,
		};
	}

	const head = ranked.slice(0, topN);
	const otherCount = ranked.slice(topN).reduce((sum, [, count]) => sum + count, 0);
	return {
		buckets: [
			...head.map(([value, count]) => ({
				value,
				count,
				percentage: (count / total) * 100,
			})),
			{
				value: "Otros",
				count: otherCount,
				percentage: (otherCount / total) * 100,
			},
		],
		truncated: true,
		otherCount,
	};
}

function parseDateValue(value: unknown): number | null {
	if (value instanceof Date && Number.isFinite(value.getTime())) {
		return value.getTime();
	}
	if (typeof value !== "string") return null;
	const text = value.trim();
	if (!DATE_RE.test(text)) return null;
	const time = Date.parse(text.length === 10 ? `${text}T00:00:00` : text);
	return Number.isFinite(time) ? time : null;
}

export function calculateDateStats(values: unknown[]): DateStats | null {
	const times: number[] = [];
	for (const value of values) {
		const time = parseDateValue(value);
		if (time != null) times.push(time);
	}
	if (times.length === 0) return null;
	const min = Math.min(...times);
	const max = Math.max(...times);
	return {
		count: times.length,
		min: formatDateIso(min),
		max: formatDateIso(max),
	};
}

function formatDateIso(time: number): string {
	const date = new Date(time);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function formatStatNumber(value: number, fractionDigits = 1): string {
	if (!Number.isFinite(value)) return "—";
	const abs = Math.abs(value);
	const digits =
		Number.isInteger(value) ? 0 : abs >= 1000 ? Math.min(fractionDigits, 1) : fractionDigits;
	return new Intl.NumberFormat("es-AR", {
		maximumFractionDigits: digits,
		minimumFractionDigits: 0,
	}).format(value);
}

export function formatPercentage(value: number): string {
	return `${new Intl.NumberFormat("es-AR", {
		maximumFractionDigits: 1,
		minimumFractionDigits: 1,
	}).format(value)}%`;
}

export function formatDateDisplay(value: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return value;
	return `${match[3]}/${match[2]}/${match[1]}`;
}
