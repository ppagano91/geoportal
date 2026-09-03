import React, { useLayoutEffect, useRef, useState } from "react";
import {
	formatDateDisplay,
	formatPercentage,
	formatStatNumber,
} from "../../statistics/statistics";
import {
	areaUnitForTotal,
	formatAreaM2,
	formatLengthM,
	lengthUnitForTotal,
} from "../../statistics/geometryStatistics";
import { cn } from "../../utils/cn";
import {
	formatLensRadius,
	mapUiSurfaceProps,
	type LensStatistics,
} from "../../analysis/lens";

export type AnalysisLensHudModel = {
	x: number
	y: number
	radiusPx: number
	radiusMeters: number
	stats: LensStatistics
};

function HudRow({
	label,
	value,
}: {
	label: string
	value: string
}): JSX.Element {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<span className="text-muted-foreground">{label}</span>
			<span className="min-w-0 text-right font-medium tabular-nums">{value}</span>
		</div>
	);
}

function GeometrySummary({ stats }: { stats: LensStatistics }): JSX.Element | null {
	const geometry = stats.geometry;
	if (!geometry || geometry.family === "none") return null;
	if (geometry.family === "Polygon") {
		const unit = areaUnitForTotal(geometry.area.total);
		return (
			<>
				<HudRow label="Área total" value={formatAreaM2(geometry.area.total, unit)} />
				<HudRow
					label="Área promedio"
					value={formatAreaM2(geometry.area.mean, unit)}
				/>
			</>
		);
	}
	if (geometry.family === "Line") {
		const unit = lengthUnitForTotal(geometry.length.total);
		return (
			<HudRow
				label="Longitud total"
				value={formatLengthM(geometry.length.total, unit)}
			/>
		);
	}
	if (geometry.family === "Point") return null;
	return (
		<>
			{geometry.polygon ? (
				<HudRow
					label="Área total"
					value={formatAreaM2(
						geometry.polygon.area.total,
						areaUnitForTotal(geometry.polygon.area.total),
					)}
				/>
			) : null}
			{geometry.line ? (
				<HudRow
					label="Longitud total"
					value={formatLengthM(
						geometry.line.length.total,
						lengthUnitForTotal(geometry.line.length.total),
					)}
				/>
			) : null}
		</>
	);
}

function FieldSummary({ stats }: { stats: LensStatistics }): JSX.Element | null {
	const field = stats.field;
	if (!field) return null;
	if (field.type === "number") {
		return (
			<>
				<div className="truncate font-medium">{field.name}</div>
				<HudRow label="Promedio" value={formatStatNumber(field.stats.mean)} />
				<HudRow label="Mediana" value={formatStatNumber(field.stats.median)} />
				<HudRow label="Mín" value={formatStatNumber(field.stats.min)} />
				<HudRow label="Máx" value={formatStatNumber(field.stats.max)} />
			</>
		);
	}
	if (field.type === "date") {
		return (
			<>
				<div className="truncate font-medium">{field.name}</div>
				<HudRow label="Desde" value={formatDateDisplay(field.stats.min)} />
				<HudRow label="Hasta" value={formatDateDisplay(field.stats.max)} />
			</>
		);
	}
	if (field.type === "boolean") {
		return (
			<>
				<div className="truncate font-medium">{field.name}</div>
				{field.buckets.map((bucket) => (
					<HudRow
						key={bucket.value}
						label={bucket.value}
						value={`${formatStatNumber(bucket.count, 0)} · ${formatPercentage(bucket.percentage)}`}
					/>
				))}
			</>
		);
	}
	const [top, ...rest] = field.buckets;
	return (
		<>
			<div className="truncate font-medium">{field.name}</div>
			{top ? (
				<div className="font-medium tabular-nums">
					{top.value} · {formatPercentage(top.percentage)}
				</div>
			) : null}
			{rest.map((bucket) => (
				<HudRow
					key={bucket.value}
					label={bucket.value}
					value={formatPercentage(bucket.percentage)}
				/>
			))}
		</>
	);
}

export function AnalysisLensHud({
	x,
	y,
	radiusPx,
	radiusMeters,
	stats,
	container,
}: AnalysisLensHudModel & { container: HTMLElement }): JSX.Element {
	const ref = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState({ left: x, top: y });

	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		const mw = el.offsetWidth;
		const mh = el.offsetHeight;
		const pw = container.clientWidth;
		const ph = container.clientHeight;
		const gap = 8;
		const offset = Math.max(12, radiusPx * 0.25);
		let left = x + offset;
		let top = y - mh - gap;
		if (left + mw > pw - gap) left = x - mw - offset;
		if (left < gap) left = Math.max(gap, Math.min(x + offset, pw - mw - gap));
		if (top < gap) top = y + offset;
		if (top + mh > ph - gap) top = Math.max(gap, ph - mh - gap);
		left = Math.max(gap, Math.min(left, pw - mw - gap));
		top = Math.max(gap, Math.min(top, ph - mh - gap));
		setPos({ left, top });
	}, [container, radiusPx, x, y, stats]);

	return (
		<div
			ref={ref}
			role="status"
			aria-live="polite"
			aria-label="Lente de análisis"
			className={cn(
				"surface pointer-events-none absolute z-map-controls max-w-[16rem] rounded-md border px-2.5 py-2 text-xs shadow-md",
			)}
			style={{ left: pos.left, top: pos.top }}
			{...mapUiSurfaceProps}
		>
			<div className="grid gap-1">
				<div className="font-semibold">
					Lente · {formatLensRadius(radiusMeters)}
				</div>
				<div className="tabular-nums text-muted-foreground">
					{formatStatNumber(stats.featureCount, 0)}{" "}
					{stats.featureCount === 1 ? "entidad" : "entidades"}
				</div>
				{stats.featureCount > 0 ? (
					<div className="mt-1 grid gap-0.5">
						<FieldSummary stats={stats} />
						{stats.field ? null : <GeometrySummary stats={stats} />}
					</div>
				) : null}
			</div>
		</div>
	);
}
