import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StudySessionSummary {
	totalQuestions: number;
	plannedQuestions: number;
	estimatedMinutes: number;
}

export function StudySessionCard({ session }: { session: StudySessionSummary }) {
	return (
		<section className="rounded-[24px] border border-white/5 bg-[#111111] p-5">
			<div className="space-y-2">
				<p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Today&apos;s Study Session</p>
				<p className="text-sm text-zinc-400">Cards scheduled for today and your estimated review time.</p>
			</div>

			{session.totalQuestions === 0 ? (
				<div className="mt-5 rounded-2xl border border-white/5 bg-[#141414] px-4 py-4">
					<div className="flex items-center gap-3">
						<CheckCircle2 className="h-4 w-4 text-zinc-400" />
						<p className="text-sm font-medium text-white">You&apos;re all caught up 🎉</p>
					</div>
					<p className="mt-2 text-sm text-zinc-400">No planner questions are scheduled right now. Check the planner if you want to stay ahead.</p>
				</div>
			) : (
				<div className="mt-5 rounded-2xl border border-white/5 bg-[#141414] px-4 py-4">
					<p className="text-3xl font-semibold tracking-[-0.03em] text-white">{session.totalQuestions}</p>
					<p className="mt-1 text-sm text-zinc-400">
						{session.totalQuestions === 1 ? "question scheduled" : "questions scheduled"}{" "}
						{session.plannedQuestions > 0 && session.plannedQuestions !== session.totalQuestions
							? `• ${session.plannedQuestions} in today’s plan`
							: ""}
					</p>
					<p className="mt-4 text-sm text-zinc-500">Estimated {session.estimatedMinutes} min</p>

					<Button
						nativeButton={false}
						render={
							<Link href="/planner" />
						}
						className="mt-5 h-10 w-full rounded-xl border border-transparent bg-[#7c6aff] text-sm font-medium text-white hover:bg-[#8b7bff]">
						Start studying →
					</Button>
				</div>
			)}
		</section>
	);
}
