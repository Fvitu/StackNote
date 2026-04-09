"use client";

import { CalendarDays, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ExamCardProps {
	title: string;
	subject?: string | null;
	examDate: string;
	daysUntil: number;
	noteCount: number;
	questionCount: number;
	onStudyToday: () => void;
	onDeletePlan: () => void;
	isStudyTodayDisabled?: boolean;
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

export function ExamCard({ title, subject, examDate, daysUntil, noteCount, questionCount, onStudyToday, onDeletePlan, isStudyTodayDisabled = false }: ExamCardProps) {
	const label = daysUntil <= 0 ? "Today" : `${daysUntil}d`;

	return (
		<div className="rounded-[24px] border p-4 sm:p-5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
			<div className="relative flex flex-col gap-3 pr-10 sm:flex-row sm:items-start sm:justify-between sm:pr-0">
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
				<button
					type="button"
					onClick={onDeletePlan}
					className="absolute right-0 top-0 rounded-full p-2 transition-colors hover:bg-[var(--bg-hover)] sm:static sm:self-auto"
					aria-label={`Delete evaluation plan for ${title}`}>
					<Trash2 className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
				</button>
			</div>

			<div className="mt-4 flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
				<CalendarDays className="h-4 w-4" />
				<span>{formatExamDate(examDate)}</span>
				<span className="rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: "var(--accent-muted)", color: "var(--sn-accent)" }}>
					{label}
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
