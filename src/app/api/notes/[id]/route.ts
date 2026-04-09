import { after, NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildFileAccessUrl } from "@/lib/file-url";
import { parseNoteCoverMeta } from "@/lib/note-cover";
import { prisma } from "@/lib/prisma";
import { normalizeBlockNoteContent } from "@/lib/blocknote-normalize";
import { invalidateWorkspaceTree } from "@/lib/server-data";
import { validateNoteTitle } from "@/lib/item-name-validation";
import { buildSearchableTextValue } from "@/lib/searchable-text";
import { markNoteEmbeddingStale } from "@/lib/note-server";
import { enqueueNoteEmbeddingJob } from "@/lib/note-embedding-job";
import { getNoteSchemaCapabilities } from "@/lib/note-schema";

type FolderPathSegment = {
	id: string;
	name: string;
};

async function buildFolderPathSegments(workspaceId: string, folderId: string | null): Promise<FolderPathSegment[]> {
	if (!folderId) {
		return [];
	}

	const folders = await prisma.folder.findMany({
		where: { workspaceId },
		select: {
			id: true,
			name: true,
			parentId: true,
		},
	});

	const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
	const segments: FolderPathSegment[] = [];
	let currentFolderId: string | null = folderId;

	while (currentFolderId) {
		const folder = folderMap.get(currentFolderId);
		if (!folder) {
			break;
		}

		segments.unshift({
			id: folder.id,
			name: folder.name,
		});
		currentFolderId = folder.parentId;
	}

	return segments;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;

	const note = await prisma.note.findFirst({
		where: {
			id,
			workspace: {
				userId: session.user.id,
			},
		},
		select: {
			id: true,
			title: true,
			emoji: true,
			workspaceId: true,
			folderId: true,
			coverImage: true,
			coverImageMeta: true,
			content: true,
			createdAt: true,
			updatedAt: true,
			workspace: {
				select: {
					name: true,
				},
			},
			folder: {
				select: {
					name: true,
				},
			},
		},
	});

	if (!note) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const { workspaceId, ...noteData } = note;
	const parsedCoverMeta = parseNoteCoverMeta(note.coverImageMeta);
	const coverImage = parsedCoverMeta?.source === "upload" ? buildFileAccessUrl(parsedCoverMeta.fileId) : note.coverImage;
	const folderPath = await buildFolderPathSegments(workspaceId, note.folderId);

	return NextResponse.json({
		...noteData,
		coverImage,
		folderPath,
		content: normalizeBlockNoteContent(note.content),
	});
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;
	const body = await req.json();
	const { title, folderId, emoji } = body;
	const content = body.content !== undefined ? normalizeBlockNoteContent(body.content) : undefined;

	const note = await prisma.note.findFirst({
		where: {
			id,
			workspace: {
				userId: session.user.id,
			},
		},
		select: {
			id: true,
			workspaceId: true,
		},
	});

	if (!note) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}
	const noteSchemaCapabilities = await getNoteSchemaCapabilities();

	const data: Record<string, unknown> = {};
	if (title !== undefined) {
		const validatedTitle = validateNoteTitle(title);
		if (!validatedTitle.ok) {
			return NextResponse.json({ error: validatedTitle.error }, { status: 400 });
		}

		data.title = validatedTitle.value;
	}
	if (content !== undefined) {
		data.content = content;
		if (noteSchemaCapabilities.hasSearchableTextColumn) {
			data.searchableText = buildSearchableTextValue(content);
		}
	}
	if (folderId !== undefined) data.folderId = folderId;
	if (emoji !== undefined) data.emoji = emoji;

	const updated = await prisma.$transaction(async (tx) => {
		const updatedNote: {
			id: string;
			title: string;
			emoji: string | null;
			folderId: string | null;
			updatedAt: Date;
		} = await tx.note.update({
			where: { id },
			data,
			select: {
				id: true,
				title: true,
				emoji: true,
				folderId: true,
				updatedAt: true,
			},
		});

		if (content !== undefined) {
			await markNoteEmbeddingStale(tx, id, noteSchemaCapabilities);
		}

		return updatedNote;
	});

	if (title !== undefined || folderId !== undefined || emoji !== undefined) {
		await invalidateWorkspaceTree(session.user.id, note.workspaceId);
	}

	if (content !== undefined) {
		after(async () => {
			try {
				await enqueueNoteEmbeddingJob({
					noteId: id,
					origin: req.nextUrl.origin,
					cookieHeader: req.headers.get("cookie"),
				});
			} catch (error) {
				console.error("[embedding] failed for note", id, error);
			}
		});
	}

	return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;

	const note = await prisma.note.findFirst({
		where: {
			id,
			workspace: {
				userId: session.user.id,
			},
		},
		select: {
			id: true,
			workspaceId: true,
		},
	});

	if (!note) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	// Delete associated files from storage then remove DB records and archive note in a single DB transaction
	const files = await prisma.file.findMany({ where: { noteId: id } });

	const supabase = (await import("@/lib/supabase/server")).createAdminClient();

	for (const f of files) {
		try {
			const { error: removeError } = await supabase.storage.from("stacknote-files").remove([f.path]);
			if (removeError) console.error("Supabase remove error for", f.path, removeError);
		} catch (err) {
			console.error("Error removing file from storage:", err);
		}
	}

	// Use a DB transaction to delete file records and archive the note atomically
	try {
		await prisma.$transaction([prisma.file.deleteMany({ where: { noteId: id } }), prisma.note.updateMany({ where: { id }, data: { isArchived: true } })]);
	} catch (err) {
		console.error("DB cleanup/archival failed:", err);
		return NextResponse.json({ error: "Failed to delete associated files" }, { status: 500 });
	}

	await invalidateWorkspaceTree(session.user.id, note.workspaceId);

	return NextResponse.json({ success: true });
}
