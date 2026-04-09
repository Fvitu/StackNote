import { AI_LIMITS } from "@/lib/ai-limits";
import { noteContentToText } from "@/lib/ai/note-content";

const MINUTES_PER_QUESTION = 4;
const MIN_QUESTIONS_PER_NOTE = 3;
const MAX_QUESTIONS_PER_NOTE = 12;
const CHARS_PER_QUESTION_UNIT = 1_200;

export interface PlannerNoteSource {
	id: string;
	title: string;
	content: unknown;
	searchableText: string | null;
}

export interface PlannerNoteMaterial {
	id: string;
	title: string;
	text: string;
	estimatedQuestionCount: number;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

export function extractPlannerNoteText(note: Pick<PlannerNoteSource, "content" | "searchableText">) {
	const searchableText = note.searchableText?.replace(/\s+/g, " ").trim() ?? "";
	if (searchableText.length > 0) {
		return searchableText;
	}

	return noteContentToText(note.content).replace(/\s+/g, " ").trim();
}

export function estimateQuestionCountFromText(text: string) {
	if (!text.trim()) {
		return 0;
	}

	return clamp(Math.ceil(text.length / CHARS_PER_QUESTION_UNIT), MIN_QUESTIONS_PER_NOTE, MAX_QUESTIONS_PER_NOTE);
}

export function buildPlannerNoteMaterials(notes: PlannerNoteSource[]): PlannerNoteMaterial[] {
	return notes
		.map((note) => {
			const text = extractPlannerNoteText(note);
			if (!text) {
				return null;
			}

			return {
				id: note.id,
				title: note.title.trim() || "Untitled",
				text,
				estimatedQuestionCount: estimateQuestionCountFromText(text),
			} satisfies PlannerNoteMaterial;
		})
		.filter((note): note is PlannerNoteMaterial => note !== null);
}

export function buildPlannerSourceMaterial(notes: PlannerNoteMaterial[]) {
	return notes.map((note) => `# ${note.title}\n${note.text}`).join("\n\n---\n\n").trim();
}

export function getDailyQuestionCapacity(dailyStudyMinutes: number) {
	return clamp(Math.floor(dailyStudyMinutes / MINUTES_PER_QUESTION), 1, AI_LIMITS.QUIZ_MAX_PER_REQUEST);
}

export function distributeQuestionsAcrossDays(totalQuestions: number, dayCount: number, dailyCapacity: number) {
	if (totalQuestions <= 0 || dayCount <= 0) {
		return [];
	}

	const counts = Array.from({ length: dayCount }, () => 0);
	const baseCount = Math.min(dailyCapacity, Math.floor(totalQuestions / dayCount));

	for (let index = 0; index < dayCount; index += 1) {
		counts[index] = baseCount;
	}

	let remainingQuestions = totalQuestions - baseCount * dayCount;
	let cursor = 0;
	while (remainingQuestions > 0) {
		if (counts[cursor] < dailyCapacity) {
			counts[cursor] += 1;
			remainingQuestions -= 1;
		}

		cursor = (cursor + 1) % dayCount;
	}

	return counts;
}

export function getEstimatedMinutesForQuestionCount(questionCount: number) {
	return questionCount * MINUTES_PER_QUESTION;
}
