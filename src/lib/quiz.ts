export type QuizDifficulty = "easy" | "medium" | "hard";
export type QuizOptionId = "A" | "B" | "C" | "D";

export interface QuizQuestion {
	id: string;
	question: string;
	options: Array<{ id: QuizOptionId; text: string }>;
	correctOption: QuizOptionId;
	explanations: Record<QuizOptionId, string>;
	difficulty: QuizDifficulty;
}

export interface QuizHistoryPayload {
	title: string;
	count: number;
	questions: QuizQuestion[];
}
