import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await context.params;
	const studySession = await prisma.studySession.findFirst({
		where: {
			id,
			userId: session.user.id,
		},
		include: {
			reviews: true,
			deck: {
				select: {
					title: true,
				},
			},
		},
	});

	if (!studySession) {
		return NextResponse.json({ error: "Study session not found" }, { status: 404 });
	}

	const finishedAt = new Date();
	const totalTime = Math.max(0, Math.round((finishedAt.getTime() - studySession.startedAt.getTime()) / 1000));

	const updatedSession = await prisma.studySession.update({
		where: { id: studySession.id },
		data: {
			finishedAt,
			totalTime,
		},
	});

	return NextResponse.json({
		session: updatedSession,
		title: studySession.deck.title,
		cardsStudied: updatedSession.cardsStudied,
		cardsCorrect: updatedSession.cardsCorrect,
		totalTime,
		accuracy: updatedSession.cardsStudied > 0 ? updatedSession.cardsCorrect / updatedSession.cardsStudied : 0,
	});
}
