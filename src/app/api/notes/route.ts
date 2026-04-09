import { after, NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateWorkspaceTree } from "@/lib/server-data";
import { validateNoteTitle } from "@/lib/item-name-validation";
import { enqueueNoteEmbeddingJob } from "@/lib/note-embedding-job";

export async function POST(req: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = await req.json();
	const { workspaceId, folderId, title } = body;
	let validatedTitleValue: string | undefined;

	if (!workspaceId) {
		return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
	}

	if (title !== undefined) {
		const validatedTitle = validateNoteTitle(title);
		if (!validatedTitle.ok) {
			return NextResponse.json({ error: validatedTitle.error }, { status: 400 });
		}
		validatedTitleValue = validatedTitle.value;
	}

	const workspace = await prisma.workspace.findFirst({
		where: { id: workspaceId, userId: session.user.id },
	});

	if (!workspace) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const maxOrder = await prisma.note.aggregate({
		where: { workspaceId, folderId: folderId ?? null },
		_max: { order: true },
	});

	const note = await prisma.note.create({
		data: {
			workspaceId,
			folderId: folderId ?? null,
			title: validatedTitleValue,
			order: (maxOrder._max.order ?? -1) + 1,
		},
		select: {
			id: true,
			title: true,
			emoji: true,
			folderId: true,
			order: true,
			updatedAt: true,
		},
	});

	await invalidateWorkspaceTree(session.user.id, workspaceId);
	after(async () => {
		try {
			await enqueueNoteEmbeddingJob({
				noteId: note.id,
				origin: req.nextUrl.origin,
				cookieHeader: req.headers.get("cookie"),
			});
		} catch (error) {
			console.error("[embedding] failed for note", note.id, error);
		}
	});

	return NextResponse.json(note, { status: 201 });
}
