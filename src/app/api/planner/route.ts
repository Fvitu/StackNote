import { NextRequest, NextResponse } from "next/server";

import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface CreateExamRequest {
	title?: string;
	subject?: string;
	examDate?: string;
	noteIds?: string[];
	dailyStudyMinutes?: number;
}

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

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

async function loadPlannerData(userId: string, todayUtc: Date, todayKey: string) {
	try {
		const [notes, exams, todaysPlanDays] = await Promise.all([
			prisma.note.findMany({
				where: {
					isArchived: false,
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
					examDate: {
						gte: todayUtc,
					},
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
					examDate: {
						gte: todayUtc,
					},
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
	const todayUtc = new Date(`${todayKey}T00:00:00.000Z`);
	const { notes, exams, todaysPlanDays } = await loadPlannerData(session.user.id, todayUtc, todayKey);

	const serializedExams = exams.flatMap((exam) => {
		const examDateKey = toDateKeyFromDate(exam.examDate);
		if (!examDateKey) {
			// Keep planner available even if a legacy row has an invalid timestamp.
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

	return NextResponse.json({
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
	});
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

	const title = body.title?.trim();
	const examDate = body.examDate?.trim();
	const noteIds = Array.isArray(body.noteIds) ? Array.from(new Set(body.noteIds.filter(Boolean))) : [];

	if (!title) {
		return NextResponse.json({ error: "Title is required" }, { status: 400 });
	}

	if (!examDate) {
		return NextResponse.json({ error: "Exam date is required" }, { status: 400 });
	}

	const parsedExamDate = parseDateKeyToUtcDate(examDate);
	if (!parsedExamDate) {
		return NextResponse.json({ error: "Exam date must use YYYY-MM-DD format" }, { status: 400 });
	}

	const todayUtc = parseDateKeyToUtcDate(todayString());
	if (todayUtc && parsedExamDate.getTime() < todayUtc.getTime()) {
		return NextResponse.json({ error: "Exam date must be today or later" }, { status: 400 });
	}

	if (noteIds.length === 0) {
		return NextResponse.json({ error: "Select at least one note" }, { status: 400 });
	}

	const accessibleNotes = await prisma.note.findMany({
		where: {
			id: { in: noteIds },
			isArchived: false,
			workspace: {
				userId: session.user.id,
			},
		},
		select: { id: true },
	});

	if (accessibleNotes.length !== noteIds.length) {
		return NextResponse.json({ error: "One or more notes are not accessible" }, { status: 403 });
	}

	const exam = await prisma.exam.create({
		data: {
			userId: session.user.id,
			title,
			subject: body.subject?.trim() || null,
			examDate: parsedExamDate,
			deckIds: [],
			noteIds,
			dailyStudyMinutes: Math.min(60, Math.max(10, Math.round(body.dailyStudyMinutes ?? 20))),
		},
	});

	return NextResponse.json({ exam });
}
