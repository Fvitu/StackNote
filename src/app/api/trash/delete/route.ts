import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { collectFolderSubtree, collectStoredFilePathsForNotes, deleteStoredObjects } from "@/lib/trash";
import { invalidateWorkspaceTree } from "@/lib/server-data";
import type { TrashedItemType } from "@/types/trash";

interface DeleteTrashRequest {
	id?: string;
	type?: TrashedItemType;
}

function isValidType(value: unknown): value is TrashedItemType {
	return value === "note" || value === "folder";
}

export async function DELETE(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = (await request.json().catch(() => null)) as DeleteTrashRequest | null;
	const id = typeof body?.id === "string" ? body.id : "";
	const type = body?.type;

	if (!id || !isValidType(type)) {
		return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
	}

	try {
		let noteIds: string[] = [];
		let folderIds: string[] = [];
		let workspaceIds: string[] = [];

		if (type === "note") {
			const note = await prisma.note.findFirst({
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
				},
			});

			if (!note) {
				return NextResponse.json({ error: "Item not found" }, { status: 404 });
			}

			noteIds = [note.id];
			workspaceIds = [note.workspaceId];
		} else {
			const folder = await prisma.folder.findFirst({
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
				},
			});

			if (!folder) {
				return NextResponse.json({ error: "Item not found" }, { status: 404 });
			}

			const subtree = await collectFolderSubtree(prisma, folder.workspaceId, folder.id);
			noteIds = subtree.noteIds;
			folderIds = subtree.folderIds;
			workspaceIds = [folder.workspaceId];
		}

		const paths = await collectStoredFilePathsForNotes(prisma, noteIds);
		await deleteStoredObjects(paths);

		const deleted = await prisma.$transaction(async (tx) => {
			if (noteIds.length > 0) {
				await tx.file.deleteMany({
					where: {
						noteId: {
							in: noteIds,
						},
					},
				});
			}

			const [notes, folders] = await Promise.all([
				noteIds.length > 0
					? tx.note.deleteMany({
							where: {
								id: {
									in: noteIds,
								},
							},
						})
					: Promise.resolve({ count: 0 }),
				folderIds.length > 0
					? tx.folder.deleteMany({
							where: {
								id: {
									in: folderIds,
								},
							},
						})
					: Promise.resolve({ count: 0 }),
			]);

			return notes.count + folders.count;
		});

		await Promise.all(workspaceIds.map((workspaceId) => invalidateWorkspaceTree(session.user.id, workspaceId)));

		return NextResponse.json({ deletedCount: deleted });
	} catch (error) {
		console.error("Failed to permanently delete trash item:", error);
		return NextResponse.json({ error: "Failed to permanently delete item" }, { status: 500 });
	}
}
