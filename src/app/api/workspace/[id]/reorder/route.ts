import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateWorkspaceTree } from "@/lib/server-data";

type FolderReorderInput = {
	id: string;
	parentId: string | null;
	order: number;
};

type NoteReorderInput = {
	id: string;
	folderId: string | null;
	order: number;
};

function normalizeOrder(value: unknown) {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return null;
	}

	return Math.max(0, Math.trunc(value));
}

function parseFolderUpdates(raw: unknown): FolderReorderInput[] | null {
	if (!Array.isArray(raw)) {
		return [];
	}

	const updates: FolderReorderInput[] = [];
	for (const item of raw) {
		if (!item || typeof item !== "object") {
			return null;
		}

		const candidate = item as Record<string, unknown>;
		const id = typeof candidate.id === "string" && candidate.id.length > 0 ? candidate.id : null;
		const parentId = candidate.parentId === null || typeof candidate.parentId === "string" ? (candidate.parentId as string | null) : null;
		const order = normalizeOrder(candidate.order);

		if (!id || order === null) {
			return null;
		}

		updates.push({ id, parentId, order });
	}

	return updates;
}

function parseNoteUpdates(raw: unknown): NoteReorderInput[] | null {
	if (!Array.isArray(raw)) {
		return [];
	}

	const updates: NoteReorderInput[] = [];
	for (const item of raw) {
		if (!item || typeof item !== "object") {
			return null;
		}

		const candidate = item as Record<string, unknown>;
		const id = typeof candidate.id === "string" && candidate.id.length > 0 ? candidate.id : null;
		const folderId = candidate.folderId === null || typeof candidate.folderId === "string" ? (candidate.folderId as string | null) : null;
		const order = normalizeOrder(candidate.order);

		if (!id || order === null) {
			return null;
		}

		updates.push({ id, folderId, order });
	}

	return updates;
}


function hasFolderCycle(folderParents: Map<string, string | null>) {
	for (const [folderId] of folderParents) {
		const visited = new Set<string>();
		let cursor: string | null = folderId;

		while (cursor) {
			if (visited.has(cursor)) {
				return true;
			}

			visited.add(cursor);
			cursor = folderParents.get(cursor) ?? null;
		}
	}

	return false;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { id: workspaceId } = await params;
		const body = await request.json();
		const folderUpdates = parseFolderUpdates((body as Record<string, unknown>)?.folders);
		const noteUpdates = parseNoteUpdates((body as Record<string, unknown>)?.notes);

		if (!folderUpdates || !noteUpdates) {
			return NextResponse.json({ error: "Invalid reorder payload" }, { status: 400 });
		}

		if (folderUpdates.length === 0 && noteUpdates.length === 0) {
			return NextResponse.json({ success: true, applied: { folders: 0, notes: 0 } });
		}

		const workspace = await prisma.workspace.findFirst({
			where: {
				id: workspaceId,
				userId: session.user.id,
			},
			select: { id: true },
		});

		if (!workspace) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}

		const [workspaceFolders, workspaceNotes] = await Promise.all([
			prisma.folder.findMany({
				where: { workspaceId },
				select: { id: true, parentId: true },
			}),
			prisma.note.findMany({
				where: { workspaceId, isArchived: false },
				select: { id: true, folderId: true },
			}),
		]);

		const folderIds = new Set(workspaceFolders.map((folder) => folder.id));
		const noteIds = new Set(workspaceNotes.map((note) => note.id));

		for (const update of folderUpdates) {
			if (!folderIds.has(update.id)) {
				return NextResponse.json({ error: "Folder not found in workspace" }, { status: 400 });
			}
			if (update.parentId && !folderIds.has(update.parentId)) {
				return NextResponse.json({ error: "Invalid folder parentId" }, { status: 400 });
			}
		}

		for (const update of noteUpdates) {
			if (!noteIds.has(update.id)) {
				return NextResponse.json({ error: "Note not found in workspace" }, { status: 400 });
			}
			if (update.folderId && !folderIds.has(update.folderId)) {
				return NextResponse.json({ error: "Invalid note folderId" }, { status: 400 });
			}
		}

		const folderParents = new Map<string, string | null>(workspaceFolders.map((folder) => [folder.id, folder.parentId]));
		for (const update of folderUpdates) {
			folderParents.set(update.id, update.parentId);
		}

		if (hasFolderCycle(folderParents)) {
			return NextResponse.json({ error: "Folder hierarchy cycle detected" }, { status: 400 });
		}

		await prisma.$transaction(async (tx) => {
			const timestamp = new Date();

			for (const update of folderUpdates) {
				await tx.$executeRaw`
					UPDATE "folders"
					SET "parentId" = ${update.parentId},
						"order" = ${update.order},
						"updatedAt" = ${timestamp}
					WHERE "id" = ${update.id}
				`;
			}

			for (const update of noteUpdates) {
				await tx.$executeRaw`
					UPDATE "notes"
					SET "folderId" = ${update.folderId},
						"order" = ${update.order},
						"updatedAt" = ${timestamp}
					WHERE "id" = ${update.id}
				`;
			}
		});

		await invalidateWorkspaceTree(session.user.id, workspaceId);

		return NextResponse.json({
			success: true,
			applied: {
				folders: folderUpdates.length,
				notes: noteUpdates.length,
			},
		});
	} catch (error) {
		console.error("Failed to reorder workspace tree:", error);

		return NextResponse.json({ error: "Failed to reorder workspace tree" }, { status: 500 });
	}
}
