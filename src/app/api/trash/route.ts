import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildFileAccessUrl } from "@/lib/file-url";
import { prisma } from "@/lib/prisma";
import { getTrashExpiryDate } from "@/lib/trash";
import { parseNoteCoverMeta } from "@/lib/note-cover";
import type { TrashedItem, TrashListResponse } from "@/types/trash";

type TrashNoteRecord = {
	id: string;
	title: string;
	emoji: string | null;
	coverImage: string | null;
	coverImageMeta: unknown;
	deletedAt: Date;
	workspaceId: string;
};

type TrashListEntry =
	| {
			type: "folder";
			record: {
				id: string;
				name: string;
				deletedAt: Date;
				workspaceId: string;
			};
			deletedAt: Date;
	  }
	| {
			type: "note";
			record: TrashNoteRecord;
			deletedAt: Date;
	  };

function parseLimit(rawValue: string | null) {
	const parsed = Number(rawValue ?? "20");
	if (!Number.isFinite(parsed)) {
		return 20;
	}

	return Math.min(50, Math.max(1, Math.trunc(parsed)));
}

function parseCursor(rawValue: string | null) {
	if (!rawValue) {
		return null;
	}

	const parsed = new Date(rawValue);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveTrashCoverImage(note: Pick<TrashNoteRecord, "coverImage" | "coverImageMeta">) {
	const coverMeta = parseNoteCoverMeta(note.coverImageMeta);
	return coverMeta?.source === "upload" ? buildFileAccessUrl(coverMeta.fileId) : note.coverImage;
}

function countFolderDescendants(
	rootFolderId: string,
	childrenByParent: Map<string | null, string[]>,
	noteCountByFolder: Map<string | null, number>,
) {
	let count = noteCountByFolder.get(rootFolderId) ?? 0;
	const queue = [...(childrenByParent.get(rootFolderId) ?? [])];

	while (queue.length > 0) {
		const folderId = queue.shift();
		if (!folderId) {
			continue;
		}

		count += 1;
		count += noteCountByFolder.get(folderId) ?? 0;

		for (const childId of childrenByParent.get(folderId) ?? []) {
			queue.push(childId);
		}
	}

	return count;
}

export async function GET(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
	const cursor = parseCursor(request.nextUrl.searchParams.get("cursor"));
	if (request.nextUrl.searchParams.get("cursor") && !cursor) {
		return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
	}

	const deletedAtFilter = cursor ? { lt: cursor } : undefined;

	const [folderRoots, noteRoots] = await Promise.all([
		prisma.folder.findMany({
			where: {
				deletedAt: deletedAtFilter ? deletedAtFilter : { not: null },
				workspace: {
					userId: session.user.id,
				},
				OR: [
					{ parentId: null },
					{ parent: { is: null } },
					{ parent: { is: { deletedAt: null } } },
				],
			},
			orderBy: [{ deletedAt: "desc" }, { id: "desc" }],
			take: limit + 1,
			select: {
				id: true,
				name: true,
				deletedAt: true,
				workspaceId: true,
			},
		}),
		prisma.note.findMany({
			where: {
				deletedAt: deletedAtFilter ? deletedAtFilter : { not: null },
				workspace: {
					userId: session.user.id,
				},
				OR: [
					{ folderId: null },
					{ folder: { is: null } },
					{ folder: { is: { deletedAt: null } } },
				],
			},
			orderBy: [{ deletedAt: "desc" }, { id: "desc" }],
			take: limit + 1,
			select: {
				id: true,
				title: true,
				emoji: true,
				coverImage: true,
				coverImageMeta: true,
				deletedAt: true,
				workspaceId: true,
			},
		}),
	]);

	const folderEntries: TrashListEntry[] = folderRoots.flatMap((folder) =>
		folder.deletedAt
			? [
					{
						type: "folder" as const,
						record: {
							id: folder.id,
							name: folder.name,
							deletedAt: folder.deletedAt,
							workspaceId: folder.workspaceId,
						},
						deletedAt: folder.deletedAt,
					},
				]
			: [],
	);
	const noteEntries: TrashListEntry[] = noteRoots.flatMap((note) =>
		note.deletedAt
			? [
					{
						type: "note" as const,
						record: {
							id: note.id,
							title: note.title,
							emoji: note.emoji,
							coverImage: note.coverImage,
							coverImageMeta: note.coverImageMeta,
							deletedAt: note.deletedAt,
							workspaceId: note.workspaceId,
						},
						deletedAt: note.deletedAt,
					},
				]
			: [],
	);
	const merged: TrashListEntry[] = [...folderEntries, ...noteEntries]
		.sort((left, right) => right.deletedAt.getTime() - left.deletedAt.getTime())
		.slice(0, limit + 1);

	const pageEntries = merged.slice(0, limit);
	const nextCursor = merged.length > limit ? pageEntries[pageEntries.length - 1]?.deletedAt.toISOString() ?? null : null;

	const folderIds = pageEntries.filter((entry) => entry.type === "folder").map((entry) => entry.record.id);
	const folderWorkspaceIds = Array.from(
		new Set(pageEntries.filter((entry) => entry.type === "folder").map((entry) => entry.record.workspaceId)),
	);

	const childCountByFolderId = new Map<string, number>();

	if (folderIds.length > 0 && folderWorkspaceIds.length > 0) {
		const [deletedFolders, deletedNotes] = await Promise.all([
			prisma.folder.findMany({
				where: {
					workspaceId: {
						in: folderWorkspaceIds,
					},
					deletedAt: {
						not: null,
					},
				},
				select: {
					id: true,
					parentId: true,
					workspaceId: true,
				},
			}),
			prisma.note.findMany({
				where: {
					workspaceId: {
						in: folderWorkspaceIds,
					},
					deletedAt: {
						not: null,
					},
				},
				select: {
					id: true,
					folderId: true,
					workspaceId: true,
				},
			}),
		]);

		const foldersByWorkspace = new Map<string, Array<{ id: string; parentId: string | null }>>();
		const notesByWorkspace = new Map<string, Array<{ folderId: string | null }>>();

		for (const folder of deletedFolders) {
			const current = foldersByWorkspace.get(folder.workspaceId);
			if (current) {
				current.push({ id: folder.id, parentId: folder.parentId });
				continue;
			}

			foldersByWorkspace.set(folder.workspaceId, [{ id: folder.id, parentId: folder.parentId }]);
		}

		for (const note of deletedNotes) {
			const current = notesByWorkspace.get(note.workspaceId);
			if (current) {
				current.push({ folderId: note.folderId });
				continue;
			}

			notesByWorkspace.set(note.workspaceId, [{ folderId: note.folderId }]);
		}

		for (const entry of pageEntries) {
			if (entry.type !== "folder") {
				continue;
			}

			const workspaceFolders = foldersByWorkspace.get(entry.record.workspaceId) ?? [];
			const workspaceNotes = notesByWorkspace.get(entry.record.workspaceId) ?? [];
			const childrenByParent = new Map<string | null, string[]>();
			const noteCountByFolder = new Map<string | null, number>();

			for (const folder of workspaceFolders) {
				const siblings = childrenByParent.get(folder.parentId);
				if (siblings) {
					siblings.push(folder.id);
				} else {
					childrenByParent.set(folder.parentId, [folder.id]);
				}
			}

			for (const note of workspaceNotes) {
				noteCountByFolder.set(note.folderId, (noteCountByFolder.get(note.folderId) ?? 0) + 1);
			}

			childCountByFolderId.set(entry.record.id, countFolderDescendants(entry.record.id, childrenByParent, noteCountByFolder));
		}
	}

	const items: TrashedItem[] = pageEntries.map((entry) => {
		if (entry.type === "folder") {
			return {
				id: entry.record.id,
				type: "folder",
				name: entry.record.name,
				deletedAt: entry.record.deletedAt.toISOString(),
				expiresAt: getTrashExpiryDate(entry.record.deletedAt).toISOString(),
				childCount: childCountByFolderId.get(entry.record.id) ?? 0,
				emoji: null,
				coverImage: null,
			};
		}

		return {
			id: entry.record.id,
			type: "note",
			name: entry.record.title,
			deletedAt: entry.record.deletedAt.toISOString(),
			expiresAt: getTrashExpiryDate(entry.record.deletedAt).toISOString(),
			emoji: entry.record.emoji,
			coverImage: resolveTrashCoverImage(entry.record),
		};
	});

	const response: TrashListResponse = {
		items,
		nextCursor,
	};

	return NextResponse.json(response);
}
