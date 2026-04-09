type UsageMetric = {
	label: string;
	used: number;
	limit: number;
	display: string;
};

function getBarColor(ratio: number) {
	if (ratio >= 1) {
		return "#ef4444";
	}
	if (ratio >= 0.8) {
		return "#f59e0b";
	}
	return "var(--sn-accent)";
}

function MetricBar({ metric }: { metric: UsageMetric }) {
	const ratio = metric.limit > 0 ? Math.min(1, metric.used / metric.limit) : 0;
	const color = getBarColor(ratio);

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-3 text-xs sm:text-sm">
				<span style={{ color: "var(--text-secondary)" }}>{metric.label}</span>
				<span className="text-right" style={{ color: "var(--text-primary)" }}>
					{metric.display}
				</span>
			</div>
			<div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: "var(--bg-hover)" }}>
				<div className="h-full rounded-full transition-[width]" style={{ width: `${ratio * 100}%`, backgroundColor: color }} />
			</div>
		</div>
	);
}

export function AIUsageWidget({ metrics }: { metrics: UsageMetric[] }) {
	return (
		<div className="rounded-[20px] border p-4 sm:rounded-[24px] sm:p-5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
			<div className="mb-4">
				<h2 className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--text-tertiary)" }}>
					AI Usage
				</h2>
			</div>

			<div className="space-y-4">
				{metrics.map((metric) => (
					<MetricBar key={metric.label} metric={metric} />
				))}
			</div>

			<p className="mt-4 text-xs" style={{ color: "var(--text-tertiary)" }}>
				Resets tomorrow
			</p>
		</div>
	);
}
