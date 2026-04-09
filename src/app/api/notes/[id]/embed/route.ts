import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { embedNoteAsync } from "@/lib/embed-note";
import { prisma } from "@/lib/prisma";
import { buildSearchableTextValue } from "@/lib/searchable-text";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;
	const note = await prisma.note.findFirst({
		where: {
			id,
			isArchived: false,
			workspace: {
				userId: session.user.id,
			},
		},
		select: {
			id: true,
			content: true,
		},
	});

	if (!note) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	await embedNoteAsync(note.id, buildSearchableTextValue(note.content));
	return NextResponse.json({ ok: true });
}
