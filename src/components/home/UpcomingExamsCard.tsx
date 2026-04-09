import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import { Separator } from "@/components/ui/separator";

interface ExamSummary {
	id: string;
	title: string;
	subject: string | null;
	examDate: string;
}

function getCountdownLabel(remainingDays: number) {
	if (remainingDays < 0) {
		return "overdue";
	}
	if (remainingDays === 0) {
		return "today";
	}
	if (remainingDays === 1) {
		return "tomorrow";
	}
	return `in ${remainingDays} days`;
}

export function UpcomingExamsCard({ exams }: { exams: ExamSummary[] }) {
	const today = new Date();

	return (
		<section className="rounded-[24px] border border-white/5 bg-[#111111] p-5">
			<div className="space-y-2">
				<p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Upcoming Exams</p>
				<p className="text-sm text-zinc-400">Your nearest deadlines from the planner.</p>
			</div>

			<div className="mt-5 space-y-3">
				{exams.length === 0 ? (
					<p className="text-sm text-zinc-400">
						No upcoming exams <span className="text-zinc-600">—</span>{" "}
						<Link href="/planner" className="text-violet-400 transition-colors hover:text-violet-300">
							add one in the Planner →
						</Link>
					</p>
				) : (
					exams.map((exam) => {
						const examDate = new Date(exam.examDate);
						const remainingDays = differenceInCalendarDays(examDate, today);

						return (
							<div key={exam.id} className="rounded-2xl border border-white/5 bg-[#141414] px-4 py-3">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<p className="truncate text-sm font-medium text-white">{exam.subject?.trim() || exam.title}</p>
										<p className="mt-1 text-xs text-zinc-500">
											{new Intl.DateTimeFormat(undefined, {
												weekday: "short",
												month: "short",
												day: "numeric",
											}).format(examDate)}
										</p>
									</div>
									<span className="shrink-0 text-xs text-violet-300">{getCountdownLabel(remainingDays)}</span>
								</div>
							</div>
						);
					})
				)}
			</div>

			<Separator className="my-5 bg-white/5" />

			<div className="flex justify-end">
				<Link href="/planner" className="text-sm text-violet-400 transition-colors hover:text-violet-300">
					Go to Planner →
				</Link>
			</div>
		</section>
	);
}
