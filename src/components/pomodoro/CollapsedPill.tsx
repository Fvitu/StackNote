"use client";

import { Pause, Play } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface CollapsedPillProps {
	remainingLabel: string;
	progress: number;
	accentColor: string;
	isRunning: boolean;
	compact?: boolean;
	onExpand: () => void;
	onToggle: () => void;
}

export function CollapsedPill({ remainingLabel, progress, accentColor, isRunning, compact = false, onExpand, onToggle }: CollapsedPillProps) {
	const radius = 12;
	const circumference = 2 * Math.PI * radius;
	const dashOffset = circumference * (1 - progress);

	const handleExpandKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			onExpand();
		}
	};

	return (
		<div
			role="button"
			tabIndex={0}
			onClick={onExpand}
			onKeyDown={handleExpandKeyDown}
			className={`flex h-11 items-center rounded-full border text-sm shadow-[0_12px_30px_rgba(0,0,0,0.35)] transition-transform duration-200 hover:-translate-y-0.5 ${compact ? "w-11 justify-center px-0" : "w-[140px] gap-3 px-3"}`}
			aria-label={compact ? `Expand Pomodoro timer, ${remainingLabel} remaining` : "Expand Pomodoro timer"}
			style={{
				backgroundColor: "rgba(10, 10, 10, 0.92)",
				backdropFilter: "blur(8px)",
				borderColor: "rgba(124, 106, 255, 0.3)",
			}}>
			<svg width={compact ? "32" : "28"} height={compact ? "32" : "28"} viewBox="0 0 32 32" aria-hidden="true">
				<circle cx="16" cy="16" r={radius} fill="none" stroke="rgba(124,106,255,0.16)" strokeWidth="3" />
				<circle
					cx="16"
					cy="16"
					r={radius}
					fill="none"
					stroke={accentColor}
					strokeWidth="3"
					strokeLinecap="round"
					strokeDasharray={circumference}
					strokeDashoffset={dashOffset}
					transform="rotate(-90 16 16)"
				/>
			</svg>
			{!compact && (
				<>
					<span className="flex-1 text-left font-medium" style={{ color: "var(--text-primary)" }}>
						{remainingLabel}
					</span>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={(event) => {
									event.stopPropagation();
									onToggle();
								}}
								className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-[rgba(255,255,255,0.08)]"
								aria-label={isRunning ? "Pause timer" : "Start timer"}>
								{isRunning ? (
									<Pause className="h-3.5 w-3.5" style={{ color: "var(--text-primary)" }} />
								) : (
									<Play className="h-3.5 w-3.5" style={{ color: "var(--text-primary)" }} />
								)}
							</button>
						</TooltipTrigger>
						<TooltipContent>{isRunning ? "Pause timer" : "Start timer"}</TooltipContent>
					</Tooltip>
				</>
			)}
		</div>
	);
}
