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

const DEFAULT_COUNT = 10;
const QUICK_COUNTS = [10, 20, 30, 40] as const;
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

	useEffect(() => {
		if (!open) return;
		setCount(DEFAULT_COUNT);
		setLanguage("auto");
		setCustomInstructions("");
		setError(null);
		setRemainingFlashcards(null);

		// fetch usage so we can cap the per-request max to the user's remaining flashcards
		;(async () => {
			try {
				const res = await fetch("/api/ai/usage");
				if (!res.ok) return
				const stats = await res.json();
				if (!stats || !Array.isArray(stats.flashcardModels)) return
				const primary = stats.flashcardModels.find((m: any) => m.model === PRIMARY_FLASHCARD_MODEL);
				if (!primary || !primary.flashcards) return
				setRemainingFlashcards(Number.isFinite(primary.flashcards.remaining) ? primary.flashcards.remaining : null);
			} catch (e) {
				// ignore and fall back to default limits
			}
		})();
	}, [open]);

	const sourceText = useMemo(() => defaultText?.trim() ?? "", [defaultText]);
	const effectiveMax = useMemo(() => {
		if (remainingFlashcards === null) return AI_LIMITS.FLASHCARD_MAX_PER_REQUEST
		return Math.max(0, Math.min(AI_LIMITS.FLASHCARD_MAX_PER_REQUEST, remainingFlashcards))
	}, [remainingFlashcards])

	const clampedCount = useMemo(() => Math.max(1, Math.min(effectiveMax || 1, Number.isFinite(count) ? count : DEFAULT_COUNT)), [count, effectiveMax]);
	const trimmedInstructions = useMemo(() => customInstructions.trim(), [customInstructions]);
	const canSubmit = sourceText.length > 0 && !isGenerating && (effectiveMax ?? AI_LIMITS.FLASHCARD_MAX_PER_REQUEST) > 0;

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
				className="!top-1/2 !max-w-[640px] !-translate-y-1/2 rounded-[28px] border border-[rgba(255,255,255,0.08)] bg-[#0f1115] p-6 text-[#f5f7fb] shadow-[0_28px_80px_rgba(0,0,0,0.45)]"
				showCloseButton={!isGenerating}>
				<DialogHeader className="space-y-3">
					<div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(145deg,rgba(124,106,255,0.18),rgba(124,106,255,0.05))]">
						<Layers className="h-5 w-5 text-[#d8d1ff]" />
					</div>
					<div>
						<DialogTitle className="text-lg text-[#f5f7fb]">Generate Flashcards</DialogTitle>
						<DialogDescription className="mt-1 text-[#8f97a8]">
							Choose the output language, tune the deck, and add any study emphasis. We’ll also generate a contextual title for the deck.
						</DialogDescription>
					</div>
				</DialogHeader>

				<div className="space-y-4">
					<UsageIndicator model={PRIMARY_FLASHCARD_MODEL} category="flashcard" variant="detailed" />

					<div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
						<section className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4">
							<div className="flex items-start gap-3">
								<div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.04)] text-[#d5dbeb]">
									<Globe2 className="h-4 w-4" />
								</div>
								<div className="min-w-0 flex-1">
									<label htmlFor="flashcard-language" className="text-sm font-medium text-[#eef2ff]">
										Card language
									</label>
									<p className="mt-1 text-xs text-[#8f97a8]">
										Keep the note language or force the cards into a language you want to study in.
									</p>
									<select
										id="flashcard-language"
										value={language}
										onChange={(event) => setLanguage(event.target.value as (typeof LANGUAGE_OPTIONS)[number]["value"])}
										disabled={isGenerating}
										className="mt-3 h-10 w-full rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#0b0d11] px-3 text-sm text-[#f5f7fb] outline-none transition-colors focus:border-[rgba(124,106,255,0.75)]">
										{LANGUAGE_OPTIONS.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
								</div>
							</div>
						</section>

						<section className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4">
							<label htmlFor="flashcard-count" className="text-sm font-medium text-[#eef2ff]">
								Number of cards
							</label>
							<p className="mt-1 text-xs text-[#8f97a8]">Pick a compact drill set or a larger study deck.</p>
							<div className="mt-3 flex items-center justify-center gap-3">
								<span className="text-3xl font-semibold tracking-tight text-[#f5f7fb]">{clampedCount}</span>
							</div>
						</section>
					</div>

					<div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4">
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
											borderColor: isActive ? "rgba(124,106,255,0.85)" : "rgba(255,255,255,0.08)",
											backgroundColor: isActive ? "rgba(124,106,255,0.16)" : "rgba(255,255,255,0.02)",
											color: isActive ? "#e7e1ff" : "#b6bcc9",
										}}>
										{preset} cards
									</button>
								);
							})}
						</div>

						<input
							type="range"
							min={1}
							max={effectiveMax}
							step={1}
							value={clampedCount}
							onChange={(event) => setCount(Number.parseInt(event.target.value, 10))}
							className="mt-4 w-full accent-[#c9baff]"
							disabled={isGenerating || effectiveMax <= 0}
						/>

						<div className="mt-2 flex items-center justify-between text-[11px] text-[#788093]">
							<span>1</span>
							<span>Maximum {effectiveMax} cards per request</span>
							<span>{effectiveMax}</span>
						</div>
					</div>

					<section className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4">
						<div className="flex items-start gap-3">
							<div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.04)] text-[#d5dbeb]">
								<Sparkles className="h-4 w-4" />
							</div>
							<div className="min-w-0 flex-1">
								<label htmlFor="flashcard-instructions" className="text-sm font-medium text-[#eef2ff]">
									Custom instructions
								</label>
								<p className="mt-1 text-xs text-[#8f97a8]">
									Optional guidance for the model, like focusing on formulas, one chapter, or a specific concept.
								</p>
								<textarea
									id="flashcard-instructions"
									value={customInstructions}
									onChange={(event) => setCustomInstructions(event.target.value.slice(0, MAX_CUSTOM_INSTRUCTIONS_LENGTH))}
									disabled={isGenerating}
									rows={3}
									placeholder='Example: Focus on thermodynamics and prioritize conceptual why/how questions.'
									className="mt-3 min-h-[108px] w-full resize-y rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#0b0d11] px-3 py-3 text-sm text-[#f5f7fb] outline-none transition-colors placeholder:text-[#5f6677] focus:border-[rgba(124,106,255,0.75)]"
								/>
								<div className="mt-2 flex items-center justify-between text-[11px] text-[#788093]">
									<span>The AI will use this guidance when choosing cards and the deck title.</span>
									<span>
										{customInstructions.length}/{MAX_CUSTOM_INSTRUCTIONS_LENGTH}
									</span>
								</div>
							</div>
						</div>
					</section>

					<div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(145deg,rgba(124,106,255,0.08),rgba(255,255,255,0.02))] px-4 py-3 text-xs text-[#b7bfd0]">
						{sourceText
							? "The deck will be generated from the current note, including structured content such as formulas and code. If the note is still untitled, we’ll create a meaningful deck title automatically."
							: "No study material was detected in this note yet. Add content to the note before generating flashcards."}
					</div>

					<Button
						type="button"
						onClick={() => void handleGenerate()}
						disabled={!canSubmit}
						className="h-11 w-full rounded-2xl bg-[#ece9ff] text-[#151326] hover:bg-[#f7f5ff] disabled:opacity-50">
						{isGenerating ? (
							<span className="inline-flex items-center gap-2">
								<Loader2 className="h-4 w-4 animate-spin" />
								Generating...
							</span>
						) : (
							"Generate Flashcards"
						)}
					</Button>

					{error ? <p className="text-sm text-red-400">{error}</p> : null}
				</div>
			</DialogContent>
		</Dialog>
	);
}
