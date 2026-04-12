"use client";

import { CalendarDays, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ExamCardProps {
	title: string;
	subject?: string | null;
	examDate: string;
	dateBadgeLabel: string;
	noteCount: number;
	questionCount: number;
	onStudyToday: () => void;
	onEdit: () => void;
	onDeletePlan: () => void;
	isStudyTodayDisabled?: boolean;
	variant?: "default" | "past";
}

function formatExamDate(dateValue: string) {
	const dateKey = dateValue.slice(0, 10);
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
	if (!match) {
		return new Date(dateValue).toLocaleDateString();
	}

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	return new Date(year, month - 1, day).toLocaleDateString();
}

export function ExamCard({
	title,
	subject,
	examDate,
	dateBadgeLabel,
	noteCount,
	questionCount,
	onStudyToday,
	onEdit,
	onDeletePlan,
	isStudyTodayDisabled = false,
	variant = "default",
}: ExamCardProps) {
	const isPast = variant === "past";

	return (
		<div
			className={`rounded-[24px] border p-4 sm:p-5 ${isPast ? "opacity-90" : ""}`}
			style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
			<div className="relative flex flex-col gap-3 pr-0 sm:pr-20">
				<div className="min-w-0">
					<p className="truncate text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
						{title}
					</p>
					{subject ? (
						<p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
							{subject}
						</p>
					) : null}
				</div>
				<div className="absolute right-3 top-3 flex items-center gap-1">
					<button
						type="button"
						onClick={onEdit}
						className="rounded-full p-2 transition-colors hover:bg-[var(--bg-hover)]"
						aria-label={`Edit assessment ${title}`}>
						<Pencil className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
					</button>
					<button
						type="button"
						onClick={onDeletePlan}
						className="rounded-full p-2 transition-colors hover:bg-[var(--bg-hover)]"
						aria-label={`Delete evaluation plan for ${title}`}>
						<Trash2 className="h-4 w-4" style={{ color: "var(--destructive)" }} />
					</button>
				</div>
			</div>

			<div className="mt-4 flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
				<CalendarDays className="h-4 w-4" />
				<span>{formatExamDate(examDate)}</span>
				<span
					className="rounded-full px-2 py-0.5 text-xs"
					style={{
						backgroundColor: isPast ? "rgba(255,255,255,0.08)" : "var(--accent-muted)",
						color: isPast ? "var(--text-secondary)" : "var(--sn-accent)",
					}}>
					{dateBadgeLabel}
				</span>
			</div>

			<p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
				{noteCount} note{noteCount === 1 ? "" : "s"} · {questionCount} planned question{questionCount === 1 ? "" : "s"}
			</p>

			<Button
				type="button"
				onClick={onStudyToday}
				disabled={isStudyTodayDisabled}
				className="mt-5 w-full bg-[var(--sn-accent)] text-white hover:bg-[#8f7fff] disabled:opacity-50">
				Study today
			</Button>
		</div>
	);
}
