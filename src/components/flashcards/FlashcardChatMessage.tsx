"use client";

import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import type { FlashcardDeckPayload } from "./types";

const FlashcardViewerClient = dynamic(() => import("./FlashcardViewer").then((module) => module.FlashcardViewer), {
	ssr: false,
	loading: () => (
		<div className="grid gap-3 md:grid-cols-2">
			<Skeleton className="h-32 rounded-[14px]" />
			<Skeleton className="h-32 rounded-[14px]" />
		</div>
	),
});

interface FlashcardChatMessageProps {
	deck: FlashcardDeckPayload;
	onOpenDeck?: (deckId: string) => void;
}

export function FlashcardChatMessage({ deck, onOpenDeck }: FlashcardChatMessageProps) {
	return (
		<div className="rounded-xl border border-[#2a2a2a] bg-[#111] p-4">
			<div className="mb-4 flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="truncate text-sm font-semibold text-[#f5f5f5]">{deck.title}</p>
				</div>
				<div className="flex shrink-0 items-center gap-3">
					<span className="text-xs text-[#777]">
						{deck.count} card{deck.count === 1 ? "" : "s"}
					</span>
					{onOpenDeck ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => onOpenDeck(deck.deckId)}
							className="h-6 px-2 text-xs text-[#b0b0b0] hover:bg-[#1a1a1a] hover:text-[#f5f5f5] focus-visible:ring-[#8c8c8c]">
							Open deck
						</Button>
					) : null}
				</div>
			</div>

			<FlashcardViewerClient cards={deck.cards} />
		</div>
	);
}
