"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain } from "lucide-react";

import { MarkdownContent } from "@/components/ai/MarkdownContent";
import { Button } from "@/components/ui/button";
import type { QuizOptionId, QuizQuestion } from "@/lib/quiz";

interface QuizGameProps {
	title?: string;
	questions: QuizQuestion[];
	onExit: () => void;
}

type AnswerState = {
	questionId: string;
	selectedOption: QuizOptionId;
};

function difficultyColor(difficulty: QuizQuestion["difficulty"]) {
	switch (difficulty) {
		case "easy":
			return "#22c55e";
		case "medium":
			return "#f59e0b";
		case "hard":
			return "#ef4444";
	}
}

export function QuizGame({ title, questions, onExit }: QuizGameProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [answers, setAnswers] = useState<AnswerState[]>([]);
	const [activeIndex, setActiveIndex] = useState(0);
	const [reviewWrongOnly, setReviewWrongOnly] = useState(false);
	const [reviewIndices, setReviewIndices] = useState<number[]>([]);
	const [showResults, setShowResults] = useState(false);
	const [finishAttempted, setFinishAttempted] = useState(false);
	const [isFullscreen, setIsFullscreen] = useState(false);

	const currentQuestionIndex = reviewWrongOnly ? (reviewIndices[activeIndex] ?? 0) : activeIndex;
	const currentQuestion = questions[currentQuestionIndex];
	const currentAnswer = answers.find((answer) => answer.questionId === currentQuestion?.id);
	const isAnswered = Boolean(currentAnswer);
	const answeredQuestionIds = useMemo(() => new Set(answers.map((answer) => answer.questionId)), [answers]);
	const unansweredIndices = useMemo(
		() => questions.map((question, index) => (answeredQuestionIds.has(question.id) ? -1 : index)).filter((index) => index >= 0),
		[answeredQuestionIds, questions],
	);
	const correctCount = answers.filter((answer) => {
		const question = questions.find((item) => item.id === answer.questionId);
		return question?.correctOption === answer.selectedOption;
	}).length;
	const wrongIndices = useMemo(() => {
		return questions
			.map((question, index) => {
				const answer = answers.find((item) => item.questionId === question.id);
				return answer && answer.selectedOption !== question.correctOption ? index : -1;
			})
			.filter((value) => value >= 0);
	}, [answers, questions]);

	const goToPrevious = useCallback(() => {
		if (activeIndex <= 0) {
			return;
		}

		setFinishAttempted(false);
		setActiveIndex((index) => index - 1);
	}, [activeIndex]);

	const goToNext = useCallback(() => {
		const maxIndex = reviewWrongOnly ? reviewIndices.length - 1 : questions.length - 1;
		if (activeIndex < maxIndex) {
			setFinishAttempted(false);
			setActiveIndex((index) => index + 1);
			return;
		}

		if (reviewWrongOnly) {
			setReviewWrongOnly(false);
			setShowResults(true);
			setFinishAttempted(false);
			return;
		}

		if (unansweredIndices.length === 0) {
			setShowResults(true);
			setFinishAttempted(false);
			return;
		}

		setFinishAttempted(true);
	}, [activeIndex, questions.length, reviewIndices.length, reviewWrongOnly, unansweredIndices.length]);

	const toggleFullscreen = useCallback(async () => {
		if (typeof document === "undefined") {
			return;
		}

		try {
			if (document.fullscreenElement) {
				await document.exitFullscreen();
				return;
			}

			await containerRef.current?.requestFullscreen();
		} catch (error) {
			console.error("Failed to toggle quiz fullscreen", error);
		}
	}, []);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!currentQuestion) {
				return;
			}

			if (event.key === "Escape") {
				event.preventDefault();
				onExit();
				return;
			}

			const optionMap: Record<string, QuizOptionId> = {
				a: "A",
				b: "B",
				c: "C",
				d: "D",
			};

			const nextOption = optionMap[event.key.toLowerCase()];
			if (nextOption && !isAnswered) {
				event.preventDefault();
				setAnswers((previousAnswers) => [...previousAnswers, { questionId: currentQuestion.id, selectedOption: nextOption }]);
				return;
			}

			if (event.key === "ArrowLeft") {
				event.preventDefault();
				goToPrevious();
				return;
			}

			if (event.key === "Enter" || event.key === "ArrowRight") {
				event.preventDefault();
				goToNext();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [currentQuestion, goToNext, goToPrevious, isAnswered, onExit]);

	useEffect(() => {
		const handleFullscreenChange = () => {
			setIsFullscreen(Boolean(document.fullscreenElement));
		};

		handleFullscreenChange();
		document.addEventListener("fullscreenchange", handleFullscreenChange);
		return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
	}, []);

	function startWrongAnswerReview() {
		setReviewIndices(wrongIndices);
		setReviewWrongOnly(true);
		setActiveIndex(0);
		setShowResults(false);
		setFinishAttempted(false);
	}

	function jumpToFirstIncomplete() {
		if (unansweredIndices.length === 0) {
			return;
		}

		setFinishAttempted(false);
		setActiveIndex(unansweredIndices[0] ?? 0);
	}

	function resetQuiz() {
		setAnswers([]);
		setActiveIndex(0);
		setReviewWrongOnly(false);
		setReviewIndices([]);
		setShowResults(false);
		setFinishAttempted(false);
	}

	if (!currentQuestion) {
		return null;
	}

	const progressDots = reviewWrongOnly ? reviewIndices : questions.map((_, index) => index);
	const isLastQuestion = reviewWrongOnly ? activeIndex >= reviewIndices.length - 1 : activeIndex >= questions.length - 1;
	const showIncompletePrompt = !reviewWrongOnly && isLastQuestion && unansweredIndices.length > 0;

	// Determine label and style for the Next button. Keep "Next question" as gray (outline)
	// and keep "View results" (final results) as the violet primary button.
	const nextButtonLabel = reviewWrongOnly
		? isLastQuestion
			? "Back to results"
			: "Next question"
		: isLastQuestion
			? unansweredIndices.length === 0
				? "View results"
				: "Finish quiz"
			: "Next question";
	const nextButtonIsGray = nextButtonLabel === "Next question";

	if (showResults) {
		const difficultyTotals = {
			easy: questions.filter((question) => question.difficulty === "easy").length,
			medium: questions.filter((question) => question.difficulty === "medium").length,
			hard: questions.filter((question) => question.difficulty === "hard").length,
		};
		const difficultyCorrect = {
			easy: questions.filter(
				(question) =>
					question.difficulty === "easy" && answers.find((answer) => answer.questionId === question.id)?.selectedOption === question.correctOption,
			).length,
			medium: questions.filter(
				(question) =>
					question.difficulty === "medium" && answers.find((answer) => answer.questionId === question.id)?.selectedOption === question.correctOption,
			).length,
			hard: questions.filter(
				(question) =>
					question.difficulty === "hard" && answers.find((answer) => answer.questionId === question.id)?.selectedOption === question.correctOption,
			).length,
		};
		const percentage = Math.round((correctCount / Math.max(questions.length, 1)) * 100);

		return (
			<div ref={containerRef} className="flex h-full flex-col overflow-y-auto p-4">
				<div
					className="rounded-[24px] border px-6 py-8 text-center"
					style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
					<h2 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
						Quiz complete!
					</h2>
					<p className="mt-4 text-4xl font-semibold" style={{ color: "var(--text-primary)" }}>
						{correctCount} / {questions.length}
					</p>
					<p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
						{percentage}%
					</p>
					<div className="mt-6 h-3 overflow-hidden rounded-full" style={{ backgroundColor: "var(--bg-hover)" }}>
						<div className="h-full" style={{ width: `${percentage}%`, backgroundColor: "var(--sn-accent)" }} />
					</div>

					<div className="mt-6 grid gap-3 text-left md:grid-cols-3">
						{(["easy", "medium", "hard"] as const).map((difficulty) => (
							<div
								key={difficulty}
								className="rounded-2xl border px-4 py-3"
								style={{ backgroundColor: "var(--bg-sidebar)", borderColor: "var(--border-default)" }}>
								<p className="text-sm font-medium capitalize" style={{ color: "var(--text-primary)" }}>
									{difficulty}
								</p>
								<p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
									{difficultyCorrect[difficulty]} / {difficultyTotals[difficulty]}
								</p>
							</div>
						))}
					</div>

					<div className="mt-8 flex flex-wrap justify-center gap-3">
						<Button
							type="button"
							variant="outline"
							onClick={startWrongAnswerReview}
							disabled={wrongIndices.length === 0}
							className="border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
							Review wrong answers
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={resetQuiz}
							className="border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
							Try again
						</Button>
						<Button type="button" onClick={onExit} className="bg-[var(--sn-accent)] text-white hover:bg-[#8f7fff]">
							Done
						</Button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div ref={containerRef} className="flex h-full flex-col overflow-hidden">
			<div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border-default)" }}>
				<div className="min-w-0">
					<p className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
						Quiz — {title || "Study material"}
					</p>
					<p className="text-xs" style={{ color: "var(--text-secondary)" }}>
						{reviewWrongOnly ? `Wrong answers ${activeIndex + 1}/${reviewIndices.length}` : `${activeIndex + 1}/${questions.length}`}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => void toggleFullscreen()}
						aria-pressed={isFullscreen}
						title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
						className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
							isFullscreen ? "bg-[var(--bg-hover)] text-[var(--sn-accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
						}`}>
						<Brain className="h-4 w-4" />
					</button>
					<button
						type="button"
						onClick={onExit}
						className="rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-[var(--bg-hover)]"
						style={{ color: "var(--text-secondary)" }}>
						Exit
					</button>
				</div>
			</div>

			<div className="flex gap-1 px-4 py-3">
				{progressDots.map((index, progressIndex) => {
					const question = questions[index];
					const answer = answers.find((item) => item.questionId === question.id);
					const isCorrect = answer?.selectedOption === question.correctOption;
					const isCurrent = reviewWrongOnly ? progressIndex === activeIndex : index === currentQuestionIndex;

					return (
						<div
							key={question.id}
							className={`h-2 flex-1 rounded-full ${isCurrent ? "pulse" : ""}`}
							style={{
								backgroundColor: !answer
									? isCurrent
										? "var(--sn-accent)"
										: finishAttempted && !reviewWrongOnly
											? "rgba(245,158,11,0.55)"
											: "rgba(255,255,255,0.15)"
									: isCorrect
										? "#22c55e"
										: "#ef4444",
							}}
						/>
					);
				})}
			</div>

			{!reviewWrongOnly ? (
				<div className="px-4 pb-1">
					<p className="text-xs" style={{ color: unansweredIndices.length === 0 ? "#22c55e" : "var(--text-secondary)" }}>
						{unansweredIndices.length === 0
							? "All questions answered. Go to the end and open your results."
							: `Incomplete questions: ${unansweredIndices.map((index) => index + 1).join(", ")}`}
					</p>
				</div>
			) : null}

			<div className="flex-1 overflow-y-auto p-4">
				<div className="rounded-[24px] border p-5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
					<div className="flex items-center justify-between gap-3">
						<p className="text-sm" style={{ color: "var(--text-secondary)" }}>
							Question {currentQuestionIndex + 1}
						</p>
						<div className="flex items-center gap-2">
							<span
								className="rounded-full px-2 py-0.5 text-xs capitalize"
								style={{
									backgroundColor: `${difficultyColor(currentQuestion.difficulty)}20`,
									color: difficultyColor(currentQuestion.difficulty),
								}}>
								{currentQuestion.difficulty}
							</span>
						</div>
					</div>

					<MarkdownContent content={currentQuestion.question} className="mt-4 text-xl font-semibold leading-8 text-[var(--text-primary)] [&_p]:m-0" />

					<div className="mt-6 space-y-3">
						{currentQuestion.options.map((option) => {
							const isSelected = currentAnswer?.selectedOption === option.id;
							const isCorrect = currentQuestion.correctOption === option.id;
							const showFeedback = isAnswered || reviewWrongOnly;
							const borderColor = showFeedback
								? isCorrect
									? "#22c55e"
									: isSelected
										? "#ef4444"
										: "var(--border-default)"
								: "var(--border-default)";
							const backgroundColor = showFeedback
								? isCorrect
									? "rgba(34,197,94,0.15)"
									: isSelected
										? "rgba(239,68,68,0.15)"
										: "var(--bg-sidebar)"
								: "var(--bg-sidebar)";

							return (
								<button
									key={option.id}
									type="button"
									onClick={() =>
										!isAnswered &&
										setAnswers((previousAnswers) => [...previousAnswers, { questionId: currentQuestion.id, selectedOption: option.id }])
									}
									disabled={isAnswered}
									className="flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left transition-colors disabled:cursor-default"
									style={{ borderColor, backgroundColor }}>
									<div className="min-w-0 flex-1 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
										<MarkdownContent content={`${option.id} ${option.text}`} className="[&_p]:m-0" />
									</div>
									{showFeedback && isCorrect ? <span style={{ color: "#22c55e" }}>✓</span> : null}
									{showFeedback && isSelected && !isCorrect ? <span style={{ color: "#ef4444" }}>✗</span> : null}
								</button>
							);
						})}
					</div>

					{isAnswered || reviewWrongOnly ? (
						<div className="mt-5 rounded-2xl border p-4" style={{ backgroundColor: "var(--bg-sidebar)", borderColor: "var(--border-default)" }}>
							<p
								className="text-sm font-medium"
								style={{ color: currentAnswer?.selectedOption === currentQuestion.correctOption ? "#22c55e" : "#ef4444" }}>
								{currentAnswer?.selectedOption === currentQuestion.correctOption ? "Correct!" : "Incorrect"}
							</p>
							{currentAnswer ? (
								<MarkdownContent
									content={currentQuestion.explanations[currentAnswer.selectedOption]}
									className="mt-2 text-sm leading-6 text-[var(--text-secondary)] [&_p]:m-0"
								/>
							) : null}
							{currentAnswer?.selectedOption !== currentQuestion.correctOption ? (
								<MarkdownContent
									content={currentQuestion.explanations[currentQuestion.correctOption]}
									className="mt-2 text-sm leading-6 text-[var(--text-secondary)] [&_p]:m-0"
								/>
							) : null}
						</div>
					) : null}

					{showIncompletePrompt && finishAttempted ? (
						<div
							className="mt-5 rounded-2xl border px-4 py-3 text-sm"
							style={{ backgroundColor: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.45)", color: "#fcd34d" }}>
							Answer all questions to view the results.
						</div>
					) : null}

					<div className="mt-5 flex flex-wrap items-center justify-between gap-3">
						<Button
							type="button"
							variant="outline"
							onClick={goToPrevious}
							disabled={activeIndex <= 0}
							className="border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
							Previous question
						</Button>

						<div className="flex flex-wrap items-center justify-end gap-2">
							<Button
								type="button"
								onClick={goToNext}
								variant={nextButtonIsGray ? "outline" : undefined}
								className={
									nextButtonIsGray
										? "border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
										: "bg-[var(--sn-accent)] text-white hover:bg-[#8f7fff]"
								}>
								{nextButtonLabel}
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
