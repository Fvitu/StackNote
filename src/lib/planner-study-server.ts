import { groq } from "@/lib/groq";
import { prisma } from "@/lib/prisma";
import {
	AI_LIMITS,
	FALLBACK_FLASHCARD_MODEL,
	PRIMARY_FLASHCARD_MODEL,
	type FlashcardQuotaModelId,
} from "@/lib/ai-limits";
import { checkQuotaLimit, recordQuotaUsage } from "@/lib/rate-limit";
import { buildPlannerNoteMaterials, buildPlannerSourceMaterial } from "@/lib/planner-notes";
import type { PlannerStudyCard, PlannerStudyQueueExam, PlannerStudySessionPayload } from "@/lib/planner-study-session";

export interface PlannerStudyItemInput {
	examId?: string;
	questionCount?: number;
}

interface PlannerExamRecord {
	id: string;
	title: string;
	subject: string | null;
	noteIds: string[];
	deckIds: string[];
}

interface GeneratedCard {
	front: string;
	back: string;
}

interface GeneratedDeck {
	title: string;
	cards: GeneratedCard[];
}

class PlannerStudyError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "PlannerStudyError";
	}
}

class QuotaExceededError extends PlannerStudyError {
	constructor(
		message: string,
		readonly model: string,
		readonly resetAt: string | null,
	) {
		super(message, 429);
		this.name = "QuotaExceededError";
	}
}

const FLASHCARD_SYSTEM_PROMPT = `\
You are an expert flashcard generation engine integrated into StackNote.

Respond ONLY with valid JSON and no markdown fences.

Output format:
{
  "title": "Concise deck title",
  "cards": [
    { "front": "question or term", "back": "answer or definition" }
  ]
}

Rules:
- Generate exactly the number of flashcards requested by the user instruction.
- Every flashcard must be grounded in the provided source material.
- Fronts must prompt active recall, not recognition.
- Backs must be concise, direct, and accurate.
- Avoid duplicates or near-duplicates of the existing flashcards listed by the user.
- Do not invent content not present in the notes.
- Match the language of the study material unless the user explicitly says otherwise.
`;

const FLASHCARD_USER_PREFIX = "Generate flashcards from the following study material:\n\n";
const FLASHCARD_SOURCE_CHAR_LIMIT = 8_000;
const PLANNER_FLASHCARD_BATCH_SIZE = 2;

function sanitizeTitleCandidate(value: string) {
	return value
		.replace(/\s+/g, " ")
		.replace(/^["'`]+|["'`]+$/g, "")
		.trim();
}

function buildFallbackDeckTitle(sourceText: string, titleHint?: string) {
	const normalizedHint = sanitizeTitleCandidate(titleHint ?? "");
	if (normalizedHint && !/^untitled$/i.test(normalizedHint)) {
		return normalizedHint;
	}

	const sourceLines = sourceText
		.split(/\r?\n/)
		.map((line) =>
			sanitizeTitleCandidate(
				line
					.replace(/^#{1,6}\s*/, "")
					.replace(/^[-*]\s*/, "")
					.replace(/^\[[^\]]+\]\s*/, ""),
			),
		)
		.filter((line) => line.length >= 4);

	const candidate = sourceLines.find((line) => !/^embedded\b/i.test(line)) ?? sourceLines[0] ?? "Study Deck";
	return candidate.length > 70 ? `${candidate.slice(0, 67).trimEnd()}...` : candidate;
}

function normalizeGeneratedTitle(title: string | undefined, fallbackTitle: string) {
	const normalizedTitle = sanitizeTitleCandidate(title ?? "");
	if (!normalizedTitle || /^untitled$/i.test(normalizedTitle) || /^flashcards?$/i.test(normalizedTitle)) {
		return fallbackTitle;
	}

	return normalizedTitle;
}

function parseGeneratedCards(rawCards: unknown) {
	if (!Array.isArray(rawCards)) {
		throw new Error("Response cards are not an array");
	}

	const cards = rawCards.filter((card): card is GeneratedCard =>
		Boolean(
			card &&
			typeof card === "object" &&
			typeof (card as GeneratedCard).front === "string" &&
			typeof (card as GeneratedCard).back === "string" &&
			(card as GeneratedCard).front.trim() &&
			(card as GeneratedCard).back.trim(),
		),
	);

	if (cards.length === 0) {
		throw new Error("No valid cards generated");
	}

	return cards;
}

function extractJsonCandidate(responseText: string) {
	const trimmed = responseText.trim();
	const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
	if (fencedMatch?.[1]) {
		return fencedMatch[1].trim();
	}

	const objectMatch = trimmed.match(/\{[\s\S]*\}/);
	const arrayMatch = trimmed.match(/\[[\s\S]*\]/);

	if (objectMatch && (!arrayMatch || objectMatch.index! <= arrayMatch.index!)) {
		return objectMatch[0];
	}

	if (arrayMatch) {
		return arrayMatch[0];
	}

	throw new Error("No JSON payload found in response");
}

function parseGeneratedDeck(responseText: string, fallbackTitle: string): GeneratedDeck {
	const parsed = JSON.parse(extractJsonCandidate(responseText)) as unknown;

	if (Array.isArray(parsed)) {
		return {
			title: fallbackTitle,
			cards: parseGeneratedCards(parsed),
		};
	}

	if (!parsed || typeof parsed !== "object") {
		throw new Error("Response is not a supported JSON payload");
	}

	const payload = parsed as Record<string, unknown>;
	const cardsSource = Array.isArray(payload.cards) ? payload.cards : Array.isArray(payload.flashcards) ? payload.flashcards : null;
	if (!cardsSource) {
		throw new Error("Response does not include flashcards");
	}

	return {
		title: normalizeGeneratedTitle(
			typeof payload.title === "string" ? payload.title : typeof payload.deckTitle === "string" ? payload.deckTitle : undefined,
			fallbackTitle,
		),
		cards: parseGeneratedCards(cardsSource),
	};
}

async function requestFlashcardsFromModel(
	model: FlashcardQuotaModelId,
	sourceText: string,
	targetCount: number,
	options: {
		titleHint?: string;
		existingFronts?: string[];
	},
) {
	const fallbackTitle = buildFallbackDeckTitle(sourceText, options.titleHint);
	const promptSections = [
		`Generate exactly ${targetCount} flashcards. Do not generate more or fewer.`,
		options.titleHint ? `Reference title/context: ${options.titleHint}. Use it only as context.` : "",
		options.existingFronts && options.existingFronts.length > 0
			? `Avoid duplicating these existing flashcard fronts:\n${options.existingFronts.map((front, index) => `${index + 1}. ${front}`).join("\n")}`
			: "",
	].filter(Boolean);

	const completion = await groq.chat.completions.create({
		model,
		messages: [
			{ role: "system", content: FLASHCARD_SYSTEM_PROMPT },
			{
				role: "user",
				content: `${FLASHCARD_USER_PREFIX}${sourceText.slice(0, FLASHCARD_SOURCE_CHAR_LIMIT)}\n\n${promptSections.join("\n\n")}`,
			},
		],
		max_tokens: 1_500,
		temperature: 0.3,
		response_format: {
			type: "json_object",
		},
	});

	const responseText = completion.choices[0]?.message?.content ?? "";
	return {
		model,
		tokensUsed: completion.usage?.total_tokens ?? 0,
		...parseGeneratedDeck(responseText, fallbackTitle),
	};
}

function normalizePlannerStudyItems(items: PlannerStudyItemInput[]) {
	return Array.from(
		items
			.map((item) => ({
				examId: item.examId?.trim() ?? "",
				questionCount: Math.min(AI_LIMITS.FLASHCARD_MAX_PER_REQUEST, Math.max(1, Math.round(item.questionCount ?? 0))),
			}))
			.filter((item) => item.examId.length > 0 && item.questionCount > 0)
			.reduce<Map<string, number>>((map, item) => {
				const nextCount = (map.get(item.examId) ?? 0) + item.questionCount;
				map.set(item.examId, Math.min(AI_LIMITS.FLASHCARD_MAX_PER_REQUEST, nextCount));
				return map;
			}, new Map())
			.entries(),
	).map(([examId, questionCount]) => ({
		examId,
		questionCount,
	}));
}

function serializePlannerStudyCard(
	card: {
		id: string;
		deckId: string;
		front: string;
		back: string;
		stability: number;
		difficulty: number;
		reps: number;
		lapses: number;
		state: number;
		dueDate: Date;
	},
	context: {
		sessionId: string;
		examId: string;
		examTitle: string;
	},
): PlannerStudyCard {
	return {
		id: card.id,
		deckId: card.deckId,
		sessionId: context.sessionId,
		examId: context.examId,
		examTitle: context.examTitle,
		front: card.front,
		back: card.back,
		stability: card.stability,
		difficulty: card.difficulty,
		reps: card.reps,
		lapses: card.lapses,
		state: card.state as PlannerStudyCard["state"],
		dueDate: card.dueDate.toISOString(),
	};
}

async function ensureExamDeck(userId: string, exam: PlannerExamRecord) {
	const existingDeckIds = Array.isArray(exam.deckIds) ? exam.deckIds : [];
	if (existingDeckIds.length > 0) {
		const existingDeck = await prisma.flashcardDeck.findFirst({
			where: {
				id: {
					in: existingDeckIds,
				},
				userId,
			},
			select: {
				id: true,
				title: true,
			},
		});

		if (existingDeck) {
			return existingDeck;
		}
	}

	const deckTitle = exam.subject?.trim() || exam.title;
	const createdDeck = await prisma.flashcardDeck.create({
		data: {
			userId,
			title: deckTitle,
			description: `Planner study deck for ${exam.title}`,
			cardCount: 0,
		},
		select: {
			id: true,
			title: true,
		},
	});

	await prisma.exam.update({
		where: { id: exam.id },
		data: {
			deckIds: [...exam.deckIds, createdDeck.id],
		},
	});

	return createdDeck;
}

async function generatePlannerStudyCards(input: {
	userId: string;
	exam: PlannerExamRecord;
	deckId: string;
	sessionId: string;
	count: number;
}) {
	const notes = await prisma.note.findMany({
		where: {
			id: {
				in: Array.isArray(input.exam.noteIds) ? input.exam.noteIds : [],
			},
			isArchived: false,
			deletedAt: null,
			workspace: {
				userId: input.userId,
			},
		},
		select: {
			id: true,
			title: true,
			content: true,
			searchableText: true,
		},
	});

	const noteMaterials = buildPlannerNoteMaterials(notes);
	if (noteMaterials.length === 0) {
		throw new PlannerStudyError(`"${input.exam.title}" does not have enough note content to generate study cards yet`, 400);
	}

	const existingFronts = await prisma.flashcard.findMany({
		where: {
			deckId: input.deckId,
		},
		orderBy: {
			createdAt: "desc",
		},
		take: 12,
		select: {
			front: true,
		},
	});

	const primaryQuota = await checkQuotaLimit(input.userId, {
		category: "flashcard",
		model: PRIMARY_FLASHCARD_MODEL,
		requests: 1,
		flashcards: input.count,
	});
	if (!primaryQuota.allowed) {
		throw new QuotaExceededError(primaryQuota.error ?? "Flashcard generation limit reached", PRIMARY_FLASHCARD_MODEL, primaryQuota.resetAt);
	}

	const generation = await requestFlashcardsFromModel(PRIMARY_FLASHCARD_MODEL, buildPlannerSourceMaterial(noteMaterials), input.count, {
		titleHint: input.exam.subject?.trim() || input.exam.title,
		existingFronts: existingFronts.map((card) => card.front),
	}).catch(async (primaryError) => {
		console.warn("[planner] Primary planner flashcard generation failed, falling back to groq/compound-mini:", primaryError);

		const fallbackQuota = await checkQuotaLimit(input.userId, {
			category: "flashcard",
			model: FALLBACK_FLASHCARD_MODEL,
			requests: 1,
			flashcards: input.count,
		});
		if (!fallbackQuota.allowed) {
			throw new QuotaExceededError(fallbackQuota.error ?? "Flashcard generation limit reached", FALLBACK_FLASHCARD_MODEL, fallbackQuota.resetAt);
		}

		return requestFlashcardsFromModel(FALLBACK_FLASHCARD_MODEL, buildPlannerSourceMaterial(noteMaterials), input.count, {
			titleHint: input.exam.subject?.trim() || input.exam.title,
			existingFronts: existingFronts.map((card) => card.front),
		});
	});

	const usageResult = await recordQuotaUsage(input.userId, {
		category: "flashcard",
		model: generation.model,
		requests: 1,
		flashcards: generation.cards.length,
	});
	if (!usageResult.allowed) {
		throw new QuotaExceededError(usageResult.error ?? "Flashcard generation limit reached", generation.model, usageResult.resetAt);
	}

	const createdCards = await prisma.$transaction(async (tx) => {
		const persistedCards = await Promise.all(
			generation.cards.map((card) =>
				tx.flashcard.create({
					data: {
						deckId: input.deckId,
						front: card.front.trim(),
						back: card.back.trim(),
					},
				}),
			),
		);

		await tx.flashcardDeck.update({
			where: {
				id: input.deckId,
			},
			data: {
				cardCount: {
					increment: persistedCards.length,
				},
			},
		});

		return persistedCards;
	});

	return createdCards.map((card) =>
		serializePlannerStudyCard(card, {
			sessionId: input.sessionId,
			examId: input.exam.id,
			examTitle: input.exam.title,
		}),
	);
}

async function takeNextPlannerStudyCard(userId: string, queue: PlannerStudyQueueExam[]) {
	for (let index = 0; index < queue.length; index += 1) {
		const currentExamQueue = queue[index];
		if (!currentExamQueue) {
			continue;
		}

		const queuedCards = Array.isArray(currentExamQueue.queuedCards) ? currentExamQueue.queuedCards : [];

		if (queuedCards.length > 0) {
			const [currentCard, ...restCards] = queuedCards;
			return {
				currentCard,
				queue: queue.map((queueExam, queueIndex) =>
					queueIndex === index
						? {
								...queueExam,
								queuedCards: restCards,
							}
						: queueExam,
				),
			};
		}

		if (currentExamQueue.remainingCount <= 0) {
			continue;
		}

		const [exam, session] = await Promise.all([
			prisma.exam.findFirst({
				where: {
					id: currentExamQueue.examId,
					userId,
				},
				select: {
					id: true,
					title: true,
					subject: true,
					noteIds: true,
					deckIds: true,
				},
			}),
			prisma.studySession.findFirst({
				where: {
					id: currentExamQueue.sessionId,
					userId,
					deckId: currentExamQueue.deckId,
				},
				select: {
					id: true,
				},
			}),
		]);

		if (!exam || !session) {
			throw new PlannerStudyError("Planner study session is no longer available", 404);
		}

		const batchCount = Math.min(PLANNER_FLASHCARD_BATCH_SIZE, currentExamQueue.remainingCount);
		const generatedCards = await generatePlannerStudyCards({
			userId,
			exam,
			deckId: currentExamQueue.deckId,
			sessionId: currentExamQueue.sessionId,
			count: batchCount,
		});

		if (generatedCards.length === 0) {
			throw new PlannerStudyError("Failed to generate the next study card", 500);
		}

		const [currentCard, ...generatedCardsToQueue] = generatedCards;
		return {
			currentCard,
			queue: queue.map((queueExam, queueIndex) =>
				queueIndex === index
					? {
							...queueExam,
							queuedCards: generatedCardsToQueue,
							remainingCount: Math.max(0, queueExam.remainingCount - generatedCards.length),
						}
					: queueExam,
			),
		};
	}

	return {
		currentCard: null,
		queue,
	};
}

export function getPlannerStudyErrorResponse(error: unknown) {
	if (error instanceof QuotaExceededError) {
		return NextResponseJson(
			{
				error: error.message,
				model: error.model,
				resetAt: error.resetAt,
			},
			error.status,
		);
	}

	if (error instanceof PlannerStudyError) {
		return NextResponseJson({ error: error.message }, error.status);
	}

	console.error("[planner] Unexpected planner study error:", error);
	return NextResponseJson({ error: "Failed to prepare planner study session" }, 500);
}

function NextResponseJson(body: Record<string, unknown>, status: number) {
	return Response.json(body, { status });
}

export async function startPlannerStudySession(userId: string, items: PlannerStudyItemInput[]): Promise<PlannerStudySessionPayload> {
	const normalizedItems = normalizePlannerStudyItems(items);
	if (normalizedItems.length === 0) {
		throw new PlannerStudyError("At least one planner study item is required", 400);
	}

	const exams = await prisma.exam.findMany({
		where: {
			id: {
				in: normalizedItems.map((item) => item.examId),
			},
			userId,
		},
		select: {
			id: true,
			title: true,
			subject: true,
			noteIds: true,
			deckIds: true,
		},
	});

	if (exams.length !== normalizedItems.length) {
		throw new PlannerStudyError("One or more exams are no longer available", 404);
	}

	const examById = new Map(exams.map((exam) => [exam.id, exam]));
	const now = new Date();
	const queue = await Promise.all(
		normalizedItems.map(async (item) => {
			const exam = examById.get(item.examId);
			if (!exam) {
				throw new PlannerStudyError("Exam not found", 404);
			}

			const deck = await ensureExamDeck(userId, exam);
			const [studySession, dueCards] = await Promise.all([
				prisma.studySession.create({
					data: {
						userId,
						deckId: deck.id,
					},
				}),
				prisma.flashcard.findMany({
					where: {
						deckId: deck.id,
						dueDate: {
							lte: now,
						},
					},
					orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
					take: item.questionCount,
				}),
			]);

			return {
				examId: exam.id,
				examTitle: exam.title,
				deckId: deck.id,
				sessionId: studySession.id,
				remainingCount: Math.max(0, item.questionCount - dueCards.length),
				queuedCards: dueCards.map((card) =>
					serializePlannerStudyCard(card, {
						sessionId: studySession.id,
						examId: exam.id,
						examTitle: exam.title,
					}),
				),
			} satisfies PlannerStudyQueueExam;
		}),
	);

	const nextState = await takeNextPlannerStudyCard(userId, queue);
	if (!nextState.currentCard) {
		throw new PlannerStudyError("There are no study cards scheduled for this session yet", 400);
	}

	return {
		title: normalizedItems.length === 1 ? (examById.get(normalizedItems[0]?.examId ?? "")?.title ?? "Planner Session") : "Today's Planner Session",
		currentCard: nextState.currentCard,
		queue: nextState.queue,
	};
}

export async function advancePlannerStudySession(userId: string, queue: PlannerStudyQueueExam[]) {
	return takeNextPlannerStudyCard(userId, queue);
}
