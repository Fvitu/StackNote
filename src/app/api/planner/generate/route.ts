import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
	buildPlannerNoteMaterials,
	distributeQuestionsAcrossDays,
	getDailyQuestionCapacity,
	getEstimatedMinutesForQuestionCount,
} from "@/lib/planner-notes";

interface GeneratePlanRequest {
	examId?: string;
}

function enumerateDates(startDate: Date, endDate: Date) {
	const dates: Date[] = [];
	const current = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
	const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));

	while (current <= end) {
		dates.push(new Date(current));
		current.setUTCDate(current.getUTCDate() + 1);
	}

	return dates;
}

function toDateKey(date: Date) {
	return date.toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: GeneratePlanRequest;
	try {
		body = (await request.json()) as GeneratePlanRequest;
	} catch {
		return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
	}

	const examId = body.examId?.trim();
	if (!examId) {
		return NextResponse.json({ error: "examId is required" }, { status: 400 });
	}

	const exam = await prisma.exam.findFirst({
		where: {
			id: examId,
			userId: session.user.id,
		},
	});

	if (!exam) {
		return NextResponse.json({ error: "Exam not found" }, { status: 404 });
	}

	const examNoteIds = Array.isArray(exam.noteIds) ? exam.noteIds : [];
	if (examNoteIds.length === 0) {
		return NextResponse.json({ error: "This exam does not have any linked notes yet" }, { status: 400 });
	}

	const notes = await prisma.note.findMany({
		where: {
			id: {
				in: examNoteIds,
			},
			isArchived: false,
			deletedAt: null,
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

	const noteMaterials = buildPlannerNoteMaterials(notes);
	if (noteMaterials.length === 0) {
		return NextResponse.json({ error: "The linked notes do not contain enough text to build a study plan yet" }, { status: 400 });
	}

	const today = new Date();
	const planningDates = enumerateDates(today, exam.examDate);
	const dailyQuestionCapacity = getDailyQuestionCapacity(exam.dailyStudyMinutes);
	const totalQuestionBudget = Math.min(
		noteMaterials.reduce((sum, note) => sum + note.estimatedQuestionCount, 0),
		planningDates.length * dailyQuestionCapacity,
	);
	const dailyQuestionCounts = distributeQuestionsAcrossDays(totalQuestionBudget, planningDates.length, dailyQuestionCapacity);
	const generatedDays = planningDates
		.map((date, index) => {
			const questionCount = dailyQuestionCounts[index] ?? 0;
			return {
				date: toDateKey(date),
				questionCount,
				estimatedMinutes: getEstimatedMinutesForQuestionCount(questionCount),
			};
		})
		.filter((day) => day.questionCount > 0);

	await prisma.$transaction(async (tx) => {
		await tx.studyPlanDay.deleteMany({
			where: { examId: exam.id },
		});

		if (generatedDays.length > 0) {
			await tx.studyPlanDay.createMany({
				data: generatedDays.map((day) => ({
					examId: exam.id,
					date: day.date,
					cardIds: [],
					questionCount: day.questionCount,
					estimatedMinutes: day.estimatedMinutes,
				})),
			});
		}
	});

	const plan = await prisma.studyPlanDay.findMany({
		where: { examId: exam.id },
		orderBy: { date: "asc" },
	});

	return NextResponse.json({ exam, plan });
}

export async function DELETE(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: GeneratePlanRequest;
	try {
		body = (await request.json()) as GeneratePlanRequest;
	} catch {
		return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
	}

	const examId = body.examId?.trim();
	if (!examId) {
		return NextResponse.json({ error: "examId is required" }, { status: 400 });
	}

	const exam = await prisma.exam.findFirst({
		where: {
			id: examId,
			userId: session.user.id,
		},
		select: {
			id: true,
		},
	});

	if (!exam) {
		return NextResponse.json({ error: "Exam not found" }, { status: 404 });
	}

	await prisma.exam.delete({
		where: {
			id: exam.id,
		},
	});

	return NextResponse.json({ examId: exam.id });
}
