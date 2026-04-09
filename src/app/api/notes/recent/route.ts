import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const searchParams = request.nextUrl.searchParams;
	const requestedLimit = Number(searchParams.get("limit") ?? "5");
	const limit = Number.isFinite(requestedLimit) ? Math.min(20, Math.max(1, requestedLimit)) : 5;

	const notes = await prisma.note.findMany({
		where: {
			isArchived: false,
			workspace: {
				userId: session.user.id,
			},
		},
		orderBy: {
			updatedAt: "desc",
		},
		take: limit,
		select: {
			id: true,
			title: true,
			emoji: true,
			updatedAt: true,
		},
	});

	return NextResponse.json({ notes });
}
