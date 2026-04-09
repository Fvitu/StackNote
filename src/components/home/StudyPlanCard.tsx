import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import { CheckCircle2 } from "lucide-react";

interface ExamSummary {
	id: string;
	title: string;
	subject: string | null;
	examDate: string;
}

interface TodaysSessionSummary {
	totalCards: number;
	estimatedMinutes: number;
}

interface StudyPlanCardProps {
	exams: ExamSummary[];
	todaysSession: TodaysSessionSummary;
}

function getUrgencyStyles(remainingDays: number) {
	if (remainingDays <= 3) {
		return {
			rowBorder: "border-[#ef4444]",
			chipClassName: "bg-red-500/10 text-red-400",
		};
	}

	if (remainingDays <= 7) {
		return {
			rowBorder: "border-[#f59e0b]",
			chipClassName: "bg-amber-500/10 text-amber-400",
		};
	}

	return {
		rowBorder: "border-[#7c6aff]",
		chipClassName: "bg-[#7c6aff]/10 text-[#c4bbff]",
	};
}

function getRemainingLabel(remainingDays: number) {
	if (remainingDays <= 0) {
		return "Today";
	}

	return remainingDays === 1 ? "In 1 day" : `In ${remainingDays} days`;
}

export function StudyPlanCard({ exams, todaysSession }: StudyPlanCardProps) {
	const today = new Date();

	return (
		<section className="rounded-2xl border border-[#1e1e1e] bg-[#111111] p-5 transition-all duration-200 hover:shadow-[0_0_0_1px_rgba(124,106,255,0.1)]">
			<div>
				<p className="text-[11px] font-semibold uppercase tracking-widest text-[#555555]">Study Plan</p>
				<p className="mt-2 text-sm text-[#888888]">Your nearest deadlines and today&apos;s study workload.</p>
			</div>

			<div className="mt-5 space-y-3">
				{exams.length === 0 ? (
					<Link href="/planner" className="text-sm text-[#888888] transition-colors duration-200 hover:text-[#f0f0f0] hover:underline">
						No upcoming exams. Add one in the planner →
					</Link>
				) : (
					exams.slice(0, 4).map((exam) => {
						const examDate = new Date(exam.examDate);
						const remainingDays = Math.max(0, differenceInCalendarDays(examDate, today));
						const urgency = getUrgencyStyles(remainingDays);

						return (
							<div key={exam.id} className={`rounded-xl border border-[#1e1e1e] border-l-2 bg-[#141414] px-3 py-3 ${urgency.rowBorder}`}>
								<div className="flex items-center justify-between gap-3">
									<p className="truncate text-sm font-medium text-[#f0f0f0]">{exam.subject?.trim() || exam.title}</p>
									<span className={`shrink-0 rounded-full px-2 py-1 text-[11px] ${urgency.chipClassName}`}>
										{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(examDate)}
									</span>
								</div>
								<p className="mt-1 text-xs text-[#555555]">{getRemainingLabel(remainingDays)}</p>
							</div>
						);
					})
				)}
			</div>

			<div className="mt-5 border-t border-[#1e1e1e] pt-5">
				<p className="text-[11px] font-semibold uppercase tracking-widest text-[#555555]">Today&apos;s Session</p>

				{todaysSession.totalCards === 0 ? (
					<div className="mt-4 flex items-center gap-3 rounded-xl border border-[#1e1e1e] bg-[#141414] px-3 py-3 text-sm text-[#888888]">
						<CheckCircle2 className="h-4 w-4 text-[#22c55e]" />
						<span>All caught up for today</span>
					</div>
				) : (
					<div className="mt-4 flex flex-col gap-4 rounded-xl border border-[#1e1e1e] bg-[#141414] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p className="text-xl font-semibold text-[#f0f0f0]">{todaysSession.totalCards} cards due</p>
							<p className="mt-1 text-sm text-[#888888]">Estimated {todaysSession.estimatedMinutes} minutes</p>
						</div>
						<Link
							href="/planner"
							className="inline-flex items-center justify-center rounded-lg bg-[#7c6aff] px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:shadow-[0_0_12px_rgba(124,106,255,0.3)]">
							Start studying →
						</Link>
					</div>
				)}
			</div>
		</section>
	);
}
