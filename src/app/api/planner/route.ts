import { NextRequest, NextResponse } from "next/server";

import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildPlannerNoteMaterials, type PlannerNoteSource } from "@/lib/planner-notes";

interface CreateExamRequest {
	title?: string;
	subject?: string;
	examDate?: string;
	noteIds?: string[];
	dailyStudyMinutes?: number;
}

interface UpdateExamRequest extends CreateExamRequest {
	examId?: string;
}

interface ValidatedExamPayload {
	title: string;
	subject: string | null;
	examDate: Date;
	noteIds: string[];
	dailyStudyMinutes: number;
}

class PlannerInputError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "PlannerInputError";
	}
}

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MUTABLE_CACHE_CONTROL = "private, max-age=0, must-revalidate";

function parseDateKeyToUtcDate(value: string) {
	const match = DATE_KEY_PATTERN.exec(value);
	if (!match) {
		return null;
	}

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const parsedDate = new Date(Date.UTC(year, month - 1, day));

	if (parsedDate.getUTCFullYear() !== year || parsedDate.getUTCMonth() !== month - 1 || parsedDate.getUTCDate() !== day) {
		return null;
	}

	return parsedDate;
}

function toDateKeyFromDate(value: Date) {
	const timeValue = value.getTime();
	if (!Number.isFinite(timeValue)) {
		return null;
	}

	return new Date(timeValue).toISOString().slice(0, 10);
}

function todayString() {
	return new Date().toISOString().slice(0, 10);
}

function clampStudyMinutes(value: number | undefined) {
	return Math.min(60, Math.max(10, Math.round(value ?? 20)));
}

type PlannerNoteRow = {
	id: string;
	title: string;
	updatedAt: Date;
	searchableText?: string | null;
};

type PlannerPlanDayRow = {
	id: string;
	examId: string;
	date: string;
	cardIds: string[];
	estimatedMinutes: number;
	questionCount?: number;
	exam?: {
		id: string;
		title: string;
	};
};

type PlannerExamRow = {
	id: string;
	title: string;
	subject: string | null;
	examDate: Date;
	noteIds: string[];
	dailyStudyMinutes: number;
	studyPlanDays: PlannerPlanDayRow[];
};

function isMissingColumnError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
	return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022";
}

function getPlanDayQuestionCount(planDay: PlannerPlanDayRow) {
	if (typeof planDay.questionCount === "number") {
		return planDay.questionCount;
	}

	return Array.isArray(planDay.cardIds) ? planDay.cardIds.length : 0;
}

async function validateExamPayload(
	userId: string,
	body: CreateExamRequest,
	options: {
		allowPastDate?: boolean;
	},
): Promise<ValidatedExamPayload> {
	const title = body.title?.trim();
	const examDate = body.examDate?.trim();
	const noteIds = Array.isArray(body.noteIds)
		? Array.from(new Set(body.noteIds.filter((noteId) => typeof noteId === "string" && noteId.trim().length > 0)))
		: [];

	if (!title) {
		throw new PlannerInputError("Title is required", 400);
	}

	if (!examDate) {
		throw new PlannerInputError("Exam date is required", 400);
	}

	const parsedExamDate = parseDateKeyToUtcDate(examDate);
	if (!parsedExamDate) {
		throw new PlannerInputError("Exam date must use YYYY-MM-DD format", 400);
	}

	if (!options.allowPastDate) {
		const todayUtc = parseDateKeyToUtcDate(todayString());
		if (todayUtc && parsedExamDate.getTime() < todayUtc.getTime()) {
			throw new PlannerInputError("Exam date must be today or later", 400);
		}
	}

	if (noteIds.length === 0) {
		throw new PlannerInputError("Select at least one note", 400);
	}

	const accessibleNotes = await prisma.note.findMany({
		where: {
			id: { in: noteIds },
			isArchived: false,
			deletedAt: null,
			workspace: {
				userId,
			},
		},
		select: { id: true },
	});

	if (accessibleNotes.length !== noteIds.length) {
		throw new PlannerInputError("One or more notes are not accessible", 403);
	}

	return {
		title,
		subject: body.subject?.trim() || null,
		examDate: parsedExamDate,
		noteIds,
		dailyStudyMinutes: clampStudyMinutes(body.dailyStudyMinutes),
	};
}

async function loadPlannerData(userId: string, todayKey: string) {
	try {
		const [notes, exams, todaysPlanDays] = await Promise.all([
			prisma.note.findMany({
				where: {
					isArchived: false,
					deletedAt: null,
					workspace: {
						userId,
					},
				},
				orderBy: { updatedAt: "desc" },
				select: {
					id: true,
					title: true,
					searchableText: true,
					updatedAt: true,
				},
			}),
			prisma.exam.findMany({
				where: {
					userId,
					isCompleted: false,
				},
				include: {
					studyPlanDays: {
						orderBy: { date: "asc" },
						select: {
							id: true,
							examId: true,
							date: true,
							cardIds: true,
							questionCount: true,
							estimatedMinutes: true,
						},
					},
				},
				orderBy: { examDate: "asc" },
			}),
			prisma.studyPlanDay.findMany({
				where: {
					date: todayKey,
					exam: {
						userId,
						isCompleted: false,
					},
				},
				select: {
					id: true,
					examId: true,
					date: true,
					cardIds: true,
					questionCount: true,
					estimatedMinutes: true,
					exam: {
						select: {
							id: true,
							title: true,
						},
					},
				},
				orderBy: { estimatedMinutes: "desc" },
			}),
		]);

		return {
			notes: notes as PlannerNoteRow[],
			exams: exams as PlannerExamRow[],
			todaysPlanDays: todaysPlanDays as PlannerPlanDayRow[],
		};
	} catch (error) {
		if (!isMissingColumnError(error)) {
			throw error;
		}

		const prismaError = error;

		console.warn("[planner] Falling back to legacy planner columns", {
			code: prismaError.code,
			modelName: prismaError.meta?.modelName,
		});

		const [notes, exams, todaysPlanDays] = await Promise.all([
			prisma.note.findMany({
				where: {
					isArchived: false,
					deletedAt: null,
					workspace: {
						userId,
					},
				},
				orderBy: { updatedAt: "desc" },
				select: {
					id: true,
					title: true,
					updatedAt: true,
				},
			}),
			prisma.exam.findMany({
				where: {
					userId,
					isCompleted: false,
				},
				include: {
					studyPlanDays: {
						orderBy: { date: "asc" },
						select: {
							id: true,
							examId: true,
							date: true,
							cardIds: true,
							estimatedMinutes: true,
						},
					},
				},
				orderBy: { examDate: "asc" },
			}),
			prisma.studyPlanDay.findMany({
				where: {
					date: todayKey,
					exam: {
						userId,
						isCompleted: false,
					},
				},
				select: {
					id: true,
					examId: true,
					date: true,
					cardIds: true,
					estimatedMinutes: true,
					exam: {
						select: {
							id: true,
							title: true,
						},
					},
				},
				orderBy: { estimatedMinutes: "desc" },
			}),
		]);

		return {
			notes: notes as PlannerNoteRow[],
			exams: exams as PlannerExamRow[],
			todaysPlanDays: todaysPlanDays as PlannerPlanDayRow[],
		};
	}
}

export async function GET() {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const todayKey = todayString();
	const { notes, exams, todaysPlanDays } = await loadPlannerData(session.user.id, todayKey);

	const serializedExams = exams.flatMap((exam) => {
		const examDateKey = toDateKeyFromDate(exam.examDate);
		if (!examDateKey) {
			console.error("[planner] Skipping exam with invalid examDate", { examId: exam.id });
			return [];
		}

		return [
			{
				...exam,
				examDate: examDateKey,
			},
		];
	});

	return NextResponse.json(
		{
			notes: notes.map((note) => ({
				id: note.id,
				title: note.title,
				excerpt: note.searchableText?.slice(0, 180) ?? null,
				updatedAt: note.updatedAt.toISOString(),
			})),
			exams: serializedExams.map((exam) => ({
				id: exam.id,
				title: exam.title,
				subject: exam.subject,
				examDate: exam.examDate,
				noteIds: exam.noteIds,
				dailyStudyMinutes: exam.dailyStudyMinutes,
				plannedQuestionCount: exam.studyPlanDays.reduce((sum, day) => sum + getPlanDayQuestionCount(day), 0),
			})),
			todaysPlan: todaysPlanDays.map((planDay) => ({
				id: planDay.id,
				examId: planDay.examId,
				examTitle: planDay.exam?.title ?? "",
				date: planDay.date,
				questionCount: getPlanDayQuestionCount(planDay),
				estimatedMinutes: planDay.estimatedMinutes,
			})),
		},
		{
			headers: {
				"Cache-Control": MUTABLE_CACHE_CONTROL,
			},
		},
	);
}

export async function POST(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: CreateExamRequest;
	try {
		body = (await request.json()) as CreateExamRequest;
	} catch {
		return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
	}

	try {
		const payload = await validateExamPayload(session.user.id, body, { allowPastDate: false });

		// Ensure linked notes contain enough text to build a study plan before persisting the exam.
		const notes = await prisma.note.findMany({
			where: {
				id: { in: payload.noteIds },
				isArchived: false,
				deletedAt: null,
				workspace: { userId: session.user.id },
			},
			select: {
				id: true,
				title: true,
				content: true,
				searchableText: true,
			},
		});

		const plannerNotes: PlannerNoteSource[] = notes;
		const noteMaterials = buildPlannerNoteMaterials(plannerNotes);
		if (noteMaterials.length === 0) {
			throw new PlannerInputError("The linked notes do not contain enough text to build a study plan yet", 400);
		}

		const exam = await prisma.exam.create({
			data: {
				userId: session.user.id,
				title: payload.title,
				subject: payload.subject,
				examDate: payload.examDate,
				deckIds: [],
				noteIds: payload.noteIds,
				dailyStudyMinutes: payload.dailyStudyMinutes,
			},
		});

		return NextResponse.json({ exam });
	} catch (error) {
		if (error instanceof PlannerInputError) {
			return NextResponse.json({ error: error.message }, { status: error.status });
		}

		console.error("[planner] Failed to create exam:", error);
		return NextResponse.json({ error: "Failed to create exam" }, { status: 500 });
	}
}

export async function PATCH(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: UpdateExamRequest;
	try {
		body = (await request.json()) as UpdateExamRequest;
	} catch {
		return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
	}

	const examId = body.examId?.trim();
	if (!examId) {
		return NextResponse.json({ error: "examId is required" }, { status: 400 });
	}

	try {
		const payload = await validateExamPayload(session.user.id, body, { allowPastDate: true });
		const existingExam = await prisma.exam.findFirst({
			where: {
				id: examId,
				userId: session.user.id,
			},
			select: {
				id: true,
				deckIds: true,
			},
		});

		if (!existingExam) {
			return NextResponse.json({ error: "Exam not found" }, { status: 404 });
		}

		const deckTitle = payload.subject ?? payload.title;
		const existingDeckIds = Array.isArray(existingExam.deckIds) ? existingExam.deckIds : [];
		const exam = await prisma.$transaction(async (tx) => {
			const updatedExam = await tx.exam.update({
				where: { id: existingExam.id },
				data: {
					title: payload.title,
					subject: payload.subject,
					examDate: payload.examDate,
					noteIds: payload.noteIds,
					dailyStudyMinutes: payload.dailyStudyMinutes,
				},
			});

			if (existingDeckIds.length > 0) {
				await tx.flashcardDeck.updateMany({
					where: {
						id: {
							in: existingDeckIds,
						},
						userId: session.user.id,
					},
					data: {
						title: deckTitle,
					},
				});
			}

			return updatedExam;
		});

		return NextResponse.json({ exam });
	} catch (error) {
		if (error instanceof PlannerInputError) {
			return NextResponse.json({ error: error.message }, { status: error.status });
		}

		console.error("[planner] Failed to update exam:", error);
		return NextResponse.json({ error: "Failed to update exam" }, { status: 500 });
	}
}
