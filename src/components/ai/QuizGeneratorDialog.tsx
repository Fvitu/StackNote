"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BrainCircuit, Globe2, Loader2, Sparkles } from "lucide-react";

import { UsageIndicator } from "@/components/ai/UsageIndicator";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { subscribeToAiUsageChanges } from "@/lib/ai-usage-events";
import { AI_LIMITS, PRIMARY_QUIZ_MODEL } from "@/lib/ai-limits";
import type { QuizQuestion } from "@/lib/quiz";
import type { TextModelId } from "@/lib/groq-models";
import { readErrorMessage, readJsonResponse } from "@/lib/http";

interface UsageStats {
	quizModels: Array<{
		model: string;
		requests: {
			used: number;
			limit: number;
			remaining: number;
		};
		questions?: {
			used: number;
			limit: number;
			remaining: number;
		};
	}>;
}

interface QuizGeneratorDialogProps {
	open: boolean;
	model: TextModelId;
	noteTitle?: string;
	currentNoteText: string;
	selectionText: string;
	sessionId?: string | null;
	noteId?: string;
	onClose: () => void;
	onGenerated: (questions: QuizQuestion[]) => void;
}

const LANGUAGE_OPTIONS = [
	{ value: "auto", label: "Auto-detect" },
	{ value: "English", label: "English" },
	{ value: "Spanish", label: "Spanish" },
	{ value: "French", label: "French" },
	{ value: "German", label: "German" },
	{ value: "Portuguese", label: "Portuguese" },
	{ value: "Chinese", label: "Chinese" },
	{ value: "Japanese", label: "Japanese" },
	{ value: "Italian", label: "Italian" },
	{ value: "Russian", label: "Russian" },
	{ value: "Korean", label: "Korean" },
] as const;

type SourceMode = "current" | "selection";

const DEFAULT_COUNT = 10;
const MIN_QUESTION_COUNT = 1;
const QUICK_COUNTS = [5, 10, 15] as const;
const MAX_CUSTOM_INSTRUCTIONS_LENGTH = 300;

export function QuizGeneratorDialog({
	open,
	model,
	noteTitle,
	currentNoteText,
	selectionText,
	sessionId,
	noteId,
	onClose,
	onGenerated,
}: QuizGeneratorDialogProps) {
	const [source, setSource] = useState<SourceMode>("current");
	const [questionCount, setQuestionCount] = useState(DEFAULT_COUNT);
	const [language, setLanguage] = useState<(typeof LANGUAGE_OPTIONS)[number]["value"]>("auto");
	const [customInstructions, setCustomInstructions] = useState("");
	const [isGenerating, setIsGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [remainingQuestions, setRemainingQuestions] = useState<number | null>(null);
	const [remainingRequests, setRemainingRequests] = useState<number | null>(null);

	const syncUsage = useCallback(async () => {
		try {
			const response = await fetch("/api/ai/usage");
			const nextUsage = await readJsonResponse<UsageStats>(response);
			if (!response.ok || !nextUsage) {
				return;
			}

			const primaryUsage = nextUsage.quizModels.find((entry) => entry.model === PRIMARY_QUIZ_MODEL);
			if (!primaryUsage) {
				return;
			}

			setRemainingRequests(Number.isFinite(primaryUsage.requests.remaining) ? primaryUsage.requests.remaining : null);
			setRemainingQuestions(Number.isFinite(primaryUsage.questions?.remaining) ? (primaryUsage.questions?.remaining ?? null) : null);
		} catch {
			setRemainingQuestions(null);
			setRemainingRequests(null);
		}
	}, []);

	useEffect(() => {
		if (!open) {
			return;
		}

		setSource(selectionText.trim() ? "selection" : "current");
		setQuestionCount(DEFAULT_COUNT);
		setLanguage("auto");
		setCustomInstructions("");
		setError(null);
		setRemainingQuestions(null);
		setRemainingRequests(null);

		void syncUsage();
		const unsubscribe = subscribeToAiUsageChanges(() => {
			void syncUsage();
		});

		return () => unsubscribe();
	}, [open, selectionText, syncUsage]);

	const selectedText = useMemo(() => (source === "selection" ? selectionText.trim() : currentNoteText.trim()), [currentNoteText, selectionText, source]);
	const effectiveMaxQuestions = useMemo(() => {
		if (remainingQuestions === null) {
			return AI_LIMITS.QUIZ_MAX_PER_REQUEST;
		}

		return Math.max(0, Math.min(AI_LIMITS.QUIZ_MAX_PER_REQUEST, remainingQuestions));
	}, [remainingQuestions]);
	const clampedQuestionCount = useMemo(
		() => Math.max(MIN_QUESTION_COUNT, Math.min(effectiveMaxQuestions || MIN_QUESTION_COUNT, questionCount)),
		[effectiveMaxQuestions, questionCount],
	);
	const trimmedInstructions = useMemo(() => customInstructions.trim(), [customInstructions]);
	const hasRemainingRequests = remainingRequests === null ? true : remainingRequests > 0;
	const hasRemainingQuestions = effectiveMaxQuestions > 0;
	const questionAvailabilityLabel =
		remainingQuestions === null
			? `Up to ${AI_LIMITS.QUIZ_MAX_PER_REQUEST} questions per request`
			: `${effectiveMaxQuestions} questions remaining in this window`;
	const canGenerate = selectedText.length > 0 && hasRemainingRequests && hasRemainingQuestions && !isGenerating;

	async function handleGenerate() {
		if (!canGenerate) {
			return;
		}

		setIsGenerating(true);
		setError(null);

		try {
			const response = await fetch("/api/ai/quiz", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					content: selectedText,
					noteTitle,
					questionCount: clampedQuestionCount,
					language: language === "auto" ? undefined : language,
					customInstructions: trimmedInstructions || undefined,
					model,
					sessionId: sessionId ?? undefined,
					noteId,
				}),
			});

			if (!response.ok) {
				const message = await readErrorMessage(response, "Failed to generate quiz");
				if (response.status === 429 || response.status === 401) {
					void syncUsage();
					throw new Error(message);
				}

				void syncUsage();
				throw new Error("We couldn't generate a usable quiz this time. Please try again.");
			}

			const payload = (await response.json()) as { questions: QuizQuestion[] };
			onGenerated(payload.questions);
			onClose();
		} catch (generateError) {
			if (generateError instanceof Error && /(limit|quota|unauthorized)/i.test(generateError.message)) {
				setError(generateError.message);
			} else {
				setError("We couldn't generate a usable quiz this time. Please try again.");
			}
		} finally {
			setIsGenerating(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : null)}>
			<DialogContent
				className="!top-1/2 !max-w-[680px] !-translate-y-1/2 !overflow-hidden rounded-[28px] border border-[var(--border-default)] bg-[var(--bg-sidebar)] p-0 text-[var(--text-primary)] shadow-[0_28px_80px_rgba(0,0,0,0.45)]"
				showCloseButton={!isGenerating}>
				<div className="flex max-h-[calc(100vh-4rem)] flex-col bg-[var(--bg-sidebar)]">
					<DialogHeader className="border-b px-6 py-5" style={{ borderColor: "var(--border-default)" }}>
						<div className="flex items-start gap-3">
							<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
								<BrainCircuit className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1 space-y-1">
								<DialogTitle className="text-lg text-[var(--text-primary)]">Generate quiz</DialogTitle>
								<DialogDescription className="text-[var(--text-secondary)]">
									Build a short, focused multiple-choice quiz from your current note or selected excerpt.
								</DialogDescription>
							</div>
						</div>
					</DialogHeader>

					<div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
						<div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
							<UsageIndicator model={PRIMARY_QUIZ_MODEL} category="quiz" variant="detailed" />
							<p className="mt-2 text-xs text-[var(--text-secondary)]">
								{hasRemainingRequests ? questionAvailabilityLabel : "No requests remaining in this window"}
							</p>
						</div>

						<div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
							<section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
								<div className="flex items-start gap-3">
									<div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--bg-hover)] text-[var(--text-secondary)]">
										<Globe2 className="h-4 w-4" />
									</div>
									<div className="min-w-0 flex-1 space-y-3">
										<div>
											<label htmlFor="quiz-source" className="text-sm font-medium text-[var(--text-primary)]">
												Source
											</label>
											<select
												id="quiz-source"
												value={source}
												onChange={(event) => setSource(event.target.value as SourceMode)}
												disabled={isGenerating}
												className="mt-2 h-10 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-hover)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--border-strong)]">
												<option value="current">Current note</option>
												<option value="selection" disabled={!selectionText.trim()}>
													Selection
												</option>
											</select>
										</div>

										<div>
											<label htmlFor="quiz-language" className="text-sm font-medium text-[var(--text-primary)]">
												Language
											</label>
											<select
												id="quiz-language"
												value={language}
												onChange={(event) => setLanguage(event.target.value as (typeof LANGUAGE_OPTIONS)[number]["value"])}
												disabled={isGenerating}
												className="mt-2 h-10 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-hover)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--border-strong)]">
												{LANGUAGE_OPTIONS.map((option) => (
													<option key={option.value} value={option.value}>
														{option.label}
													</option>
												))}
											</select>
										</div>
									</div>
								</div>
							</section>

							<section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
								<label htmlFor="quiz-count" className="text-sm font-medium text-[var(--text-primary)]">
									Number of questions
								</label>
								<p className="mt-1 text-xs text-[var(--text-secondary)]">Maximum {AI_LIMITS.QUIZ_MAX_PER_REQUEST} per request.</p>
								<div className="mt-3 flex items-center justify-center gap-3">
									<span className="text-4xl font-semibold tracking-tight text-[var(--text-primary)]">{clampedQuestionCount}</span>
								</div>
							</section>
						</div>

						<div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
							<div className="flex flex-wrap gap-2">
								{QUICK_COUNTS.map((preset) => {
									const isActive = clampedQuestionCount === preset;
									const isDisabled = isGenerating || preset > effectiveMaxQuestions;

									return (
										<button
											key={preset}
											type="button"
											onClick={() => setQuestionCount(preset)}
											disabled={isDisabled}
											className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
											style={{
												borderColor: isActive ? "var(--border-strong)" : "var(--border-default)",
												backgroundColor: isActive ? "var(--bg-hover)" : "transparent",
												color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
											}}>
											{preset} questions
										</button>
									);
								})}
							</div>

							<input
								id="quiz-count"
								type="range"
								min={MIN_QUESTION_COUNT}
								max={Math.max(MIN_QUESTION_COUNT, effectiveMaxQuestions)}
								step={1}
								value={clampedQuestionCount}
								onChange={(event) => setQuestionCount(Number.parseInt(event.target.value, 10))}
								className="mt-4 w-full"
								style={{ accentColor: "color-mix(in oklab, var(--ring) 50%, transparent)" }}
								disabled={isGenerating || effectiveMaxQuestions <= 0}
							/>

							<div className="mt-2 flex items-center justify-between text-[11px] text-[var(--text-tertiary)]">
								<span>{MIN_QUESTION_COUNT}</span>
								<span>Maximum {Math.max(MIN_QUESTION_COUNT, effectiveMaxQuestions)} questions per request</span>
								<span>{Math.max(MIN_QUESTION_COUNT, effectiveMaxQuestions)}</span>
							</div>
						</div>

						<section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
							<div className="flex items-start gap-3">
								<div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--bg-hover)] text-[var(--text-secondary)]">
									<Sparkles className="h-4 w-4" />
								</div>
								<div className="min-w-0 flex-1">
									<label htmlFor="quiz-instructions" className="text-sm font-medium text-[var(--text-primary)]">
										Custom instructions
									</label>
									<p className="mt-1 text-xs text-[var(--text-secondary)]">Optional guidance for question style or topic focus.</p>
									<textarea
										id="quiz-instructions"
										value={customInstructions}
										onChange={(event) => setCustomInstructions(event.target.value.slice(0, MAX_CUSTOM_INSTRUCTIONS_LENGTH))}
										disabled={isGenerating}
										rows={3}
										placeholder="Example: Emphasize conceptual mistakes and include one hard question."
										className="mt-3 min-h-[108px] w-full resize-y rounded-2xl border border-[var(--border-default)] bg-[var(--bg-hover)] px-3 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--border-strong)]"
									/>
									<div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-[var(--text-tertiary)]">
										<span>The AI will follow this guidance while generating questions.</span>
										<span>
											{customInstructions.length}/{MAX_CUSTOM_INSTRUCTIONS_LENGTH}
										</span>
									</div>
								</div>
							</div>
						</section>

						<div
							className="rounded-2xl border border-[var(--border-default)] px-4 py-3 text-xs text-[var(--text-secondary)]"
							style={{ backgroundColor: "var(--bg-hover)" }}>
							{selectedText
								? `Quiz questions will be generated from ${source === "selection" ? "the selected text" : "the current note"}${noteTitle?.trim() ? ` (${noteTitle.trim()})` : ""}.`
								: "No study material was detected. Add content to the note or select text before generating a quiz."}
						</div>

						<div className="pt-1">
							<Button
								type="button"
								variant="outline"
								onClick={() => void handleGenerate()}
								disabled={!canGenerate}
								className="h-11 w-full rounded-2xl border-[var(--border-default)] bg-[var(--bg-active)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50">
								{isGenerating ? (
									<span className="inline-flex items-center gap-2">
										<Loader2 className="h-4 w-4 animate-spin" />
										Generating...
									</span>
								) : (
									"Generate quiz"
								)}
							</Button>
							{error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
