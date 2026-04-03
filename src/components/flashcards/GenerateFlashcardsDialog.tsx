"use client";

import { useEffect, useMemo, useState } from "react";
import { Globe2, Layers, Loader2, Sparkles } from "lucide-react";

import { UsageIndicator } from "@/components/ai/UsageIndicator";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AI_LIMITS, PRIMARY_FLASHCARD_MODEL } from "@/lib/ai-limits";
import { readErrorMessage, readJsonResponse } from "@/lib/http";

import type { FlashcardDeckPayload } from "./types";

interface GenerateFlashcardsDialogProps {
	open: boolean;
	onClose: () => void;
	onGenerated: (deck: FlashcardDeckPayload) => void;
	defaultText?: string;
	defaultTitle?: string;
	noteId?: string;
	sessionId?: string;
}

interface UsageStats {
	flashcardModels: Array<{
		model: string;
		requests: {
			used: number;
			limit: number;
			remaining: number;
		};
		flashcards?: {
			used: number;
			limit: number;
			remaining: number;
		};
	}>;
}

const DEFAULT_COUNT = 10;
const QUICK_COUNTS = [5, 10, 15, 20] as const;
const LANGUAGE_OPTIONS = [
	{ value: "auto", label: "Auto-detect" },
	{ value: "English", label: "English" },
	{ value: "Spanish", label: "Spanish" },
	{ value: "Portuguese", label: "Portuguese" },
	{ value: "French", label: "French" },
	{ value: "German", label: "German" },
	{ value: "Italian", label: "Italian" },
	{ value: "Japanese", label: "Japanese" },
] as const;
const MAX_CUSTOM_INSTRUCTIONS_LENGTH = 300;

export function GenerateFlashcardsDialog({ open, onClose, onGenerated, defaultText, defaultTitle, noteId, sessionId }: GenerateFlashcardsDialogProps) {
	const [count, setCount] = useState(DEFAULT_COUNT);
	const [language, setLanguage] = useState<(typeof LANGUAGE_OPTIONS)[number]["value"]>("auto");
	const [customInstructions, setCustomInstructions] = useState("");
	const [isGenerating, setIsGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [remainingFlashcards, setRemainingFlashcards] = useState<number | null>(null);
	const [remainingRequests, setRemainingRequests] = useState<number | null>(null);

	useEffect(() => {
		if (!open) return;
		setCount(DEFAULT_COUNT);
		setLanguage("auto");
		setCustomInstructions("");
		setError(null);
		setRemainingFlashcards(null);
		setRemainingRequests(null);

		(async () => {
			try {
				const res = await fetch("/api/ai/usage");
				const stats = await readJsonResponse<UsageStats>(res);
				if (!res.ok || !stats) return;
				if (!stats || !Array.isArray(stats.flashcardModels)) return;
				const primary = stats.flashcardModels.find((m) => m.model === PRIMARY_FLASHCARD_MODEL);
				if (!primary) return;
				if (primary.flashcards) {
					setRemainingFlashcards(Number.isFinite(primary.flashcards.remaining) ? primary.flashcards.remaining : null);
				}
				setRemainingRequests(Number.isFinite(primary.requests.remaining) ? primary.requests.remaining : null);
			} catch {
				// ignore and fall back to default limits
			}
		})();
	}, [open]);

	const sourceText = useMemo(() => defaultText?.trim() ?? "", [defaultText]);
	const effectiveMax = useMemo(() => {
		if (remainingFlashcards === null) return AI_LIMITS.FLASHCARD_MAX_PER_REQUEST;
		return Math.max(0, Math.min(AI_LIMITS.FLASHCARD_MAX_PER_REQUEST, remainingFlashcards));
	}, [remainingFlashcards]);

	const clampedCount = useMemo(() => Math.max(1, Math.min(effectiveMax || 1, Number.isFinite(count) ? count : DEFAULT_COUNT)), [count, effectiveMax]);
	const trimmedInstructions = useMemo(() => customInstructions.trim(), [customInstructions]);
	const hasRemainingRequests = remainingRequests === null ? true : remainingRequests > 0;
	const canSubmit = sourceText.length > 0 && !isGenerating && hasRemainingRequests && (effectiveMax ?? AI_LIMITS.FLASHCARD_MAX_PER_REQUEST) > 0;

	const handleGenerate = async () => {
		if (!canSubmit) return;

		setIsGenerating(true);
		setError(null);

		try {
			const response = await fetch("/api/ai/flashcards", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					source: noteId ? "note" : "selection",
					text: sourceText,
					noteId,
					titleHint: defaultTitle?.trim() || undefined,
					sessionId,
					count: clampedCount,
					language: language === "auto" ? undefined : language,
					instructions: trimmedInstructions || undefined,
				}),
			});

			const data = await readJsonResponse<FlashcardDeckPayload>(response);
			if (!response.ok || !data) {
				throw new Error(await readErrorMessage(response, "Failed to generate flashcards"));
			}

			onGenerated(data);
			onClose();
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : "Failed to generate flashcards");
		} finally {
			setIsGenerating(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : null)}>
			<DialogContent
				className="!top-1/2 !max-w-[680px] !-translate-y-1/2 !overflow-hidden rounded-[28px] border border-[var(--border-default)] bg-[var(--bg-sidebar)] p-0 text-[var(--text-primary)] shadow-[0_28px_80px_rgba(0,0,0,0.45)]"
				showCloseButton={!isGenerating}>
				<div className="flex max-h-[calc(100vh-4rem)] flex-col bg-[var(--bg-sidebar)]">
					<DialogHeader className="border-b px-6 py-5" style={{ borderColor: "var(--border-default)" }}>
						<div className="flex items-start gap-3">
							<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
								<Layers className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1 space-y-1">
								<DialogTitle className="text-lg text-[var(--text-primary)]">Generate flashcards</DialogTitle>
								<DialogDescription className="text-[var(--text-secondary)]">
									Choose the language, adjust the deck size, and add any study emphasis. We’ll generate a contextual title too.
								</DialogDescription>
							</div>
						</div>
					</DialogHeader>

					<div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
						<div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
							<UsageIndicator model={PRIMARY_FLASHCARD_MODEL} category="flashcard" variant="detailed" />
							<p className="mt-2 text-xs text-[var(--text-secondary)]">
								{hasRemainingRequests ? "Requests available in this window" : "No requests remaining in this window"}
							</p>
						</div>

						<div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
							<section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
								<div className="flex items-start gap-3">
									<div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--bg-hover)] text-[var(--text-secondary)]">
										<Globe2 className="h-4 w-4" />
									</div>
									<div className="min-w-0 flex-1">
										<label htmlFor="flashcard-language" className="text-sm font-medium text-[var(--text-primary)]">
											Card language
										</label>
										<p className="mt-1 text-xs text-[var(--text-secondary)]">
											Keep the note language or force the cards into a language you want to study in.
										</p>
										<select
											id="flashcard-language"
											value={language}
											onChange={(event) => setLanguage(event.target.value as (typeof LANGUAGE_OPTIONS)[number]["value"])}
											disabled={isGenerating}
											className="mt-3 h-10 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-hover)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--border-strong)]">
											{LANGUAGE_OPTIONS.map((option) => (
												<option key={option.value} value={option.value}>
													{option.label}
												</option>
											))}
										</select>
									</div>
								</div>
							</section>

							<section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
								<label htmlFor="flashcard-count" className="text-sm font-medium text-[var(--text-primary)]">
									Number of cards
								</label>
								<p className="mt-1 text-xs text-[var(--text-secondary)]">
									Pick a compact drill set or a larger study deck. Maximum {AI_LIMITS.FLASHCARD_MAX_PER_REQUEST} per request.
								</p>
								<div className="mt-3 flex items-center justify-center gap-3">
									<span className="text-4xl font-semibold tracking-tight text-[var(--text-primary)]">{clampedCount}</span>
								</div>
							</section>
						</div>

						<div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
							<div className="flex flex-wrap gap-2">
								{QUICK_COUNTS.map((preset) => {
									const isActive = clampedCount === preset;
									const isDisabled = isGenerating || (effectiveMax !== undefined && preset > effectiveMax);
									return (
										<button
											key={preset}
											type="button"
											onClick={() => setCount(preset)}
											disabled={isDisabled}
											className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
											style={{
												borderColor: isActive ? "var(--border-strong)" : "var(--border-default)",
												backgroundColor: isActive ? "var(--bg-hover)" : "transparent",
												color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
											}}>
											{preset} cards
										</button>
									);
								})}
							</div>

							<input
								type="range"
								min={1}
								max={Math.max(1, effectiveMax)}
								step={1}
								value={clampedCount}
								onChange={(event) => setCount(Number.parseInt(event.target.value, 10))}
								className="mt-4 w-full"
								style={{ accentColor: "color-mix(in oklab, var(--ring) 50%, transparent)" }}
								disabled={isGenerating || effectiveMax <= 0}
							/>

							<div className="mt-2 flex items-center justify-between text-[11px] text-[var(--text-tertiary)]">
								<span>1</span>
								<span>Maximum {Math.max(1, effectiveMax)} cards per request</span>
								<span>{Math.max(1, effectiveMax)}</span>
							</div>
						</div>

						<section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
							<div className="flex items-start gap-3">
								<div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--bg-hover)] text-[var(--text-secondary)]">
									<Sparkles className="h-4 w-4" />
								</div>
								<div className="min-w-0 flex-1">
									<label htmlFor="flashcard-instructions" className="text-sm font-medium text-[var(--text-primary)]">
										Custom instructions
									</label>
									<p className="mt-1 text-xs text-[var(--text-secondary)]">
										Optional guidance for the model, like focusing on formulas, one chapter, or a specific concept.
									</p>
									<textarea
										id="flashcard-instructions"
										value={customInstructions}
										onChange={(event) => setCustomInstructions(event.target.value.slice(0, MAX_CUSTOM_INSTRUCTIONS_LENGTH))}
										disabled={isGenerating}
										rows={3}
										placeholder="Example: Focus on thermodynamics and prioritize conceptual why/how questions."
										className="mt-3 min-h-[108px] w-full resize-y rounded-2xl border border-[var(--border-default)] bg-[var(--bg-hover)] px-3 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--border-strong)]"
									/>
									<div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-[var(--text-tertiary)]">
										<span>The AI will use this guidance when choosing cards and the deck title.</span>
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
							{sourceText
								? "The deck will be generated from the current note, including structured content such as formulas and code. If the note is still untitled, we’ll create a meaningful deck title automatically."
								: "No study material was detected in this note yet. Add content to the note before generating flashcards."}
						</div>

						<div className="pt-1">
							<Button
								type="button"
								variant="outline"
								onClick={() => void handleGenerate()}
								disabled={!canSubmit}
								className="h-11 w-full rounded-2xl border-[var(--border-default)] bg-[var(--bg-active)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50">
								{isGenerating ? (
									<span className="inline-flex items-center gap-2">
										<Loader2 className="h-4 w-4 animate-spin" />
										Generating...
									</span>
								) : (
									"Generate flashcards"
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
