import type { ExpressionSpecification } from "maplibre-gl";
import {
	CATEGORICAL_MISSING_COLOR,
	CATEGORICAL_OTHER_COLOR,
	categoricalColorAt,
} from "../styles/categoricalPalette";
import {
	calculateCategoricalStats,
	collectFieldValues,
	getLayerFields,
	OTHER_CATEGORY_LABEL,
	type AnalyzableField,
} from "../statistics/statistics";
import type {
	CategorizedStyle,
	CategoryValue,
	Layer,
	StyleCategory,
	StyleMode,
} from "../types/geoportal";

export const MISSING_CATEGORY_LABEL = "Sin dato";

export type CategorizedStyleRow =
	| { kind: "value"; index: number; label: string; color: string }
	| { kind: "other"; label: string; color: string }
	| { kind: "missing"; label: string; color: string };

export function isCategoricalSymbologyField(field: AnalyzableField): boolean {
	return (
		field.type === "string" ||
		field.type === "boolean" ||
		field.type === "number"
	);
}

export function getCategoricalSymbologyFields(layer: Layer): AnalyzableField[] {
	return getLayerFields(layer).filter(isCategoricalSymbologyField);
}

export function isCategoryValue(value: unknown): value is CategoryValue {
	if (typeof value === "boolean") return true;
	if (typeof value === "string") return true;
	return typeof value === "number" && Number.isFinite(value);
}

export function isCategorizedStyleActive(
	layer: Layer,
): layer is Layer & { styleMode: "categorized"; categorizedStyle: CategorizedStyle } {
	return (
		layer.styleMode === "categorized" &&
		layer.categorizedStyle != null &&
		layer.categorizedStyle.field.trim() !== ""
	);
}

export function buildCategorizedStyle(
	layer: Layer,
	fieldName: string,
): CategorizedStyle {
	const values = collectFieldValues(layer.data?.features ?? [], fieldName);
	const stats = calculateCategoricalStats(values);
	const categories: StyleCategory[] = [];
	let otherColor: string | undefined;

	for (const bucket of stats.buckets) {
		if (bucket.isOther) {
			otherColor = CATEGORICAL_OTHER_COLOR;
			continue;
		}
		if (!isCategoryValue(bucket.rawValue)) continue;
		categories.push({
			value: bucket.rawValue,
			label: bucket.value,
			color: categoricalColorAt(categories.length),
		});
	}

	const style: CategorizedStyle = {
		field: fieldName,
		categories,
		fallbackColor: CATEGORICAL_MISSING_COLOR,
	};
	if (otherColor) style.otherColor = otherColor;
	return style;
}

export function getCategorizedStyleRows(
	style: CategorizedStyle,
): CategorizedStyleRow[] {
	const rows: CategorizedStyleRow[] = style.categories.map((category, index) => ({
		kind: "value" as const,
		index,
		label: category.label,
		color: category.color,
	}));
	if (style.otherColor) {
		rows.push({
			kind: "other",
			label: OTHER_CATEGORY_LABEL,
			color: style.otherColor,
		});
	}
	rows.push({
		kind: "missing",
		label: MISSING_CATEGORY_LABEL,
		color: style.fallbackColor,
	});
	return rows;
}

export function categorizedColors(style: CategorizedStyle): string[] {
	const colors = new Set<string>();
	for (const category of style.categories) colors.add(category.color);
	if (style.otherColor) colors.add(style.otherColor);
	colors.add(style.fallbackColor);
	return [...colors];
}

function missingValueCondition(field: string): ExpressionSpecification {
	return [
		"any",
		["!", ["has", field]],
		["==", ["typeof", ["get", field]], "null"],
		["==", ["get", field], ""],
	] as unknown as ExpressionSpecification;
}

/**
 * Expresión data-driven: `case` (Sin dato) + `match` (valores reales).
 * El default de `match` es "Otros" (overflow), nunca el literal `"Otros"`.
 * Booleanos se comparan como `"true"`/`"false"` vía `to-string`, no como "Sí"/"No".
 */
export function categorizedPropertyExpression(
	style: CategorizedStyle,
	outputForColor: (color: string) => string = (color) => color,
): string | ExpressionSpecification {
	const missing = outputForColor(style.fallbackColor);
	const overflow = outputForColor(style.otherColor ?? style.fallbackColor);

	if (style.categories.length === 0) {
		if (!style.otherColor) return missing;
		return [
			"case",
			missingValueCondition(style.field),
			missing,
			overflow,
		] as unknown as ExpressionSpecification;
	}

	const matchExpr: unknown[] = ["match", ["to-string", ["get", style.field]]];
	for (const category of style.categories) {
		matchExpr.push(String(category.value), outputForColor(category.color));
	}
	matchExpr.push(overflow);

	return [
		"case",
		missingValueCondition(style.field),
		missing,
		matchExpr,
	] as unknown as ExpressionSpecification;
}

export function resolveLayerPaintColor(
	layer: Layer,
	simpleColor: string,
): string | ExpressionSpecification {
	if (!isCategorizedStyleActive(layer)) return simpleColor;
	return categorizedPropertyExpression(layer.categorizedStyle);
}

export function applyPersistedCategorizedStyle(
	layer: Layer,
	value: Record<string, unknown>,
): void {
	const categorizedStyle = normalizeCategorizedStyle(value.categorizedStyle);
	if (categorizedStyle) layer.categorizedStyle = categorizedStyle;
	const styleMode = normalizeStyleMode(value.styleMode);
	if (styleMode === "categorized" && categorizedStyle) {
		layer.styleMode = "categorized";
	} else if (styleMode === "simple") {
		layer.styleMode = "simple";
	}
}

export function normalizeStyleMode(value: unknown): StyleMode | undefined {
	if (value === "simple" || value === "categorized") return value;
	return undefined;
}

export function normalizeCategorizedStyle(value: unknown): CategorizedStyle | undefined {
	if (!isRecord(value)) return undefined;
	if (typeof value.field !== "string" || value.field.trim() === "") return undefined;
	if (typeof value.fallbackColor !== "string" || value.fallbackColor.trim() === "") {
		return undefined;
	}
	if (!Array.isArray(value.categories)) return undefined;

	const categories: StyleCategory[] = [];
	for (const item of value.categories) {
		const category = normalizeStyleCategory(item);
		if (!category) return undefined;
		categories.push(category);
	}

	const style: CategorizedStyle = {
		field: value.field,
		categories,
		fallbackColor: value.fallbackColor,
	};
	if (typeof value.otherColor === "string" && value.otherColor.trim() !== "") {
		style.otherColor = value.otherColor;
	}
	return style;
}

function normalizeStyleCategory(value: unknown): StyleCategory | undefined {
	if (!isRecord(value)) return undefined;
	if (!isCategoryValue(value.value)) return undefined;
	if (typeof value.label !== "string") return undefined;
	if (typeof value.color !== "string" || value.color.trim() === "") return undefined;
	return {
		value: value.value,
		label: value.label,
		color: value.color,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
