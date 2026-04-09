export interface FlashcardCard {
	id: string;
	front: string;
	back: string;
}

export interface FlashcardDeckPayload {
	deckId: string;
	title: string;
	cards: FlashcardCard[];
	count: number;
}
