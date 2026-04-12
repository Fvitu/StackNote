import type { CardState } from "@/lib/fsrs";

export interface PlannerStudyCard {
	id: string;
	deckId: string;
	sessionId: string;
	examId: string;
	examTitle: string;
	front: string;
	back: string;
	stability: number;
	difficulty: number;
	reps: number;
	lapses: number;
	state: CardState;
	dueDate: string;
}

export interface PlannerStudyQueueExam {
	examId: string;
	examTitle: string;
	deckId: string;
	sessionId: string;
	remainingCount: number;
	queuedCards: PlannerStudyCard[];
}

export interface PlannerStudySessionPayload {
	title: string;
	currentCard: PlannerStudyCard | null;
	queue: PlannerStudyQueueExam[];
}

export interface PlannerStudyAdvancePayload {
	currentCard: PlannerStudyCard | null;
	queue: PlannerStudyQueueExam[];
}

function isPlannerStudyCard(value: unknown): value is PlannerStudyCard {
	if (!value || typeof value !== "object") {
		return false;
	}

	const candidate = value as Partial<PlannerStudyCard>;
	return (
		typeof candidate.id === "string" &&
		typeof candidate.deckId === "string" &&
		typeof candidate.sessionId === "string" &&
		typeof candidate.examId === "string" &&
		typeof candidate.examTitle === "string" &&
		typeof candidate.front === "string" &&
		typeof candidate.back === "string" &&
		typeof candidate.stability === "number" &&
		typeof candidate.difficulty === "number" &&
		typeof candidate.reps === "number" &&
		typeof candidate.lapses === "number" &&
		typeof candidate.state === "number" &&
		candidate.state >= 0 &&
		candidate.state <= 3 &&
		typeof candidate.dueDate === "string"
	);
}

export function isPlannerStudyQueueExam(value: unknown): value is PlannerStudyQueueExam {
	if (!value || typeof value !== "object") {
		return false;
	}

	const candidate = value as Partial<PlannerStudyQueueExam>;
	return (
		typeof candidate.examId === "string" &&
		typeof candidate.examTitle === "string" &&
		typeof candidate.deckId === "string" &&
		typeof candidate.sessionId === "string" &&
		typeof candidate.remainingCount === "number" &&
		Array.isArray(candidate.queuedCards) &&
		candidate.queuedCards.every(isPlannerStudyCard)
	);
}

export function isPlannerStudySessionPayload(value: unknown): value is PlannerStudySessionPayload {
	if (!value || typeof value !== "object") {
		return false;
	}

	const candidate = value as Partial<PlannerStudySessionPayload>;
	return (
		typeof candidate.title === "string" &&
		(candidate.currentCard === null || candidate.currentCard === undefined || isPlannerStudyCard(candidate.currentCard)) &&
		Array.isArray(candidate.queue) &&
		candidate.queue.every(isPlannerStudyQueueExam)
	);
}

export function isPlannerStudyAdvancePayload(value: unknown): value is PlannerStudyAdvancePayload {
	if (!value || typeof value !== "object") {
		return false;
	}

	const candidate = value as Partial<PlannerStudyAdvancePayload>;
	return (
		(candidate.currentCard === null || candidate.currentCard === undefined || isPlannerStudyCard(candidate.currentCard)) &&
		Array.isArray(candidate.queue) &&
		candidate.queue.every(isPlannerStudyQueueExam)
	);
}
