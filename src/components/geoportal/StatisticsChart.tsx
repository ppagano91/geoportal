import React from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { CategoryBucket, HistogramBin } from "../../statistics/statistics";
import { formatPercentage, formatStatNumber } from "../../statistics/statistics";

const AXIS = "hsl(var(--muted-foreground))";
const GRID = "hsl(var(--border))";
const BAR = "hsl(var(--primary))";
const TOOLTIP_STYLE: React.CSSProperties = {
	backgroundColor: "hsl(var(--popover))",
	border: "1px solid hsl(var(--border))",
	borderRadius: 8,
	color: "hsl(var(--popover-foreground))",
	fontSize: 12,
};

export function HistogramChart({ bins }: { bins: HistogramBin[] }): JSX.Element {
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
					<Bar dataKey="count" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={36} />
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
}

export function CategoryChart({
	buckets,
}: {
	buckets: CategoryBucket[];
}): JSX.Element {
	const height = Math.max(180, buckets.length * 32);
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
					<Bar dataKey="count" fill={BAR} radius={[0, 4, 4, 0]} maxBarSize={22} />
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
}
