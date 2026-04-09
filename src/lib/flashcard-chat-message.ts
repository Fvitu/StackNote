import type { FlashcardDeckPayload } from "@/components/flashcards/types";

const FLASHCARD_MESSAGE_OPEN = "<stacknote-flashcards>";
const FLASHCARD_MESSAGE_CLOSE = "</stacknote-flashcards>";

export function serializeFlashcardDeckMessage(deck: FlashcardDeckPayload) {
	return [`Generated ${deck.count} flashcards for "${deck.title}".`, `${FLASHCARD_MESSAGE_OPEN}${JSON.stringify(deck)}${FLASHCARD_MESSAGE_CLOSE}`].join(
		"\n\n",
	);
}

export function parseFlashcardDeckMessage(content: string): FlashcardDeckPayload | null {
	const start = content.indexOf(FLASHCARD_MESSAGE_OPEN);
	const end = content.indexOf(FLASHCARD_MESSAGE_CLOSE);

	if (start === -1 || end === -1 || end <= start) {
		return null;
	}

	const serialized = content.slice(start + FLASHCARD_MESSAGE_OPEN.length, end).trim();

	if (!serialized) {
		return null;
	}

	try {
		const parsed = JSON.parse(serialized) as FlashcardDeckPayload;
		if (
			!parsed ||
			typeof parsed.deckId !== "string" ||
			typeof parsed.title !== "string" ||
			!Array.isArray(parsed.cards) ||
			typeof parsed.count !== "number"
		) {
			return null;
		}

		return {
			deckId: parsed.deckId,
			title: parsed.title,
			count: parsed.count,
			cards: parsed.cards.filter((card): card is FlashcardDeckPayload["cards"][number] =>
				Boolean(card && typeof card.id === "string" && typeof card.front === "string" && typeof card.back === "string"),
			),
		};
	} catch {
		return null;
	}
}
