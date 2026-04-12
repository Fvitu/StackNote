"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Clock3, Loader2 } from "lucide-react";

import { MarkdownContent } from "@/components/ai/MarkdownContent";
import { SessionComplete } from "@/components/flashcards/SessionComplete";
import { Button } from "@/components/ui/button";
import { estimateNextIntervals, type FSRSCard, type Rating } from "@/lib/fsrs";
import {
	isPlannerStudyAdvancePayload,
	type PlannerStudyAdvancePayload,
	type PlannerStudyCard,
	type PlannerStudyQueueExam,
	type PlannerStudySessionPayload,
} from "@/lib/planner-study-session";

interface PlannerStudySessionProps {
	open: boolean;
	loading: boolean;
	title: string;
	session: PlannerStudySessionPayload | null;
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

function getApiErrorMessage(value: unknown) {
	if (!value || typeof value !== "object") {
		return null;
	}

	const maybeError = (value as { error?: unknown }).error;
	return typeof maybeError === "string" && maybeError.trim().length > 0 ? maybeError : null;
}

function getTotalRemainingCards(queue: PlannerStudyQueueExam[]) {
	return queue.reduce((sum, item) => sum + item.remainingCount + (Array.isArray(item.queuedCards) ? item.queuedCards.length : 0), 0);
}

function shiftQueuedCard(queue: PlannerStudyQueueExam[]): PlannerStudyAdvancePayload {
	for (let index = 0; index < queue.length; index += 1) {
		const queueItem = queue[index];
		if (!queueItem || !Array.isArray(queueItem.queuedCards) || queueItem.queuedCards.length === 0) {
			continue;
		}

		const [currentCard, ...restCards] = queueItem.queuedCards;
		return {
			currentCard,
			queue: queue.map((item, itemIndex) =>
				itemIndex === index
					? {
							...item,
							queuedCards: restCards,
						}
					: item,
			),
		};
	}

	return {
		currentCard: null,
		queue,
	};
}

function toFsrsCard(card: PlannerStudyCard): FSRSCard {
	return {
		stability: card.stability,
		difficulty: card.difficulty,
		reps: card.reps,
		lapses: card.lapses,
		state: card.state,
		dueDate: new Date(card.dueDate),
	};
}

export function PlannerStudySession({ open, loading, title, session, onClose }: PlannerStudySessionProps) {
	const prefetchPromiseRef = useRef<Promise<PlannerStudyAdvancePayload> | null>(null);
	const [currentCard, setCurrentCard] = useState<PlannerStudyCard | null>(session?.currentCard ?? null);
	const [queue, setQueue] = useState<PlannerStudyQueueExam[]>(session?.queue ?? []);
	const [answers, setAnswers] = useState<RatedCard[]>([]);
	const [isRevealed, setIsRevealed] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isLoadingNextCard, setIsLoadingNextCard] = useState(false);
	const [isPrefetching, setIsPrefetching] = useState(false);
	const [prefetchedNext, setPrefetchedNext] = useState<PlannerStudyAdvancePayload | null>(null);
	const [sessionError, setSessionError] = useState<string | null>(null);
	const [sessionIds, setSessionIds] = useState<string[]>([]);
	const [startedAt, setStartedAt] = useState<number | null>(null);
	const [cardStartedAt, setCardStartedAt] = useState<number | null>(null);
	const [elapsedSeconds, setElapsedSeconds] = useState(0);
	const [completionStats, setCompletionStats] = useState<{
		totalTime: number;
		cardsStudied: number;
		cardsCorrect: number;
		averageIntervalDays: number;
	} | null>(null);

	useEffect(() => {
		if (!open) {
			return;
		}

		if (!session) {
			prefetchPromiseRef.current = null;
			setCurrentCard(null);
			setQueue([]);
			setAnswers([]);
			setIsRevealed(false);
			setIsSubmitting(false);
			setIsLoadingNextCard(false);
			setIsPrefetching(false);
			setPrefetchedNext(null);
			setSessionError(null);
			setSessionIds([]);
			setStartedAt(Date.now());
			setCardStartedAt(null);
			setElapsedSeconds(0);
			setCompletionStats(null);
			return;
		}

		const now = Date.now();
		prefetchPromiseRef.current = null;
		setCurrentCard(session.currentCard);
		setQueue(session.queue);
		setAnswers([]);
		setIsRevealed(false);
		setIsSubmitting(false);
		setIsLoadingNextCard(false);
		setIsPrefetching(false);
		setPrefetchedNext(null);
		setSessionError(null);
		setSessionIds(Array.from(new Set([...(session.currentCard ? [session.currentCard.sessionId] : []), ...session.queue.map((item) => item.sessionId)])));
		setStartedAt(now);
		setCardStartedAt(session.currentCard ? now : null);
		setElapsedSeconds(0);
		setCompletionStats(null);
	}, [open, session]);

	useEffect(() => {
		if (!open || startedAt === null || completionStats) {
			return;
		}

		const interval = window.setInterval(() => {
			setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
		}, 1000);

		return () => window.clearInterval(interval);
	}, [completionStats, open, startedAt]);

	const totalCards = answers.length + (currentCard ? 1 : 0) + getTotalRemainingCards(queue);
	const correctCount = answers.filter((answer) => answer.rating >= 3).length;
	const progress = totalCards > 0 ? ((answers.length + (currentCard ? 1 : 0)) / totalCards) * 100 : 0;
	const currentCardNumber = Math.min(answers.length + (currentCard ? 1 : 0), totalCards);

	const intervalEstimates = useMemo(() => {
		if (!currentCard) {
			return null;
		}

		return estimateNextIntervals(toFsrsCard(currentCard));
	}, [currentCard]);

	const requestNextCard = useCallback(async (queueToAdvance: PlannerStudyQueueExam[]) => {
		const response = await fetch("/api/planner/session/next", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ queue: queueToAdvance }),
		});
		const responseBody = (await response.json().catch(() => null)) as unknown;

		if (!response.ok) {
			const apiErrorMessage = getApiErrorMessage(responseBody);
			throw new Error(apiErrorMessage ?? "Failed to load the next study card");
		}

		if (!isPlannerStudyAdvancePayload(responseBody)) {
			throw new Error("Planner study session returned an invalid card payload");
		}

		return responseBody;
	}, []);

	useEffect(() => {
		if (!open || loading || completionStats || currentCard === null || isPrefetching || prefetchedNext) {
			return;
		}

		const hasQueuedCardReady = queue.some((item) => item.queuedCards.length > 0);
		const hasGeneratedCardsRemaining = queue.some((item) => item.remainingCount > 0);
		if (hasQueuedCardReady || !hasGeneratedCardsRemaining) {
			return;
		}

		let isCancelled = false;
		setIsPrefetching(true);
		const prefetchPromise = requestNextCard(queue);
		prefetchPromiseRef.current = prefetchPromise;
		void prefetchPromise
			.then((nextPayload) => {
				if (!isCancelled) {
					setPrefetchedNext(nextPayload);
				}
			})
			.catch((error) => {
				if (!isCancelled) {
					setSessionError(error instanceof Error ? error.message : "Failed to prepare the next card");
				}
			})
			.finally(() => {
				prefetchPromiseRef.current = null;
				if (!isCancelled) {
					setIsPrefetching(false);
				}
			});

		return () => {
			isCancelled = true;
		};
	}, [completionStats, currentCard, loading, open, prefetchedNext, queue, requestNextCard, isPrefetching]);

	const finishAllStudySessions = useCallback(async () => {
		await Promise.allSettled(
			sessionIds.map((sessionId) =>
				fetch(`/api/flashcards/session/${sessionId}/finish`, {
					method: "POST",
				}),
			),
		);
	}, [sessionIds]);

	const moveToNextCard = useCallback(
		async (nextAnswers: RatedCard[]) => {
			const nextTotalTime = startedAt === null ? elapsedSeconds : Math.floor((Date.now() - startedAt) / 1000);
			const averageIntervalDays =
				nextAnswers.length > 0 ? Math.round(nextAnswers.reduce((sum, answer) => sum + answer.interval, 0) / nextAnswers.length) : 1;

			if (prefetchedNext) {
				setCurrentCard(prefetchedNext.currentCard);
				setQueue(prefetchedNext.queue);
				setPrefetchedNext(null);
				setIsRevealed(false);
				setIsLoadingNextCard(false);
				setCardStartedAt(prefetchedNext.currentCard ? Date.now() : null);

				if (!prefetchedNext.currentCard) {
					await finishAllStudySessions();
					setCompletionStats({
						totalTime: nextTotalTime,
						cardsStudied: nextAnswers.length,
						cardsCorrect: nextAnswers.filter((answer) => answer.rating >= 3).length,
						averageIntervalDays,
					});
				}
				return;
			}

			const queuedAdvance = shiftQueuedCard(queue);
			if (queuedAdvance.currentCard) {
				setCurrentCard(queuedAdvance.currentCard);
				setQueue(queuedAdvance.queue);
				setIsRevealed(false);
				setIsLoadingNextCard(false);
				setCardStartedAt(Date.now());
				return;
			}

			if (getTotalRemainingCards(queue) > 0) {
				setIsLoadingNextCard(true);
				const generatedAdvance = isPrefetching && prefetchPromiseRef.current ? await prefetchPromiseRef.current : await requestNextCard(queue);
				setCurrentCard(generatedAdvance.currentCard);
				setQueue(generatedAdvance.queue);
				setPrefetchedNext(null);
				setIsRevealed(false);
				setIsLoadingNextCard(false);
				setCardStartedAt(generatedAdvance.currentCard ? Date.now() : null);

				if (!generatedAdvance.currentCard) {
					await finishAllStudySessions();
					setCompletionStats({
						totalTime: nextTotalTime,
						cardsStudied: nextAnswers.length,
						cardsCorrect: nextAnswers.filter((answer) => answer.rating >= 3).length,
						averageIntervalDays,
					});
				}
				return;
			}

			await finishAllStudySessions();
			setCurrentCard(null);
			setQueue([]);
			setIsLoadingNextCard(false);
			setCompletionStats({
				totalTime: nextTotalTime,
				cardsStudied: nextAnswers.length,
				cardsCorrect: nextAnswers.filter((answer) => answer.rating >= 3).length,
				averageIntervalDays,
			});
		},
		[elapsedSeconds, finishAllStudySessions, prefetchedNext, queue, requestNextCard, startedAt],
	);

	const handleRate = useCallback(
		async (rating: Rating) => {
			if (!currentCard || isSubmitting || isLoadingNextCard) {
				return;
			}

			setIsSubmitting(true);
			setSessionError(null);
			const reviewedAt = Date.now();
			const timeMs = Math.max(1, reviewedAt - (cardStartedAt ?? reviewedAt));

			try {
				const response = await fetch(`/api/flashcards/session/${currentCard.sessionId}/review`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						cardId: currentCard.id,
						rating,
						timeMs,
					}),
				});
				const responseBody = (await response.json().catch(() => null)) as unknown;

				if (!response.ok) {
					const apiErrorMessage = getApiErrorMessage(responseBody);
					throw new Error(apiErrorMessage ?? "Failed to save review");
				}

				const payload = responseBody as { interval?: number };
				const nextAnswers = [
					...answers,
					{
						cardId: currentCard.id,
						rating,
						timeMs,
						interval: Math.max(1, payload.interval ?? intervalEstimates?.good ?? 1),
					},
				];
				setAnswers(nextAnswers);
				await moveToNextCard(nextAnswers);
			} catch (error) {
				setSessionError(error instanceof Error ? error.message : "Failed to review study card");
			} finally {
				setIsSubmitting(false);
			}
		},
		[answers, cardStartedAt, currentCard, intervalEstimates, isLoadingNextCard, isSubmitting, moveToNextCard],
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

			if (!currentCard || completionStats) {
				return;
			}

			if ((event.key === " " || event.key === "Enter") && !isRevealed) {
				event.preventDefault();
				setIsRevealed(true);
				return;
			}

			if (!isRevealed || isSubmitting || isLoadingNextCard) {
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
	}, [completionStats, currentCard, handleRate, isLoadingNextCard, isRevealed, isSubmitting, onClose, open]);

	if (!open) {
		return null;
	}

	if (completionStats) {
		return (
			<div className="fixed inset-0 z-[140] flex items-center justify-center bg-[rgba(6,6,8,0.94)] px-4 py-6 backdrop-blur-md">
				<SessionComplete
					title={title}
					totalCards={completionStats.cardsStudied}
					correctCards={completionStats.cardsCorrect}
					totalTime={completionStats.totalTime}
					averageIntervalDays={completionStats.averageIntervalDays}
					onStudyAgain={onClose}
					onBack={onClose}
					backLabel="Back to planner"
					showStudyAgain={false}
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
						{loading ? "Preparing your first card..." : `Card ${currentCardNumber} / ${Math.max(totalCards, 1)}`}
					</p>
				</div>
				<div className="flex items-center gap-3 self-start text-sm sm:self-auto" style={{ color: "var(--text-secondary)" }}>
					<div className="inline-flex items-center gap-1.5">
						<Clock3 className="h-4 w-4" />
						{formatElapsed(elapsedSeconds)}
					</div>
					<span>{answers.length} reviewed</span>
					<span>{getTotalRemainingCards(queue)} left</span>
				</div>
			</div>

			<div className="h-1 w-full" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
				<div className="h-full transition-[width] duration-300" style={{ width: `${progress}%`, backgroundColor: "var(--sn-accent)" }} />
			</div>

			<div className="flex flex-1 items-center justify-center px-3 py-4 sm:px-4 sm:py-8">
				{loading || currentCard === null ? (
					<div
						className="w-full max-w-3xl rounded-[28px] border px-6 py-10 text-center shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:px-8 sm:py-12"
						style={{ backgroundColor: "var(--bg-sidebar)", borderColor: "var(--border-default)" }}>
						<div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(255,255,255,0.06)]">
							<Loader2 className="h-6 w-6 animate-spin text-[var(--sn-accent)]" />
						</div>
						<p className="mt-5 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
							{loading ? "Preparing your first review card" : "Loading the next review card"}
						</p>
						<p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
							StackNote is building the next FSRS prompt from your linked notes so you can start reviewing without waiting for the full session.
						</p>
					</div>
				) : (
					<div className="w-full max-w-4xl">
						<div
							className="rounded-[28px] border px-4 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:px-8 sm:py-10"
							style={{ backgroundColor: "var(--bg-sidebar)", borderColor: "var(--border-default)" }}>
							<div className="flex items-center justify-between gap-3">
								<p className="text-xs uppercase tracking-[0.24em]" style={{ color: "var(--text-tertiary)" }}>
									{currentCard.examTitle}
								</p>
								{isPrefetching ? (
									<p className="text-xs" style={{ color: "var(--text-secondary)" }}>
										Preparing the next card...
									</p>
								) : null}
							</div>

							{sessionError ? (
								<div
									className="mt-4 rounded-2xl border px-4 py-3 text-sm"
									style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }}>
									{sessionError}
								</div>
							) : null}

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
							<div className="mt-5 space-y-3 sm:mt-6">
								<p className="text-center text-sm" style={{ color: "var(--text-secondary)" }}>
									Rate the difficulty from 1 to 4 for the FSRS scheduler.
								</p>
								<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
												disabled={isSubmitting || isLoadingNextCard}
												onClick={() => void handleRate(rating)}
												className="rounded-2xl border px-4 py-4 text-left transition-transform duration-150 hover:-translate-y-0.5 disabled:opacity-50"
												style={{
													borderColor: `${meta.color}55`,
													backgroundColor: `${meta.color}18`,
												}}>
												<p className="text-base font-semibold" style={{ color: meta.color }}>
													{rating} · {meta.label}
												</p>
												<p className="mt-1 text-sm" style={{ color: "var(--text-primary)" }}>
													{intervalMap[rating]}d
												</p>
											</button>
										);
									})}
								</div>
								{isLoadingNextCard ? (
									<div className="flex items-center justify-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
										<Loader2 className="h-4 w-4 animate-spin" />
										Generating the next review card...
									</div>
								) : null}
							</div>
						) : null}
					</div>
				)}
			</div>
		</div>
	);
}
