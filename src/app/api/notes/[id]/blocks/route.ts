import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { autosaveNoteContent } from "@/lib/note-server";

type BlocksPatchBody = {
	content?: unknown;
	changedBlockIds?: string[];
};

const MUTABLE_CACHE_CONTROL = "private, max-age=0, must-revalidate";

async function getAuthorizedNote(noteId: string, userId: string) {
	const note = await prisma.note.findFirst({
		where: {
			id: noteId,
			deletedAt: null,
			workspace: {
				userId,
			},
		},
		select: { id: true },
	});

	if (!note) {
		return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
	}

	return { note };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;
	const access = await getAuthorizedNote(id, session.user.id);
	if ("error" in access) {
		return access.error;
	}

	let body: BlocksPatchBody;
	try {
		body = (await req.json()) as BlocksPatchBody;
	} catch {
		return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
	}

	if (body.content === undefined) {
		return NextResponse.json({ error: "content is required" }, { status: 400 });
	}

	const result = await prisma.$transaction(async (tx) => {
		return autosaveNoteContent(tx, id, body.content);
	});

	return NextResponse.json(
		{
			id,
			content: result.normalizedContent,
			updatedAt: result.updatedNote.updatedAt,
			changedBlockIds: Array.isArray(body.changedBlockIds) ? body.changedBlockIds : [],
		},
		{
			headers: {
				"Cache-Control": MUTABLE_CACHE_CONTROL,
			},
		},
	);
}
