interface ProgressBarProps {
	used: number;
	limit: number;
}

export function ProgressBar({ used, limit }: ProgressBarProps) {
	const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
	const width = `${ratio * 100}%`;
	const isNearLimit = ratio > 0.8;
	const fillBackground = isNearLimit ? "linear-gradient(90deg, #f59e0b 0%, #ef4444 100%)" : "linear-gradient(90deg, #7c6aff 0%, #a78bfa 100%)";
	const glowColor = isNearLimit ? "rgba(245, 158, 11, 0.55)" : "rgba(124, 106, 255, 0.6)";

	return (
		<div className="relative h-1.5 overflow-hidden rounded-full bg-[#1e1e1e]">
			<div
				className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300"
				style={{
					width,
					background: fillBackground,
				}}>
				<span
					className="absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full opacity-90 blur-[6px]"
					style={{
						backgroundColor: isNearLimit ? "#f59e0b" : "#7c6aff",
						boxShadow: `2px 0 8px ${glowColor}`,
					}}
				/>
			</div>
		</div>
	);
}
