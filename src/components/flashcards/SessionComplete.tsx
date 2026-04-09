"use client";

import { Button } from "@/components/ui/button";

interface SessionCompleteProps {
	title: string;
	totalCards: number;
	correctCards: number;
	totalTime: number;
	averageIntervalDays: number;
	onStudyAgain: () => void;
	onBack: () => void;
}

function formatDuration(totalSeconds: number) {
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function SessionComplete({ title, totalCards, correctCards, totalTime, averageIntervalDays, onStudyAgain, onBack }: SessionCompleteProps) {
	const accuracy = totalCards > 0 ? Math.round((correctCards / totalCards) * 100) : 0;

	return (
		<div
			className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center rounded-[28px] border px-5 py-8 text-center shadow-[0_30px_90px_rgba(0,0,0,0.4)] sm:px-8 sm:py-12"
			style={{ backgroundColor: "var(--bg-sidebar)", borderColor: "var(--border-default)" }}>
			<p className="text-sm uppercase tracking-[0.28em]" style={{ color: "var(--text-tertiary)" }}>
				Session Complete
			</p>
			<h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--text-primary)" }}>
				{title}
			</h2>
			<p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
				{correctCards} / {totalCards} rated Good or Easy
			</p>

			<div className="mt-6 grid w-full gap-4 md:grid-cols-3 sm:mt-8">
				<div className="rounded-2xl border p-4 sm:p-5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
					<p className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--text-tertiary)" }}>
						Accuracy
					</p>
					<p className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ color: "var(--text-primary)" }}>
						{accuracy}%
					</p>
				</div>
				<div className="rounded-2xl border p-4 sm:p-5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
					<p className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--text-tertiary)" }}>
						Time
					</p>
					<p className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ color: "var(--text-primary)" }}>
						{formatDuration(totalTime)}
					</p>
				</div>
				<div className="rounded-2xl border p-4 sm:p-5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
					<p className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--text-tertiary)" }}>
						Forecast
					</p>
					<p className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ color: "var(--text-primary)" }}>
						{averageIntervalDays}d
					</p>
					<p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
						Average next review interval
					</p>
				</div>
			</div>

			<div className="mt-6 flex w-full flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
				<Button
					type="button"
					variant="outline"
					onClick={onStudyAgain}
					className="w-full border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] sm:w-auto">
					Study again
				</Button>
				<Button type="button" onClick={onBack} className="w-full bg-[var(--sn-accent)] text-white hover:bg-[#8f7fff] sm:w-auto">
					Back to notes
				</Button>
			</div>
		</div>
	);
}
