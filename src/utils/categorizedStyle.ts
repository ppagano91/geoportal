import type { ExpressionSpecification } from "maplibre-gl";
import { CATEGORICAL_MISSING_COLOR, categoricalColorAt } from "../styles/categoricalPalette";
import {
	collectFieldValues,
	formatCategoryValue,
	getLayerFields,
	isMissingValue,
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

/** Umbral de advertencia para campos numéricos de alta cardinalidad. No bloquea. */
export const HIGH_CARDINALITY_WARNING_THRESHOLD = 20;

export type CategorizedStyleRow =
	| { kind: "value"; index: number; label: string; color: string }
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

export function shouldWarnHighCardinality(
	field: AnalyzableField | undefined,
	uniqueCount: number,
): boolean {
	return field?.type === "number" && uniqueCount > HIGH_CARDINALITY_WARNING_THRESHOLD;
}

function categoryIdentityKey(value: CategoryValue): string {
	if (typeof value === "boolean") return `b:${value}`;
	if (typeof value === "number") return `n:${value}`;
	return `s:${value}`;
}

function categoryTypeOrder(value: CategoryValue): number {
	if (typeof value === "boolean") return 0;
	if (typeof value === "number") return 1;
	return 2;
}

function compareCategoryValues(a: CategoryValue, b: CategoryValue): number {
	if (typeof a === "boolean" && typeof b === "boolean") {
		return Number(a) - Number(b);
	}
	if (typeof a === "number" && typeof b === "number") {
		return a - b;
	}
	if (typeof a === "string" && typeof b === "string") {
		return a.localeCompare(b, "es");
	}
	return categoryTypeOrder(a) - categoryTypeOrder(b);
}

/**
 * Valores únicos reales del campo, sin Top-N ni "Otros".
 * Excluye null / undefined / "" ("Sin dato").
 */
export function getUniqueCategoryValues(values: unknown[]): CategoryValue[] {
	const seen = new Set<string>();
	const unique: CategoryValue[] = [];
	for (const value of values) {
		if (isMissingValue(value)) continue;
		if (!isCategoryValue(value)) continue;
		const key = categoryIdentityKey(value);
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(value);
	}
	unique.sort(compareCategoryValues);
	return unique;
}

export function buildCategorizedStyle(
	layer: Layer,
	fieldName: string,
): CategorizedStyle {
	const values = collectFieldValues(layer.data?.features ?? [], fieldName);
	const unique = getUniqueCategoryValues(values);
	return {
		field: fieldName,
		categories: unique.map((value, index) => ({
			value,
			label: formatCategoryValue(value),
			color: categoricalColorAt(index),
		})),
		fallbackColor: CATEGORICAL_MISSING_COLOR,
	};
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

type MatchKind = "number" | "string" | "to-string";

function categoryMatchKind(style: CategorizedStyle): MatchKind {
	if (style.categories.length === 0) return "to-string";
	const kinds = new Set(style.categories.map((category) => typeof category.value));
	if (kinds.size === 1 && kinds.has("number")) return "number";
	if (kinds.size === 1 && kinds.has("string")) return "string";
	return "to-string";
}

function categoryMatchInput(field: string, kind: MatchKind): unknown {
	if (kind === "to-string") return ["to-string", ["get", field]];
	return ["get", field];
}

function categoryMatchLabel(value: CategoryValue, kind: MatchKind): string | number {
	if (kind === "number" && typeof value === "number") return value;
	return String(value);
}

/**
 * Expresión data-driven: `case` (Sin dato) + `match` (todas las categorías reales).
 * Sin agrupación "Otros": el default de `match` es fallbackColor.
 * Booleanos se comparan como `"true"`/`"false"`, no como "Sí"/"No".
 * Números se comparan como número cuando todas las categorías son numéricas.
 */
export function categorizedPropertyExpression(
	style: CategorizedStyle,
	outputForColor: (color: string) => string = (color) => color,
): string | ExpressionSpecification {
	const missing = outputForColor(style.fallbackColor);

	if (style.categories.length === 0) return missing;

	const kind = categoryMatchKind(style);
	const matchExpr: unknown[] = ["match", categoryMatchInput(style.field, kind)];
	for (const category of style.categories) {
		matchExpr.push(categoryMatchLabel(category.value, kind), outputForColor(category.color));
	}
	matchExpr.push(missing);

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
