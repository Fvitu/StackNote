import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AI_LIMITS, FALLBACK_QUIZ_MODEL, PRIMARY_QUIZ_MODEL } from "@/lib/ai-limits";
import { checkQuotaLimit, recordQuotaUsage } from "@/lib/rate-limit";
import { buildPlannerNoteMaterials, buildPlannerSourceMaterial } from "@/lib/planner-notes";
import { generatePlannerQuizQuestions } from "@/lib/planner-quiz-generation";
import type { QuizQuestion } from "@/lib/quiz";

export const maxDuration = 60;

interface PlannerSessionItem {
	examId?: string;
	questionCount?: number;
}

interface StartPlannerSessionRequest {
	items?: PlannerSessionItem[];
}

class QuotaExceededError extends Error {
	constructor(
		message: string,
		readonly model: string,
		readonly resetAt: string | null,
	) {
		super(message);
		this.name = "QuotaExceededError";
	}
}

function shuffle<T>(items: T[]) {
	const nextItems = [...items];
	for (let index = nextItems.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(Math.random() * (index + 1));
		[nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
	}
	return nextItems;
}

export async function POST(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: StartPlannerSessionRequest;
	try {
		body = (await request.json()) as StartPlannerSessionRequest;
	} catch {
		return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
	}

	const normalizedItems = Array.isArray(body.items)
		? Array.from(
				body.items
					.map((item) => ({
						examId: item.examId?.trim() ?? "",
						questionCount: Math.min(AI_LIMITS.QUIZ_MAX_PER_REQUEST, Math.max(1, Math.round(item.questionCount ?? 0))),
					}))
					.filter((item) => item.examId.length > 0 && item.questionCount > 0)
					.reduce<Map<string, number>>((map, item) => {
						const nextCount = (map.get(item.examId) ?? 0) + item.questionCount;
						map.set(item.examId, Math.min(AI_LIMITS.QUIZ_MAX_PER_REQUEST, nextCount));
						return map;
					}, new Map())
					.entries(),
		  ).map(([examId, questionCount]) => ({
				examId,
				questionCount,
			}))
		: [];

	if (normalizedItems.length === 0) {
		return NextResponse.json({ error: "At least one planner study item is required" }, { status: 400 });
	}

	const exams = await prisma.exam.findMany({
		where: {
			id: {
				in: normalizedItems.map((item) => item.examId),
			},
			userId: session.user.id,
		},
		select: {
			id: true,
			title: true,
			subject: true,
			noteIds: true,
		},
	});

	if (exams.length !== normalizedItems.length) {
		return NextResponse.json({ error: "One or more exams are no longer available" }, { status: 404 });
	}

	const examById = new Map(exams.map((exam) => [exam.id, exam]));
	const allNoteIds = Array.from(
		new Set(
			exams.flatMap((exam) => exam.noteIds).filter((noteId) => typeof noteId === "string" && noteId.trim().length > 0),
		),
	);

	const notes = await prisma.note.findMany({
		where: {
			id: {
				in: allNoteIds,
			},
			isArchived: false,
			workspace: {
				userId: session.user.id,
			},
		},
		select: {
			id: true,
			title: true,
			content: true,
			searchableText: true,
		},
	});

	const noteById = new Map(notes.map((note) => [note.id, note]));
	const requestedQuestionTotal = normalizedItems.reduce((sum, item) => sum + item.questionCount, 0);
	const primaryQuota = await checkQuotaLimit(session.user.id, {
		category: "quiz",
		model: PRIMARY_QUIZ_MODEL,
		requests: normalizedItems.length,
		questions: requestedQuestionTotal,
	});
	if (!primaryQuota.allowed) {
		return NextResponse.json(
			{
				error: primaryQuota.error ?? "Question generation limit reached",
				model: PRIMARY_QUIZ_MODEL,
				resetAt: primaryQuota.resetAt,
			},
			{ status: 429 },
		);
	}

	async function generateForModel(model: typeof PRIMARY_QUIZ_MODEL | typeof FALLBACK_QUIZ_MODEL) {
		const combinedQuestions: QuizQuestion[] = [];
		let totalTokensUsed = 0;

		for (const item of normalizedItems) {
			const exam = examById.get(item.examId);
			if (!exam) {
				throw new Error("Exam not found");
			}

			const examNotes = exam.noteIds
				.map((noteId) => noteById.get(noteId))
				.filter((note): note is NonNullable<typeof note> => note !== undefined);
			const noteMaterials = buildPlannerNoteMaterials(examNotes);
			if (noteMaterials.length === 0) {
				throw new Error(`"${exam.title}" does not have enough note content to generate questions yet`);
			}

			const generation = await generatePlannerQuizQuestions({
				model,
				sourceMaterial: buildPlannerSourceMaterial(noteMaterials),
				noteTitle: exam.subject?.trim() || exam.title,
				questionCount: item.questionCount,
				additionalInstructions: [
					"Prioritize factual accuracy and keep every answer fully grounded in the provided notes.",
					"Avoid duplicate questions and vary concepts, definitions, comparisons, and applications across the set.",
				],
			});

			totalTokensUsed += generation.tokensUsed;
			combinedQuestions.push(
				...generation.questions.map((question, index) => ({
					...question,
					id: `${exam.id}-${index + 1}-${question.id}`,
				})),
			);
		}

		return {
			model,
			questions: shuffle(combinedQuestions),
			tokensUsed: totalTokensUsed,
		};
	}

	try {
		const generation = await generateForModel(PRIMARY_QUIZ_MODEL).catch(async (primaryError) => {
			console.warn("[planner] Primary planner quiz generation failed, falling back to groq/compound-mini:", primaryError);

			const fallbackQuota = await checkQuotaLimit(session.user.id, {
				category: "quiz",
				model: FALLBACK_QUIZ_MODEL,
				requests: normalizedItems.length,
				questions: requestedQuestionTotal,
			});
			if (!fallbackQuota.allowed) {
				throw new QuotaExceededError(fallbackQuota.error ?? "Question generation limit reached", FALLBACK_QUIZ_MODEL, fallbackQuota.resetAt);
			}

			return generateForModel(FALLBACK_QUIZ_MODEL);
		});

		const usageResult = await recordQuotaUsage(session.user.id, {
			category: "quiz",
			model: generation.model,
			requests: normalizedItems.length,
			questions: generation.questions.length,
		});
		if (!usageResult.allowed) {
			throw new QuotaExceededError(usageResult.error ?? "Question generation limit reached", generation.model, usageResult.resetAt);
		}

		return NextResponse.json({
			title: normalizedItems.length === 1 ? (examById.get(normalizedItems[0]?.examId ?? "")?.title ?? "Planner Session") : "Today's Planner Session",
			questions: generation.questions,
			model: generation.model,
		});
	} catch (error) {
		console.error("[planner] Failed to start planner session:", error);
		if (error instanceof QuotaExceededError) {
			return NextResponse.json(
				{
					error: error.message,
					model: error.model,
					resetAt: error.resetAt,
				},
				{ status: 429 },
			);
		}
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Failed to generate planner questions",
			},
			{ status: 500 },
		);
	}
}
