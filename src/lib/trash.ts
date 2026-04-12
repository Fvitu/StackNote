import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { parseNoteCoverMeta } from "@/lib/note-cover";
import { createAdminClient } from "@/lib/supabase/server";

const STORAGE_BUCKET = "stacknote-files";
const STORAGE_DELETE_BATCH_SIZE = 100;

export const TRASH_RETENTION_DAYS = 30;
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

type TrashDbClient = PrismaClient | Prisma.TransactionClient;

type FolderRecord = {
	id: string;
	parentId: string | null;
	originalParentId: string | null;
	deletedAt: Date | null;
	workspaceId: string;
};

function chunk<T>(items: T[], size: number): T[][] {
	const result: T[][] = [];

	for (let index = 0; index < items.length; index += size) {
		result.push(items.slice(index, index + size));
	}

	return result;
}

export function getTrashExpiryDate(deletedAt: Date) {
	return new Date(deletedAt.getTime() + TRASH_RETENTION_MS);
}

export function getTrashCutoffDate(now = new Date()) {
	return new Date(now.getTime() - TRASH_RETENTION_MS);
}

async function getOwnedFolderById(db: TrashDbClient, userId: string, folderId: string) {
	return db.folder.findFirst({
		where: {
			id: folderId,
			workspace: {
				userId,
			},
		},
		select: {
			id: true,
			parentId: true,
			originalParentId: true,
			deletedAt: true,
			workspaceId: true,
		},
	});
}

export async function resolveRestoredParentId(db: TrashDbClient, userId: string, parentId: string | null | undefined) {
	if (!parentId) {
		return null;
	}

	const parent = await db.folder.findFirst({
		where: {
			id: parentId,
			deletedAt: null,
			workspace: {
				userId,
			},
		},
		select: {
			id: true,
		},
	});

	return parent?.id ?? null;
}

export async function restoreDeletedAncestorChain(db: TrashDbClient, userId: string, parentFolderId: string | null | undefined) {
	if (!parentFolderId) {
		return {
			restoredCount: 0,
			resolvedParentId: null,
		};
	}

	const chain: FolderRecord[] = [];
	let cursorId: string | null = parentFolderId;

	while (cursorId) {
		const folder = await getOwnedFolderById(db, userId, cursorId);
		if (!folder) {
			return {
				restoredCount: 0,
				resolvedParentId: null,
			};
		}

		chain.push(folder);

		if (!folder.deletedAt) {
			break;
		}

		cursorId = folder.originalParentId ?? folder.parentId;
	}

	let restoredCount = 0;

	for (const folder of chain.filter((item) => item.deletedAt !== null).reverse()) {
		const nextParentId = await resolveRestoredParentId(db, userId, folder.originalParentId ?? folder.parentId);

		await db.folder.update({
			where: { id: folder.id },
			data: {
				parentId: nextParentId,
				deletedAt: null,
				originalParentId: null,
			},
		});

		restoredCount += 1;
	}

	return {
		restoredCount,
		resolvedParentId: await resolveRestoredParentId(db, userId, parentFolderId),
	};
}

export async function collectFolderSubtree(db: TrashDbClient, workspaceId: string, rootFolderId: string) {
	const folders = await db.folder.findMany({
		where: {
			workspaceId,
		},
		select: {
			id: true,
			parentId: true,
		},
	});

	const childrenByParent = new Map<string | null, string[]>();

	for (const folder of folders) {
		const siblings = childrenByParent.get(folder.parentId);
		if (siblings) {
			siblings.push(folder.id);
			continue;
		}

		childrenByParent.set(folder.parentId, [folder.id]);
	}

	const folderIds: string[] = [];
	const queue = [rootFolderId];
	const seen = new Set<string>();

	while (queue.length > 0) {
		const folderId = queue.shift();
		if (!folderId || seen.has(folderId)) {
			continue;
		}

		seen.add(folderId);
		folderIds.push(folderId);

		for (const childId of childrenByParent.get(folderId) ?? []) {
			if (!seen.has(childId)) {
				queue.push(childId);
			}
		}
	}

	const notes = await db.note.findMany({
		where: {
			workspaceId,
			folderId: {
				in: folderIds,
			},
		},
		select: {
			id: true,
		},
	});

	return {
		folderIds,
		noteIds: notes.map((note) => note.id),
	};
}

export async function collectStoredFilePathsForNotes(db: TrashDbClient, noteIds: string[]) {
	if (noteIds.length === 0) {
		return [];
	}

	const [files, notes] = await Promise.all([
		db.file.findMany({
			where: {
				noteId: {
					in: noteIds,
				},
			},
			select: {
				path: true,
			},
		}),
		db.note.findMany({
			where: {
				id: {
					in: noteIds,
				},
			},
			select: {
				coverImageMeta: true,
			},
		}),
	]);

	const uniquePaths = new Set<string>();

	for (const file of files) {
		const path = file.path.trim();
		if (path.length > 0) {
			uniquePaths.add(path);
		}
	}

	for (const note of notes) {
		const coverMeta = parseNoteCoverMeta(note.coverImageMeta);
		if (coverMeta?.source === "upload" && coverMeta.filePath.trim().length > 0) {
			uniquePaths.add(coverMeta.filePath);
		}
	}

	return Array.from(uniquePaths);
}

export async function deleteStoredObjects(paths: string[]) {
	if (paths.length === 0) {
		return 0;
	}

	const supabase = createAdminClient();
	let deletedCount = 0;

	for (const batch of chunk(paths, STORAGE_DELETE_BATCH_SIZE)) {
		const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(batch);
		if (error) {
			throw new Error(`Failed to delete stored files: ${error.message}`);
		}

		deletedCount += batch.length;
	}

	return deletedCount;
}
