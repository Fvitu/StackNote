import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { collectFolderSubtree, restoreDeletedAncestorChain } from "@/lib/trash";
import { invalidateWorkspaceTree } from "@/lib/server-data";
import type { TrashedItemType } from "@/types/trash";

interface RestoreTrashRequest {
	id?: string;
	type?: TrashedItemType;
}

function isValidType(value: unknown): value is TrashedItemType {
	return value === "note" || value === "folder";
}
export async function POST(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = (await request.json().catch(() => null)) as RestoreTrashRequest | null;
	const id = typeof body?.id === "string" ? body.id : "";
	const type = body?.type;

	if (!id || !isValidType(type)) {
		return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
	}

	try {
		const result = await prisma.$transaction(async (tx) => {
			if (type === "note") {
				const note = await tx.note.findFirst({
					where: {
						id,
						deletedAt: {
							not: null,
						},
						workspace: {
							userId: session.user.id,
						},
					},
					select: {
						id: true,
						workspaceId: true,
						folderId: true,
						originalParentId: true,
					},
				});

				if (!note) {
					throw new Error("NOT_FOUND");
				}

				const ancestorResult = await restoreDeletedAncestorChain(tx, session.user.id, note.originalParentId ?? note.folderId);
				const updated = await tx.note.updateMany({
					where: {
						id: note.id,
						deletedAt: {
							not: null,
						},
					},
					data: {
						folderId: ancestorResult.resolvedParentId,
						deletedAt: null,
						originalParentId: null,
					},
				});

				return {
					workspaceIds: [note.workspaceId],
					restoredCount: ancestorResult.restoredCount + updated.count,
				};
			}

			const folder = await tx.folder.findFirst({
				where: {
					id,
					deletedAt: {
						not: null,
					},
					workspace: {
						userId: session.user.id,
					},
				},
				select: {
					id: true,
					workspaceId: true,
					parentId: true,
					originalParentId: true,
				},
			});

			if (!folder) {
				throw new Error("NOT_FOUND");
			}

			const ancestorResult = await restoreDeletedAncestorChain(tx, session.user.id, folder.originalParentId ?? folder.parentId);
			const subtree = await collectFolderSubtree(tx, folder.workspaceId, folder.id);
			const descendantFolderIds = subtree.folderIds.filter((folderId) => folderId !== folder.id);

			const [rootFolder, descendants, notes] = await Promise.all([
				tx.folder.updateMany({
					where: {
						id: folder.id,
						deletedAt: {
							not: null,
						},
					},
					data: {
						parentId: ancestorResult.resolvedParentId,
						deletedAt: null,
						originalParentId: null,
					},
				}),
				descendantFolderIds.length > 0
					? tx.folder.updateMany({
							where: {
								id: {
									in: descendantFolderIds,
								},
								deletedAt: {
									not: null,
								},
							},
							data: {
								deletedAt: null,
								originalParentId: null,
							},
						})
					: Promise.resolve({ count: 0 }),
				subtree.noteIds.length > 0
					? tx.note.updateMany({
							where: {
								id: {
									in: subtree.noteIds,
								},
								deletedAt: {
									not: null,
								},
							},
							data: {
								deletedAt: null,
								originalParentId: null,
							},
						})
					: Promise.resolve({ count: 0 }),
			]);

			return {
				workspaceIds: [folder.workspaceId],
				restoredCount: ancestorResult.restoredCount + rootFolder.count + descendants.count + notes.count,
			};
		});

		await Promise.all(result.workspaceIds.map((workspaceId) => invalidateWorkspaceTree(session.user.id, workspaceId)));

		return NextResponse.json({ restoredCount: result.restoredCount });
	} catch (error) {
		if (error instanceof Error && error.message === "NOT_FOUND") {
			return NextResponse.json({ error: "Item not found" }, { status: 404 });
		}

		console.error("Failed to restore trash item:", error);
		return NextResponse.json({ error: "Failed to restore item" }, { status: 500 });
	}
}
