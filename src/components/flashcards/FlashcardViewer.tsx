"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MarkdownContent } from "@/components/ai/MarkdownContent";
import { Button } from "@/components/ui/button";

import type { FlashcardCard } from "./types";

interface FlashcardViewerProps {
	cards: FlashcardCard[];
}

function getTextSizeClass(text: string) {
	if (text.length > 200) return "text-sm";
	return "text-base";
}

export function FlashcardViewer({ cards }: FlashcardViewerProps) {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [isFlipped, setIsFlipped] = useState(false);
	const progressBarRef = useRef<HTMLDivElement>(null);

	const currentCard = cards[currentIndex];
	const hasPrev = currentIndex > 0;
	const hasNext = currentIndex < cards.length - 1;
	const progress = useMemo(() => ((currentIndex + 1) / cards.length) * 100, [cards.length, currentIndex]);

	const flip = useCallback(() => {
		setIsFlipped((value) => !value);
	}, []);

	const goToIndex = useCallback(
		(nextIndex: number) => {
			const boundedIndex = Math.max(0, Math.min(cards.length - 1, nextIndex));
			setCurrentIndex((previousIndex) => {
				if (previousIndex !== boundedIndex) {
					setIsFlipped(false);
				}
				return boundedIndex;
			});
		},
		[cards.length],
	);

	const goToNext = useCallback(() => {
		if (!hasNext) return;
		goToIndex(currentIndex + 1);
	}, [currentIndex, goToIndex, hasNext]);

	const goToPrev = useCallback(() => {
		if (!hasPrev) return;
		goToIndex(currentIndex - 1);
	}, [currentIndex, goToIndex, hasPrev]);

	const updateIndexFromProgressPointer = useCallback(
		(clientX: number) => {
			const progressBar = progressBarRef.current;
			if (!progressBar) return;

			const rect = progressBar.getBoundingClientRect();
			if (rect.width <= 0) return;

			const relativeX = Math.min(rect.width, Math.max(0, clientX - rect.left));
			const ratio = relativeX / rect.width;
			const nextIndex = Math.min(cards.length - 1, Math.floor(ratio * cards.length));
			goToIndex(nextIndex);
		},
		[cards.length, goToIndex],
	);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (target) {
				const tagName = target.tagName.toLowerCase();
				const isFormField =
					target.isContentEditable ||
					tagName === "input" ||
					tagName === "textarea" ||
					tagName === "select" ||
					target.getAttribute("role") === "textbox";
				if (isFormField) return;
			}

			if (event.key === "ArrowRight") {
				event.preventDefault();
				goToNext();
				return;
			}
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				goToPrev();
				return;
			}
			if (event.key === " " || event.key === "Enter") {
				event.preventDefault();
				flip();
			}
		};

		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [flip, goToNext, goToPrev]);

	if (!currentCard) return null;

	return (
		<div className="mx-auto w-full max-w-[480px]">
			<p className="mb-2 text-right text-xs" style={{ color: "#666" }}>
				Card {currentIndex + 1} of {cards.length}
			</p>

			<div
				ref={progressBarRef}
				className="mb-4 h-2 w-full overflow-hidden rounded-full bg-[#1a1a1a] touch-none"
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					updateIndexFromProgressPointer(event.clientX);
				}}
				onPointerMove={(event) => {
					if (event.pointerType === "mouse" && (event.buttons & 1) !== 1) return;
					updateIndexFromProgressPointer(event.clientX);
				}}
				onPointerUp={(event) => {
					if (event.currentTarget.hasPointerCapture(event.pointerId)) {
						event.currentTarget.releasePointerCapture(event.pointerId);
					}
				}}
				role="slider"
				aria-label="Flashcard progress"
				aria-valuemin={1}
				aria-valuemax={cards.length}
				aria-valuenow={currentIndex + 1}
				tabIndex={0}
				onKeyDown={(event) => {
					if (event.key === "ArrowRight") {
						event.preventDefault();
						goToIndex(currentIndex + 1);
					}
					if (event.key === "ArrowLeft") {
						event.preventDefault();
						goToIndex(currentIndex - 1);
					}
				}}>
				<div className="h-full rounded-full bg-[#c8c8c8] transition-[width] duration-300" style={{ width: `${progress}%` }} />
			</div>

			<button
				type="button"
				onClick={flip}
				className="relative block min-h-[260px] w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8c8c8c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111]"
				style={{ perspective: "1000px" }}
				aria-label={isFlipped ? "Show question" : "Show answer"}>
				<div
					className="relative min-h-[260px] w-full"
					style={{
						transformStyle: "preserve-3d",
						transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
						transition: "transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
					}}>
					<div
						className="absolute inset-0 flex min-h-[260px] items-center justify-center rounded-xl border p-6 text-center"
						style={{
							backgroundColor: "#1a1a1a",
							borderColor: "#2a2a2a",
							backfaceVisibility: "hidden",
						}}>
						<span className="absolute left-4 top-4 text-xs uppercase tracking-wide" style={{ color: "#555" }}>
							Question
						</span>
						<div className={`w-full max-w-full text-[#f5f5f5] ${getTextSizeClass(currentCard.front)}`}>
							<MarkdownContent content={currentCard.front} className="text-center" />
						</div>
					</div>

					<div
						className="absolute inset-0 flex min-h-[260px] items-center justify-center rounded-xl border p-6 text-center"
						style={{
							backgroundColor: "#161a20",
							borderColor: "#2a2a2a",
							backfaceVisibility: "hidden",
							transform: "rotateY(180deg)",
						}}>
						<span className="absolute left-4 top-4 text-xs uppercase tracking-wide" style={{ color: "#555" }}>
							Answer
						</span>
						<div className={`w-full max-w-full text-[#f5f5f5] ${getTextSizeClass(currentCard.back)}`}>
							<MarkdownContent content={currentCard.back} className="text-center" />
						</div>
					</div>
				</div>
			</button>

			<div className="mt-4 grid grid-cols-3 gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={goToPrev}
					disabled={!hasPrev}
					className="border-[#2a2a2a] bg-transparent text-[#d0d0d0] hover:bg-[#1a1a1a] focus-visible:ring-[#8c8c8c]">
					← Previous
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={flip}
					className="border-[#2a2a2a] bg-transparent text-[#d0d0d0] hover:bg-[#1a1a1a] focus-visible:ring-[#8c8c8c]">
					{isFlipped ? "Show Question" : "Show Answer"}
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={goToNext}
					disabled={!hasNext}
					className="border-[#2a2a2a] bg-transparent text-[#d0d0d0] hover:bg-[#1a1a1a] focus-visible:ring-[#8c8c8c]">
					Next →
				</Button>
			</div>
		</div>
	);
}
