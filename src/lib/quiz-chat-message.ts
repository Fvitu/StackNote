import type { QuizHistoryPayload, QuizOptionId, QuizQuestion } from "@/lib/quiz";

const QUIZ_MESSAGE_OPEN = "<stacknote-quiz>";
const QUIZ_MESSAGE_CLOSE = "</stacknote-quiz>";
const QUIZ_OPTION_IDS: QuizOptionId[] = ["A", "B", "C", "D"];

function isQuizQuestion(input: unknown): input is QuizQuestion {
	if (!input || typeof input !== "object") {
		return false;
	}

	const question = input as QuizQuestion;
	return (
		typeof question.id === "string" &&
		typeof question.question === "string" &&
		Array.isArray(question.options) &&
		question.options.length === 4 &&
		question.options.every(
			(option) =>
				option &&
				typeof option === "object" &&
				typeof option.id === "string" &&
				QUIZ_OPTION_IDS.includes(option.id as QuizOptionId) &&
				typeof option.text === "string",
		) &&
		typeof question.correctOption === "string" &&
		QUIZ_OPTION_IDS.includes(question.correctOption) &&
		question.explanations !== null &&
		typeof question.explanations === "object" &&
		QUIZ_OPTION_IDS.every((optionId) => typeof question.explanations[optionId] === "string") &&
		["easy", "medium", "hard"].includes(question.difficulty)
	);
}

export function serializeQuizHistoryMessage(payload: QuizHistoryPayload) {
	const normalizedQuestions = payload.questions.filter(isQuizQuestion);
	const normalizedTitle = payload.title.trim() || "Quiz";

	const normalizedPayload: QuizHistoryPayload = {
		title: normalizedTitle,
		count: normalizedQuestions.length,
		questions: normalizedQuestions,
	};

	return [
		`Generated a ${normalizedPayload.count}-question quiz for "${normalizedPayload.title}".`,
		`${QUIZ_MESSAGE_OPEN}${JSON.stringify(normalizedPayload)}${QUIZ_MESSAGE_CLOSE}`,
	].join("\n\n");
}

export function parseQuizHistoryMessage(content: string): QuizHistoryPayload | null {
	const start = content.indexOf(QUIZ_MESSAGE_OPEN);
	const end = content.indexOf(QUIZ_MESSAGE_CLOSE);

	if (start === -1 || end === -1 || end <= start) {
		return null;
	}

	const serializedPayload = content.slice(start + QUIZ_MESSAGE_OPEN.length, end).trim();

	if (!serializedPayload) {
		return null;
	}

	try {
		const parsedPayload = JSON.parse(serializedPayload) as Partial<QuizHistoryPayload>;
		if (!parsedPayload || typeof parsedPayload !== "object") {
			return null;
		}

		const parsedQuestions = Array.isArray(parsedPayload.questions) ? parsedPayload.questions.filter(isQuizQuestion) : [];

		if (parsedQuestions.length === 0) {
			return null;
		}

		return {
			title: typeof parsedPayload.title === "string" && parsedPayload.title.trim() ? parsedPayload.title.trim() : "Quiz",
			count: parsedQuestions.length,
			questions: parsedQuestions,
		};
	} catch {
		return null;
	}
}
