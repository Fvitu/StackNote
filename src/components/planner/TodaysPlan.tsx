"use client";

import { Button } from "@/components/ui/button";

interface TodaysPlanItem {
	id: string;
	examId: string;
	examTitle: string;
	questionCount: number;
	estimatedMinutes: number;
}

interface TodaysPlanProps {
	items: TodaysPlanItem[];
	onStart: () => void;
}

export function TodaysPlan({ items, onStart }: TodaysPlanProps) {
	const totalMinutes = items.reduce((sum, item) => sum + item.estimatedMinutes, 0);
	const totalQuestions = items.reduce((sum, item) => sum + item.questionCount, 0);

	return (
		<section className="self-start rounded-[24px] border p-4 sm:p-6" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
			<h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
				Today&apos;s plan
			</h2>
			<div className="mt-4 space-y-3">
				{items.length === 0 ? (
					<p className="text-sm" style={{ color: "var(--text-secondary)" }}>
						Nothing is scheduled for today yet. Create an exam or regenerate an existing plan.
					</p>
				) : (
					items.map((item) => (
						<div
							key={item.id}
							className="rounded-2xl border px-4 py-3"
							style={{ backgroundColor: "var(--bg-sidebar)", borderColor: "var(--border-default)" }}>
							<p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
								{item.examTitle}
							</p>
							<p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
								{item.questionCount} question{item.questionCount === 1 ? "" : "s"} · ~{item.estimatedMinutes} min
							</p>
						</div>
					))
				)}
			</div>

			<div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<p className="text-sm" style={{ color: "var(--text-secondary)" }}>
					Total: ~{totalMinutes} minutes
				</p>
				<Button
					type="button"
					onClick={onStart}
					disabled={totalQuestions === 0}
					className="w-full bg-[var(--sn-accent)] text-white hover:bg-[#8f7fff] disabled:opacity-50 sm:w-auto">
					Start today&apos;s session
				</Button>
			</div>
		</section>
	);
}
