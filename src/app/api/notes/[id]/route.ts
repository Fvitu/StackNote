import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildFileAccessUrl } from "@/lib/file-url";
import { parseNoteCoverMeta } from "@/lib/note-cover";
import { prisma } from "@/lib/prisma";
import { normalizeBlockNoteContent } from "@/lib/blocknote-normalize";
import { invalidateWorkspaceTree } from "@/lib/server-data";
import { validateNoteTitle } from "@/lib/item-name-validation";
import { buildSearchableTextValue } from "@/lib/searchable-text";
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
		where: { workspaceId, deletedAt: null },
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
			deletedAt: null,
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
		return NextResponse.json({ error: "Not found" }, { status: 404 });
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
			deletedAt: null,
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
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	if (folderId !== undefined && folderId !== null) {
		const targetFolder = await prisma.folder.findFirst({
			where: {
				id: folderId,
				workspaceId: note.workspaceId,
				deletedAt: null,
			},
			select: {
				id: true,
			},
		});

		if (!targetFolder) {
			return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
		}
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

		return updatedNote;
	});

	if (title !== undefined || folderId !== undefined || emoji !== undefined) {
		await invalidateWorkspaceTree(session.user.id, note.workspaceId);
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
			deletedAt: null,
			workspace: {
				userId: session.user.id,
			},
		},
		select: {
			id: true,
			workspaceId: true,
			folderId: true,
		},
	});

	if (!note) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	await prisma.note.update({
		where: { id },
		data: {
			deletedAt: new Date(),
			originalParentId: note.folderId,
		},
	});

	await invalidateWorkspaceTree(session.user.id, note.workspaceId);

	return NextResponse.json({ success: true });
}
