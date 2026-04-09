"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock3 } from "lucide-react";

import { MarkdownContent } from "@/components/ai/MarkdownContent";
import { SessionComplete } from "@/components/flashcards/SessionComplete";
import { Button } from "@/components/ui/button";
import { estimateNextIntervals, type FSRSCard, type Rating } from "@/lib/fsrs";

type StudyCard = FSRSCard & {
	id: string;
	deckId: string;
	front: string;
	back: string;
};

interface StudySessionProps {
	open: boolean;
	sessionId: string;
	title: string;
	cards: StudyCard[];
	onClose: () => void;
}

type RatedCard = {
	cardId: string;
	rating: Rating;
	timeMs: number;
	interval: number;
};

const RATING_META: Record<Rating, { label: string; color: string }> = {
	1: { label: "Again", color: "#ef4444" },
	2: { label: "Hard", color: "#f97316" },
	3: { label: "Good", color: "#22c55e" },
	4: { label: "Easy", color: "#3b82f6" },
};

function formatElapsed(totalSeconds: number) {
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function StudySession({ open, sessionId, title, cards, onClose }: StudySessionProps) {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [isRevealed, setIsRevealed] = useState(false);
	const [answers, setAnswers] = useState<RatedCard[]>([]);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [startedAt] = useState(() => Date.now());
	const [elapsedSeconds, setElapsedSeconds] = useState(0);
	const [completionStats, setCompletionStats] = useState<{
		totalTime: number;
		cardsStudied: number;
		cardsCorrect: number;
	} | null>(null);

	const currentCard = cards[currentIndex];
	const progress = cards.length > 0 ? ((currentIndex + 1) / cards.length) * 100 : 0;
	const correctCount = answers.filter((answer) => answer.rating >= 3).length;

	useEffect(() => {
		if (!open) {
			return;
		}

		const interval = window.setInterval(() => {
			setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
		}, 1000);

		return () => window.clearInterval(interval);
	}, [open, startedAt]);

	const intervalEstimates = useMemo(() => {
		if (!currentCard) {
			return null;
		}

		return estimateNextIntervals(currentCard);
	}, [currentCard]);

	const handleRate = useCallback(
		async (rating: Rating) => {
			if (!currentCard || isSubmitting) {
				return;
			}

			setIsSubmitting(true);
			const cardStartedAt = Date.now();

			try {
				const response = await fetch(`/api/flashcards/session/${sessionId}/review`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						cardId: currentCard.id,
						rating,
						timeMs: Math.max(1, cardStartedAt - startedAt),
					}),
				});

				if (!response.ok) {
					throw new Error("Failed to save review");
				}

				const payload = (await response.json()) as { interval?: number };
				setAnswers((previousAnswers) => [
					...previousAnswers,
					{
						cardId: currentCard.id,
						rating,
						timeMs: Math.max(1, cardStartedAt - startedAt),
						interval: Math.max(1, payload.interval ?? intervalEstimates?.good ?? 1),
					},
				]);

				if (currentIndex >= cards.length - 1) {
					const finishResponse = await fetch(`/api/flashcards/session/${sessionId}/finish`, {
						method: "POST",
					});
					if (finishResponse.ok) {
						const stats = (await finishResponse.json()) as {
							totalTime: number;
							cardsStudied: number;
							cardsCorrect: number;
						};
						setCompletionStats(stats);
					} else {
						setCompletionStats({
							totalTime: elapsedSeconds,
							cardsStudied: answers.length + 1,
							cardsCorrect: correctCount + (rating >= 3 ? 1 : 0),
						});
					}
					return;
				}

				setCurrentIndex((index) => index + 1);
				setIsRevealed(false);
			} catch (error) {
				console.error("Failed to review flashcard:", error);
			} finally {
				setIsSubmitting(false);
			}
		},
		[answers.length, cards.length, correctCount, currentCard, currentIndex, elapsedSeconds, intervalEstimates, isSubmitting, sessionId, startedAt],
	);

	useEffect(() => {
		if (!open) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onClose();
				return;
			}

			if (!currentCard) {
				return;
			}

			if ((event.key === " " || event.key === "Enter") && !isRevealed) {
				event.preventDefault();
				setIsRevealed(true);
				return;
			}

			if (!isRevealed || isSubmitting) {
				return;
			}

			const ratingMap: Record<string, Rating> = {
				"1": 1,
				"2": 2,
				"3": 3,
				"4": 4,
				ArrowLeft: 1,
				ArrowDown: 2,
				ArrowUp: 3,
				ArrowRight: 4,
			};
			const rating = ratingMap[event.key];
			if (!rating) {
				return;
			}

			event.preventDefault();
			void handleRate(rating);
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [currentCard, handleRate, isRevealed, isSubmitting, onClose, open]);

	function handleStudyAgain() {
		setCurrentIndex(0);
		setIsRevealed(false);
		setAnswers([]);
		setCompletionStats(null);
	}

	if (!open) {
		return null;
	}

	if (completionStats) {
		const averageInterval = answers.length > 0 ? Math.round(answers.reduce((sum, answer) => sum + answer.interval, 0) / answers.length) : 1;

		return (
			<div className="fixed inset-0 z-[140] flex items-center justify-center bg-[rgba(6,6,8,0.94)] px-4 py-6 backdrop-blur-md">
				<SessionComplete
					title={title}
					totalCards={completionStats.cardsStudied}
					correctCards={completionStats.cardsCorrect}
					totalTime={completionStats.totalTime}
					averageIntervalDays={averageInterval}
					onStudyAgain={handleStudyAgain}
					onBack={onClose}
				/>
			</div>
		);
	}

	return (
		<div className="fixed inset-0 z-[140] flex flex-col overflow-y-auto bg-[rgba(6,6,8,0.98)] backdrop-blur-md sm:overflow-hidden">
			<div
				className="flex shrink-0 flex-col gap-3 border-b px-4 py-3 sm:h-14 sm:flex-row sm:items-center sm:justify-between sm:px-5"
				style={{ borderColor: "var(--border-default)" }}>
				<button
					type="button"
					onClick={onClose}
					className="inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-sm transition-colors hover:bg-[var(--bg-hover)]"
					style={{ color: "var(--text-secondary)" }}>
					<ArrowLeft className="h-4 w-4" />
					Exit
				</button>
				<div className="text-center sm:min-w-0">
					<p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
						{title}
					</p>
					<p className="text-xs" style={{ color: "var(--text-secondary)" }}>
						Card {Math.min(currentIndex + 1, cards.length)} / {cards.length}
					</p>
				</div>
				<div className="flex items-center gap-3 text-sm self-start sm:self-auto" style={{ color: "var(--text-secondary)" }}>
					<div className="inline-flex items-center gap-1.5">
						<Clock3 className="h-4 w-4" />
						{formatElapsed(elapsedSeconds)}
					</div>
					<span>{correctCount} ✓</span>
					<span>{answers.length - correctCount} ✗</span>
				</div>
			</div>

			<div className="h-1 w-full" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
				<div className="h-full transition-[width] duration-300" style={{ width: `${progress}%`, backgroundColor: "var(--sn-accent)" }} />
			</div>

			<div className="flex flex-1 items-center justify-center px-3 py-4 sm:px-4 sm:py-8">
				{currentCard ? (
					<div className="w-full max-w-4xl">
						<div
							className="rounded-[28px] border px-4 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:px-8 sm:py-10"
							style={{ backgroundColor: "var(--bg-sidebar)", borderColor: "var(--border-default)" }}>
							<div className="min-h-[280px] sm:min-h-[360px]">
								<div className="flex min-h-[140px] items-center justify-center text-center sm:min-h-[180px]">
									<MarkdownContent
										content={currentCard.front}
										className="w-full max-w-3xl text-left text-[1.15rem] font-semibold leading-tight tracking-tight text-[var(--text-primary)] sm:text-[1.55rem]"
									/>
								</div>

								{isRevealed ? (
									<>
										<div className="my-6 h-px" style={{ backgroundColor: "var(--border-default)" }} />
										<div className="flex min-h-[120px] items-center justify-center text-center sm:min-h-[140px]">
											<MarkdownContent
												content={currentCard.back}
												className="w-full max-w-3xl text-left text-base leading-7 text-[var(--text-secondary)] sm:text-lg sm:leading-8"
											/>
										</div>
									</>
								) : (
									<div className="mt-6 text-center text-sm sm:mt-8" style={{ color: "var(--text-tertiary)" }}>
										Tap to reveal or press Space
									</div>
								)}
							</div>
						</div>

						{!isRevealed ? (
							<div className="mt-5 flex justify-center sm:mt-6">
								<Button type="button" onClick={() => setIsRevealed(true)} className="bg-[var(--sn-accent)] text-white hover:bg-[#8f7fff]">
									Reveal answer
								</Button>
							</div>
						) : intervalEstimates ? (
							<div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:mt-6">
								{(Object.entries(RATING_META) as Array<[`${Rating}`, (typeof RATING_META)[Rating]]>).map(([ratingKey, meta]) => {
									const rating = Number(ratingKey) as Rating;
									const intervalMap = {
										1: intervalEstimates.again,
										2: intervalEstimates.hard,
										3: intervalEstimates.good,
										4: intervalEstimates.easy,
									} as const;

									return (
										<button
											key={rating}
											type="button"
											disabled={isSubmitting}
											onClick={() => void handleRate(rating)}
											className="rounded-2xl border px-4 py-4 text-left transition-transform duration-150 hover:-translate-y-0.5 disabled:opacity-50"
											style={{
												borderColor: `${meta.color}55`,
												backgroundColor: `${meta.color}18`,
											}}>
											<p className="text-base font-semibold" style={{ color: meta.color }}>
												{meta.label}
											</p>
											<p className="mt-1 text-sm" style={{ color: "var(--text-primary)" }}>
												{intervalMap[rating]}d
											</p>
										</button>
									);
								})}
							</div>
						) : null}
					</div>
				) : (
					<div
						className="rounded-3xl border px-8 py-12 text-center"
						style={{ backgroundColor: "var(--bg-sidebar)", borderColor: "var(--border-default)" }}>
						<p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
							No due cards
						</p>
						<p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
							This deck does not have any scheduled reviews right now.
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
