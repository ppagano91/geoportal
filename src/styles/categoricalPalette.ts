/**
 * Paleta cualitativa centralizada para simbología categorizada.
 * 10 colores distinguibles en mapas claros y oscuros. Sin librería externa.
 */
export const CATEGORICAL_PALETTE = [
	"#2563eb",
	"#ea580c",
	"#16a34a",
	"#dc2626",
	"#7c3aed",
	"#ca8a04",
	"#0891b2",
	"#db2777",
	"#4d7c0f",
	"#d97706",
] as const;

export const CATEGORICAL_PALETTE_SIZE = CATEGORICAL_PALETTE.length;

/** Features sin dato (`null` / `undefined` / `""`). */
export const CATEGORICAL_MISSING_COLOR = "#94a3b8";

export function categoricalColorAt(index: number): string {
	return CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE_SIZE];
}
