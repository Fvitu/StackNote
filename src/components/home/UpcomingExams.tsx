import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";

type ExamSummary = {
	id: string;
	title: string;
	examDate: string;
};

type TodaysSessionSummary = {
	totalCards: number;
	estimatedMinutes: number;
};

export function UpcomingExams({
	exams,
	todaysSession,
}: {
	exams: ExamSummary[];
	todaysSession: TodaysSessionSummary;
}) {
	const today = new Date();

	return (
		<div className="rounded-[20px] border p-4 sm:rounded-[24px] sm:p-5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
			<div className="mb-4">
				<h2 className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--text-tertiary)" }}>
					Upcoming Exams
				</h2>
			</div>

			{exams.length === 0 ? (
				<Link href="/planner" className="text-sm hover:underline" style={{ color: "var(--text-secondary)" }}>
					No upcoming exams, add one in the planner →
				</Link>
			) : (
				<div className="space-y-3">
					{exams.slice(0, 4).map((exam) => {
						const examDate = new Date(exam.examDate);
						const remainingDays = differenceInCalendarDays(examDate, today);

						return (
							<div key={exam.id} className="rounded-[18px] px-3 py-2" style={{ backgroundColor: "var(--bg-hover)" }}>
								<div className="flex min-w-0 items-center justify-between gap-3">
									<div className="min-w-0">
										<p className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
											{exam.title}
										</p>
										<p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
											{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(examDate)}
										</p>
									</div>
									<span className="shrink-0 text-right text-xs" style={{ color: "var(--sn-accent)" }}>
										{remainingDays} days
									</span>
								</div>
							</div>
						);
					})}
				</div>
			)}

			<div className="mt-5 rounded-[20px] border px-4 py-4" style={{ borderColor: "var(--border-default)", backgroundColor: "rgba(124,106,255,0.08)" }}>
				<p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--text-tertiary)" }}>
					Today&apos;s Session
				</p>
				<div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<p className="text-2xl font-semibold tracking-[-0.03em]" style={{ color: "var(--text-primary)" }}>
							{todaysSession.totalCards} cards
						</p>
						<p className="text-sm" style={{ color: "var(--text-secondary)" }}>
							Estimated {todaysSession.estimatedMinutes} minutes
						</p>
					</div>
					<Link href="/planner" className="text-sm font-medium hover:underline" style={{ color: "var(--sn-accent)" }}>
						Start studying →
					</Link>
				</div>
			</div>
		</div>
	);
}
