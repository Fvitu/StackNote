import { groq } from "@/lib/groq";
import type { QuizQuotaModelId } from "@/lib/ai-limits";
import type { QuizDifficulty, QuizOptionId, QuizQuestion } from "@/lib/quiz";

const QUIZ_OPTION_IDS = ["A", "B", "C", "D"] as const;
const MAX_QUIZ_GENERATION_ATTEMPTS = 3;
const MAX_QUIZ_SOURCE_CHARS = 6_000;
const MIN_QUIZ_SOURCE_CHARS = 1_400;
const QUIZ_CONTEXT_TOKEN_BUDGET = 7_800;
const QUIZ_MIN_RESPONSE_TOKENS = 900;
const QUIZ_MAX_RESPONSE_TOKENS = 4_200;
const QUIZ_USER_PREFIX = "Generate quiz questions from the following study material:\n\n";

const QUIZ_SYSTEM_PROMPT = `You are an expert quiz generation engine integrated into StackNote.

Respond ONLY with valid JSON and no markdown fences.

Output format:
{
  "questions": [
    {
      "id": "q-1",
      "question": "...",
      "options": [
        { "id": "A", "text": "..." },
        { "id": "B", "text": "..." },
        { "id": "C", "text": "..." },
        { "id": "D", "text": "..." }
      ],
      "correctOption": "A",
      "explanations": {
        "A": "...",
        "B": "...",
        "C": "...",
        "D": "..."
      },
      "difficulty": "easy|medium|hard"
    }
  ]
}

Rules:
- Generate exactly the number of questions requested by the user instruction.
- Every question must have exactly 4 options (A-D).
- Exactly one correct option.
- Keep explanations concise (1-2 sentences per option).
- Vary difficulty across easy, medium, and hard.
- Use only source-grounded content and avoid hallucinations.
`;

interface ParsedOption {
	id: QuizOptionId | null;
	text: string;
	isCorrect?: boolean;
}

interface QuizGenerationPromptInput {
	sourceMaterial: string;
	noteTitle: string;
	promptSections: string[];
}

export interface PlannerQuizGenerationInput {
	model: QuizQuotaModelId;
	sourceMaterial: string;
	noteTitle: string;
	questionCount: number;
	language?: string;
	additionalInstructions?: string[];
}

export interface PlannerQuizGenerationResult {
	questions: QuizQuestion[];
	tokensUsed: number;
	model: QuizQuotaModelId;
}

function readString(...values: unknown[]) {
	for (const value of values) {
		if (typeof value === "string" && value.trim().length > 0) {
			return value.trim();
		}
	}

	return null;
}

function buildQuizPrompt(input: QuizGenerationPromptInput, sourceCharLimit = input.sourceMaterial.length) {
	return QUIZ_USER_PREFIX + input.sourceMaterial.slice(0, sourceCharLimit) + `\n\nContext title: ${input.noteTitle}\n\n${input.promptSections.join("\n\n")}`;
}

function normalizeOptionId(value: unknown): QuizOptionId | null {
	if (typeof value === "string") {
		const normalized = value.trim().toUpperCase();
		if (QUIZ_OPTION_IDS.includes(normalized as QuizOptionId)) {
			return normalized as QuizOptionId;
		}

		const asNumber = Number.parseInt(normalized, 10);
		if (!Number.isNaN(asNumber)) {
			if (asNumber >= 1 && asNumber <= 4) {
				return QUIZ_OPTION_IDS[asNumber - 1];
			}

			if (asNumber >= 0 && asNumber <= 3) {
				return QUIZ_OPTION_IDS[asNumber];
			}
		}

		return null;
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		if (value >= 1 && value <= 4) {
			return QUIZ_OPTION_IDS[Math.floor(value) - 1];
		}

		if (value >= 0 && value <= 3) {
			return QUIZ_OPTION_IDS[Math.floor(value)];
		}
	}

	return null;
}

function normalizeDifficulty(value: unknown): QuizDifficulty {
	if (typeof value !== "string") {
		return "medium";
	}

	const normalized = value.trim().toLowerCase();
	if (normalized === "easy" || normalized === "medium" || normalized === "hard") {
		return normalized;
	}

	return "medium";
}

function extractBalancedJsonBlock(input: string) {
	const firstObjectIndex = input.indexOf("{");
	const firstArrayIndex = input.indexOf("[");
	const startIndexCandidates = [firstObjectIndex, firstArrayIndex].filter((index) => index >= 0);
	if (startIndexCandidates.length === 0) {
		return null;
	}

	const startIndex = Math.min(...startIndexCandidates);
	const stack: string[] = [];
	let inString = false;
	let escaped = false;

	for (let index = startIndex; index < input.length; index += 1) {
		const character = input[index];
		if (!character) {
			continue;
		}

		if (inString) {
			if (escaped) {
				escaped = false;
				continue;
			}

			if (character === "\\") {
				escaped = true;
				continue;
			}

			if (character === '"') {
				inString = false;
			}

			continue;
		}

		if (character === '"') {
			inString = true;
			continue;
		}

		if (character === "{" || character === "[") {
			stack.push(character);
			continue;
		}

		if (character === "}" || character === "]") {
			const top = stack[stack.length - 1];
			if ((character === "}" && top === "{") || (character === "]" && top === "[")) {
				stack.pop();
			} else {
				continue;
			}

			if (stack.length === 0) {
				return input.slice(startIndex, index + 1);
			}
		}
	}

	return null;
}

function extractJsonCandidate(responseText: string) {
	const trimmed = responseText.trim();
	const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
	if (fencedMatch?.[1]) {
		return fencedMatch[1].trim();
	}

	const balancedCandidate = extractBalancedJsonBlock(trimmed);
	if (balancedCandidate) {
		return balancedCandidate;
	}

	const objectMatch = trimmed.match(/\{[\s\S]*\}/);
	if (objectMatch) {
		return objectMatch[0];
	}

	const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
	if (arrayMatch) {
		return arrayMatch[0];
	}

	throw new Error("No JSON quiz payload found");
}

function sanitizeJsonCandidate(candidate: string) {
	return candidate
		.replace(/[\u201C\u201D]/g, '"')
		.replace(/[\u2018\u2019]/g, "'")
		.replace(/\u00A0/g, " ")
		.replace(/,\s*([}\]])/g, "$1");
}

function closeUnbalancedJsonCandidate(candidate: string) {
	const normalizedCandidate = sanitizeJsonCandidate(candidate);
	const stack: string[] = [];
	let inString = false;
	let escaped = false;

	for (let index = 0; index < normalizedCandidate.length; index += 1) {
		const character = normalizedCandidate[index];
		if (!character) {
			continue;
		}

		if (inString) {
			if (escaped) {
				escaped = false;
				continue;
			}

			if (character === "\\") {
				escaped = true;
				continue;
			}

			if (character === '"') {
				inString = false;
			}

			continue;
		}

		if (character === '"') {
			inString = true;
			continue;
		}

		if (character === "{" || character === "[") {
			stack.push(character);
			continue;
		}

		if (character === "}" || character === "]") {
			const top = stack[stack.length - 1];
			if ((character === "}" && top === "{") || (character === "]" && top === "[")) {
				stack.pop();
			}
		}
	}

	let repaired = normalizedCandidate.trimEnd().replace(/,\s*$/, "");
	if (inString) {
		repaired += '"';
	}

	for (let index = stack.length - 1; index >= 0; index -= 1) {
		repaired += stack[index] === "{" ? "}" : "]";
	}

	return repaired;
}

function parseJsonCandidate(responseText: string) {
	const candidate = extractJsonCandidate(responseText);
	const variations = [candidate, sanitizeJsonCandidate(candidate), closeUnbalancedJsonCandidate(candidate)];

	for (const variation of variations) {
		try {
			return JSON.parse(variation) as unknown;
		} catch {
			// Try next variant.
		}
	}

	throw new Error("Unable to parse quiz JSON payload");
}

function normalizeOptions(input: unknown): ParsedOption[] {
	if (Array.isArray(input)) {
		return input
			.map((entry, index) => {
				if (typeof entry === "string" && entry.trim().length > 0) {
					return {
						id: QUIZ_OPTION_IDS[index] ?? null,
						text: entry.trim(),
					} satisfies ParsedOption;
				}

				if (!entry || typeof entry !== "object") {
					return null;
				}

				const candidate = entry as Record<string, unknown>;
				const text = readString(candidate.text, candidate.content, candidate.option, candidate.value, candidate.answer, candidate.label);
				if (!text) {
					return null;
				}

				return {
					id: normalizeOptionId(candidate.id ?? candidate.key ?? candidate.optionId ?? candidate.letter ?? candidate.label),
					text,
					isCorrect:
						typeof candidate.isCorrect === "boolean" ? candidate.isCorrect : typeof candidate.correct === "boolean" ? candidate.correct : undefined,
				} satisfies ParsedOption;
			})
			.filter((option): option is ParsedOption => option !== null);
	}

	if (input && typeof input === "object") {
		const candidate = input as Record<string, unknown>;
		const mapped = QUIZ_OPTION_IDS.map((optionId) => {
			const text = readString(candidate[optionId], candidate[optionId.toLowerCase()]);
			if (!text) {
				return null;
			}

			return {
				id: optionId,
				text,
			} satisfies ParsedOption;
		}).filter((option): option is { id: QuizOptionId; text: string } => option !== null);

		if (mapped.length > 0) {
			return mapped;
		}
	}

	return [];
}

function toCanonicalOptions(parsedOptions: ParsedOption[]): Array<{ id: QuizOptionId; text: string }> {
	const firstById = new Map<QuizOptionId, string>();
	for (const optionId of QUIZ_OPTION_IDS) {
		const matching = parsedOptions.find((option) => option.id === optionId);
		if (matching?.text) {
			firstById.set(optionId, matching.text);
		}
	}

	if (firstById.size === 4) {
		return QUIZ_OPTION_IDS.map((optionId) => ({
			id: optionId,
			text: firstById.get(optionId) as string,
		}));
	}

	const fallbackTexts = parsedOptions.map((option) => option.text.trim()).filter(Boolean);
	if (fallbackTexts.length < 4) {
		return [];
	}

	return QUIZ_OPTION_IDS.map((optionId, index) => ({
		id: optionId,
		text: fallbackTexts[index] as string,
	}));
}

function resolveCorrectOption(
	question: Record<string, unknown>,
	options: Array<{ id: QuizOptionId; text: string }>,
	parsedOptions: ParsedOption[],
): QuizOptionId {
	const candidates = [
		question.correctOption,
		question.correct_option,
		question.correct,
		question.correctAnswer,
		question.correct_answer,
		question.answer,
		question.solution,
	];

	for (const candidate of candidates) {
		const normalizedId = normalizeOptionId(candidate);
		if (normalizedId && options.some((option) => option.id === normalizedId)) {
			return normalizedId;
		}

		if (typeof candidate === "string") {
			const byText = options.find((option) => option.text.trim().toLowerCase() === candidate.trim().toLowerCase());
			if (byText) {
				return byText.id;
			}
		}
	}

	const flaggedOption = parsedOptions.find((option) => option.isCorrect && option.id && options.some((item) => item.id === option.id));
	if (flaggedOption?.id) {
		return flaggedOption.id;
	}

	return "A";
}

function buildExplanations(
	question: Record<string, unknown>,
	options: Array<{ id: QuizOptionId; text: string }>,
	correctOption: QuizOptionId,
): Record<QuizOptionId, string> {
	const explanations: Partial<Record<QuizOptionId, string>> = {};
	const rawExplanations = question.explanations ?? question.rationales ?? question.feedback;

	if (rawExplanations && typeof rawExplanations === "object" && !Array.isArray(rawExplanations)) {
		const record = rawExplanations as Record<string, unknown>;
		for (const optionId of QUIZ_OPTION_IDS) {
			const explanation = readString(record[optionId], record[optionId.toLowerCase()]);
			if (explanation) {
				explanations[optionId] = explanation;
			}
		}
	}

	if (Array.isArray(rawExplanations)) {
		for (let index = 0; index < QUIZ_OPTION_IDS.length; index += 1) {
			const explanation = readString(rawExplanations[index]);
			if (explanation) {
				explanations[QUIZ_OPTION_IDS[index]] = explanation;
			}
		}
	}

	const generalExplanation = readString(question.explanation, question.rationale, question.reasoning);
	for (const option of options) {
		if (!explanations[option.id]) {
			explanations[option.id] =
				generalExplanation && option.id === correctOption
					? generalExplanation
					: option.id === correctOption
						? "This is the best answer based on the source material."
						: "This option is not the best answer based on the source material.";
		}
	}

	return explanations as Record<QuizOptionId, string>;
}

function normalizeQuestion(input: unknown, index: number): QuizQuestion | null {
	if (!input || typeof input !== "object") {
		return null;
	}

	const question = input as Record<string, unknown>;
	const questionText = readString(question.question, question.prompt, question.text, question.title, question.statement);
	if (!questionText) {
		return null;
	}

	const parsedOptions = normalizeOptions(question.options ?? question.choices ?? question.answers ?? question.alternatives);
	const options = toCanonicalOptions(parsedOptions);
	if (options.length !== 4) {
		return null;
	}

	const correctOption = resolveCorrectOption(question, options, parsedOptions);
	const explanations = buildExplanations(question, options, correctOption);

	return {
		id: readString(question.id, question.questionId, question.uuid) ?? `q-${index + 1}`,
		question: questionText,
		options,
		correctOption,
		explanations,
		difficulty: normalizeDifficulty(question.difficulty ?? question.level),
	};
}

function getRawQuestionsFromParsedPayload(parsedPayload: unknown): unknown[] {
	if (Array.isArray(parsedPayload)) {
		return parsedPayload;
	}

	if (!parsedPayload || typeof parsedPayload !== "object") {
		return [];
	}

	const record = parsedPayload as Record<string, unknown>;
	for (const candidate of [record.questions, record.quiz, record.items, record.data]) {
		if (Array.isArray(candidate)) {
			return candidate;
		}
	}

	if (record.result && typeof record.result === "object") {
		const nested = record.result as Record<string, unknown>;
		for (const candidate of [nested.questions, nested.quiz, nested.items, nested.data]) {
			if (Array.isArray(candidate)) {
				return candidate;
			}
		}
	}

	return [];
}

function validateQuestion(input: unknown): input is QuizQuestion {
	if (!input || typeof input !== "object") {
		return false;
	}

	const question = input as QuizQuestion;
	return (
		typeof question.id === "string" &&
		typeof question.question === "string" &&
		Array.isArray(question.options) &&
		question.options.length === 4 &&
		question.options.every((option) => typeof option.id === "string" && typeof option.text === "string" && QUIZ_OPTION_IDS.includes(option.id)) &&
		typeof question.correctOption === "string" &&
		QUIZ_OPTION_IDS.includes(question.correctOption) &&
		question.explanations !== null &&
		typeof question.explanations === "object" &&
		QUIZ_OPTION_IDS.every((id) => typeof question.explanations[id] === "string") &&
		["easy", "medium", "hard"].includes(question.difficulty)
	);
}

function parseQuestionsFromResponse(responseText: string, questionCount: number): QuizQuestion[] {
	const parsedPayload = parseJsonCandidate(responseText);
	const rawQuestions = getRawQuestionsFromParsedPayload(parsedPayload);

	return rawQuestions
		.map((question, index) => normalizeQuestion(question, index))
		.filter((question): question is QuizQuestion => question !== null)
		.filter(validateQuestion)
		.slice(0, questionCount);
}

function readFailedGenerationFromError(error: unknown): string | null {
	if (!error || typeof error !== "object") {
		return null;
	}

	const root = error as Record<string, unknown>;
	const nestedError = root.error as Record<string, unknown> | undefined;
	const nestedNestedError = nestedError?.error as Record<string, unknown> | undefined;
	const directCandidates = [root.failed_generation, nestedError?.failed_generation, nestedNestedError?.failed_generation];

	for (const candidate of directCandidates) {
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			return candidate;
		}
	}

	if (typeof root.message === "string") {
		const jsonStart = root.message.indexOf("{");
		if (jsonStart >= 0) {
			try {
				const parsed = JSON.parse(root.message.slice(jsonStart)) as { error?: { failed_generation?: string } };
				if (typeof parsed.error?.failed_generation === "string" && parsed.error.failed_generation.trim().length > 0) {
					return parsed.error.failed_generation;
				}
			} catch {
				// Ignore parse failures from nested error payloads.
			}
		}
	}

	return null;
}

function estimateTextTokens(text: string) {
	return Math.ceil(text.length / 4);
}

function estimateQuizMaxTokens(questionCount: number, prompt: string, responseTokenCap: number) {
	const estimated = questionCount * 135 + 300;
	const desired = Math.min(responseTokenCap, Math.min(QUIZ_MAX_RESPONSE_TOKENS, Math.max(QUIZ_MIN_RESPONSE_TOKENS, estimated)));
	const available = Math.max(QUIZ_MIN_RESPONSE_TOKENS, QUIZ_CONTEXT_TOKEN_BUDGET - estimateTextTokens(prompt));
	return Math.max(QUIZ_MIN_RESPONSE_TOKENS, Math.min(desired, available));
}

function isRequestTooLargeError(error: unknown) {
	if (!error) {
		return false;
	}

	const message = error instanceof Error ? error.message : JSON.stringify(error);
	if (/request_too_large|request entity too large|\b413\b/i.test(message)) {
		return true;
	}

	if (typeof error === "object") {
		const root = error as Record<string, unknown>;
		const nestedError = root.error as Record<string, unknown> | undefined;
		const nestedNestedError = nestedError?.error as Record<string, unknown> | undefined;
		const codes = [root.code, nestedError?.code, nestedNestedError?.code];
		if (codes.some((code) => typeof code === "string" && code.toLowerCase() === "request_too_large")) {
			return true;
		}

		const statuses = [root.status, nestedError?.status, nestedNestedError?.status];
		if (statuses.some((status) => status === 413 || status === "413")) {
			return true;
		}
	}

	return false;
}

export async function generatePlannerQuizQuestions(input: PlannerQuizGenerationInput): Promise<PlannerQuizGenerationResult> {
	const promptSections = [
		`Generate exactly ${input.questionCount} multiple-choice questions.`,
		input.language ? `Generate all question text in ${input.language}.` : "Match the language of the study material.",
		"Keep the question set broad enough to cover the linked notes, not just one repeated concept.",
		...(input.additionalInstructions ?? []).filter((instruction) => instruction.trim().length > 0),
	];

	const promptInput: QuizGenerationPromptInput = {
		sourceMaterial: input.sourceMaterial.slice(0, MAX_QUIZ_SOURCE_CHARS),
		noteTitle: input.noteTitle,
		promptSections,
	};

	let bestQuestions: QuizQuestion[] = [];
	let totalTokensUsed = 0;
	let sourceCharLimit = Math.min(promptInput.sourceMaterial.length, MAX_QUIZ_SOURCE_CHARS);
	let responseTokenCap = QUIZ_MAX_RESPONSE_TOKENS;

	for (let attempt = 1; attempt <= MAX_QUIZ_GENERATION_ATTEMPTS; attempt += 1) {
		let prompt = buildQuizPrompt(promptInput, sourceCharLimit);
		let maxTokens = estimateQuizMaxTokens(input.questionCount, prompt, responseTokenCap);

		while (estimateTextTokens(prompt) + QUIZ_MIN_RESPONSE_TOKENS > QUIZ_CONTEXT_TOKEN_BUDGET && sourceCharLimit > MIN_QUIZ_SOURCE_CHARS) {
			sourceCharLimit = Math.max(MIN_QUIZ_SOURCE_CHARS, Math.floor(sourceCharLimit * 0.75));
			prompt = buildQuizPrompt(promptInput, sourceCharLimit);
			maxTokens = estimateQuizMaxTokens(input.questionCount, prompt, responseTokenCap);
		}

		try {
			const completion = await groq.chat.completions.create({
				model: input.model,
				messages: [
					{ role: "system", content: QUIZ_SYSTEM_PROMPT },
					{ role: "user", content: prompt },
				],
				max_tokens: maxTokens,
				temperature: attempt === 1 ? 0.45 : 0.3,
				...(attempt === 1
					? {
							response_format: {
								type: "json_object" as const,
							},
						}
					: {}),
			});

			const responseText = completion.choices[0]?.message?.content ?? "";
			totalTokensUsed += completion.usage?.total_tokens ?? Math.ceil((prompt.length + responseText.length) / 4);

			const parsedQuestions = parseQuestionsFromResponse(responseText, input.questionCount);
			if (parsedQuestions.length > bestQuestions.length) {
				bestQuestions = parsedQuestions;
			}

			if (parsedQuestions.length >= input.questionCount) {
				break;
			}
		} catch (error) {
			const failedGeneration = readFailedGenerationFromError(error);
			if (failedGeneration) {
				try {
					const salvagedQuestions = parseQuestionsFromResponse(failedGeneration, input.questionCount);
					if (salvagedQuestions.length > bestQuestions.length) {
						bestQuestions = salvagedQuestions;
					}

					if (salvagedQuestions.length >= input.questionCount) {
						break;
					}
				} catch {
					// Continue retrying with a smaller payload.
				}
			}

			if (isRequestTooLargeError(error)) {
				const nextSourceCharLimit = Math.max(MIN_QUIZ_SOURCE_CHARS, Math.floor(sourceCharLimit * 0.7));
				const nextResponseTokenCap = Math.max(QUIZ_MIN_RESPONSE_TOKENS, Math.floor(responseTokenCap * 0.75));
				const didShrinkPayload = nextSourceCharLimit < sourceCharLimit || nextResponseTokenCap < responseTokenCap;

				sourceCharLimit = nextSourceCharLimit;
				responseTokenCap = nextResponseTokenCap;
				if (!didShrinkPayload) {
					break;
				}
			}
		}
	}

	if (bestQuestions.length === 0) {
		throw new Error("Unable to generate a usable quiz payload");
	}

	return {
		questions: bestQuestions,
		tokensUsed: Math.max(totalTokensUsed, Math.ceil(buildQuizPrompt(promptInput, sourceCharLimit).length / 4)),
		model: input.model,
	};
}
