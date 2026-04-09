import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const EMPTY_CONTENT: Prisma.InputJsonValue = [];

export async function GET() {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const quickNote = await prisma.quickNote.upsert({
		where: { userId: session.user.id },
		update: {},
		create: {
			userId: session.user.id,
			content: EMPTY_CONTENT,
		},
	});

	return NextResponse.json(quickNote);
}

export async function PATCH(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: { content?: Prisma.JsonValue };
	try {
		body = (await request.json()) as { content?: Prisma.JsonValue };
	} catch {
		return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
	}

	const quickNote = await prisma.quickNote.upsert({
		where: { userId: session.user.id },
		update: {
			content: (body.content ?? EMPTY_CONTENT) as Prisma.InputJsonValue,
		},
		create: {
			userId: session.user.id,
			content: (body.content ?? EMPTY_CONTENT) as Prisma.InputJsonValue,
		},
	});

	return NextResponse.json(quickNote);
}
