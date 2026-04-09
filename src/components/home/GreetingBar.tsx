"use client";

import { useEffect, useMemo, useState } from "react";

const FIRST_VISIT_KEY = "stacknote:home-first-visit";
const DAILY_TIP_KEY = "stacknote:home-tip-date";
const TIPS = [
	"Review the hardest topic first while your attention is still fresh.",
	"Use Sage for clarification, then rewrite the concept in your own words.",
	"A short recall session beats rereading the same page twice.",
	"Break large notes into questions you can answer from memory.",
	"Study the examples, then solve one without looking back.",
	"Flashcards work best when the back side stays concise.",
	"Keep one scratch note for loose thoughts and organize it later.",
	"Use the graph view to spot notes that should probably be linked together.",
	"Start with the exam closest in time, not the easiest subject.",
	"End each session by writing the next question you still need to answer.",
];

function getGreeting(name: string) {
	const hour = new Date().getHours();
	const timeGreeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
	return `${timeGreeting}, ${name.split(" ")[0] || "there"}!`;
}

function getTodayLabel() {
	return new Intl.DateTimeFormat(undefined, {
		weekday: "long",
		month: "long",
		day: "numeric",
	}).format(new Date());
}

export function GreetingBar({ name }: { name: string }) {
	const [isFirstVisit, setIsFirstVisit] = useState(false);
	const [tagline, setTagline] = useState("Welcome to StackNote, your intelligent study workspace.");

	useEffect(() => {
		const today = new Date().toISOString().slice(0, 10);
		const hasVisited = window.localStorage.getItem(FIRST_VISIT_KEY) === "true";
		const storedTipDate = window.localStorage.getItem(DAILY_TIP_KEY);

		if (!hasVisited) {
			window.localStorage.setItem(FIRST_VISIT_KEY, "true");
			window.localStorage.setItem(DAILY_TIP_KEY, today);
			setIsFirstVisit(true);
			setTagline("Welcome to StackNote, your intelligent study workspace.");
			return;
		}

		setIsFirstVisit(false);
		if (storedTipDate !== today) {
			window.localStorage.setItem(DAILY_TIP_KEY, today);
		}

		const dayIndex = Number(today.replace(/-/g, "")) % TIPS.length;
		setTagline(TIPS[dayIndex] ?? TIPS[0]!);
	}, []);

	const greeting = useMemo(() => getGreeting(name), [name]);
	const dateLabel = useMemo(() => getTodayLabel(), []);

	return (
		<div
			className="rounded-[22px] border px-4 py-4 sm:rounded-[28px] sm:px-6 sm:py-5"
			style={{
				background:
					"radial-gradient(circle at top left, rgba(124,106,255,0.18), rgba(124,106,255,0.03) 35%, rgba(10,10,10,0.98) 70%)",
				borderColor: "var(--border-default)",
			}}>
			<div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
				<div>
					<h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl" style={{ color: "var(--text-primary)" }}>
						{greeting}
					</h1>
					<p className="mt-2 text-sm" style={{ color: isFirstVisit ? "var(--text-secondary)" : "var(--text-tertiary)" }}>
						{tagline}
					</p>
				</div>
				<div className="text-xs font-medium sm:text-sm md:shrink-0" style={{ color: "var(--text-secondary)" }}>
					{dateLabel}
				</div>
			</div>
		</div>
	);
}
