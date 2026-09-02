import React from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { CategoryBucket, HistogramBin } from "../../statistics/statistics";
import { formatPercentage, formatStatNumber } from "../../statistics/statistics";
import {
	categorySelectionKey,
	histogramSelectionKey,
} from "../../statistics/selection";
import { useResponsive } from "../../hooks/useResponsive";

const AXIS = "hsl(var(--muted-foreground))";
const GRID = "hsl(var(--border))";
const BAR = "hsl(var(--primary))";
const BAR_ACTIVE = "hsl(var(--foreground))";
const TOOLTIP_STYLE: React.CSSProperties = {
	backgroundColor: "hsl(var(--popover))",
	border: "1px solid hsl(var(--border))",
	borderRadius: 8,
	color: "hsl(var(--popover-foreground))",
	fontSize: 12,
};

function chartDatum<T extends object>(data: unknown): T | undefined {
	if (!data || typeof data !== "object") return undefined;
	const record = data as { payload?: unknown };
	if (record.payload && typeof record.payload === "object") {
		return record.payload as T;
	}
	return data as T;
}

type HistogramChartProps = {
	bins: HistogramBin[];
	activeKey?: string;
	onSelect?: (bin: HistogramBin) => void;
};

export function HistogramChart({
	bins,
	activeKey,
	onSelect,
}: HistogramChartProps): JSX.Element {
	const { isMobile } = useResponsive();
	return (
		<div className="h-52 w-full min-w-0">
			<ResponsiveContainer width="100%" height="100%">
				<BarChart data={bins} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
					<CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
					<XAxis
						dataKey="label"
						tick={{ fill: AXIS, fontSize: 10 }}
						interval={0}
						angle={-30}
						textAnchor="end"
						height={48}
					/>
					<YAxis
						allowDecimals={false}
						tick={{ fill: AXIS, fontSize: 10 }}
						width={32}
					/>
					<Tooltip
						cursor={{ fill: "hsl(var(--muted))" }}
						contentStyle={TOOLTIP_STYLE}
						formatter={(value: number | string) => [
							formatStatNumber(Number(value), 0),
							"Entidades",
						]}
						labelFormatter={(label) => `Intervalo ${String(label)}`}
					/>
					<Bar
						dataKey="count"
						radius={[4, 4, 0, 0]}
						maxBarSize={isMobile ? 44 : 36}
						cursor={onSelect ? "pointer" : undefined}
						onClick={(data) => {
							const bin = chartDatum<HistogramBin>(data);
							if (!bin || typeof bin.min !== "number" || !onSelect) return;
							onSelect(bin);
						}}
					>
						{bins.map((bin) => {
							const key = histogramSelectionKey(bin);
							const active = activeKey === key;
							return (
								<Cell
									key={key}
									fill={active ? BAR_ACTIVE : BAR}
									cursor={onSelect ? "pointer" : undefined}
									role="button"
									tabIndex={-1}
									aria-label={`Seleccionar intervalo ${bin.label}, ${formatStatNumber(bin.count, 0)} entidades`}
								/>
							);
						})}
					</Bar>
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
}

type CategoryChartProps = {
	buckets: CategoryBucket[];
	activeKey?: string;
	onSelect?: (bucket: CategoryBucket) => void;
};

export function CategoryChart({
	buckets,
	activeKey,
	onSelect,
}: CategoryChartProps): JSX.Element {
	const { isMobile } = useResponsive();
	const rowHeight = isMobile ? 44 : 32;
	const height = Math.max(180, buckets.length * rowHeight);
	return (
		<div className="w-full min-w-0" style={{ height }}>
			<ResponsiveContainer width="100%" height="100%">
				<BarChart
					data={buckets}
					layout="vertical"
					margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
				>
					<CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
					<XAxis
						type="number"
						allowDecimals={false}
						tick={{ fill: AXIS, fontSize: 10 }}
					/>
					<YAxis
						type="category"
						dataKey="value"
						width={96}
						tick={{ fill: AXIS, fontSize: 11 }}
						tickFormatter={(value: string) =>
							value.length > 14 ? `${value.slice(0, 13)}…` : value
						}
					/>
					<Tooltip
						cursor={{ fill: "hsl(var(--muted))" }}
						contentStyle={TOOLTIP_STYLE}
						formatter={(value: number | string, _name, item) => {
							const payload = item.payload as CategoryBucket | undefined;
							const count = formatStatNumber(Number(value), 0);
							const pct = payload ? formatPercentage(payload.percentage) : "";
							return [`${count} (${pct})`, "Entidades"];
						}}
					/>
					<Bar
						dataKey="count"
						radius={[0, 4, 4, 0]}
						maxBarSize={isMobile ? 32 : 22}
						cursor={onSelect ? "pointer" : undefined}
						onClick={(data) => {
							const bucket = chartDatum<CategoryBucket>(data);
							if (!bucket || !bucket.values || !onSelect) return;
							onSelect(bucket);
						}}
					>
						{buckets.map((bucket) => {
							const key = categorySelectionKey(bucket);
							const active = activeKey === key;
							return (
								<Cell
									key={key}
									fill={active ? BAR_ACTIVE : BAR}
									cursor={onSelect ? "pointer" : undefined}
									role="button"
									tabIndex={-1}
									aria-label={`Seleccionar ${bucket.value}, ${formatStatNumber(bucket.count, 0)} entidades`}
								/>
							);
						})}
					</Bar>
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
}
