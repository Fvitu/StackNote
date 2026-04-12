import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { collectStoredFilePathsForNotes, deleteStoredObjects } from "@/lib/trash";
import { invalidateWorkspaceTree } from "@/lib/server-data";

export async function DELETE() {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const [notes, folders] = await Promise.all([
			prisma.note.findMany({
				where: {
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
			}),
			prisma.folder.findMany({
				where: {
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
			}),
		]);

		const noteIds = notes.map((note) => note.id);
		const folderIds = folders.map((folder) => folder.id);
		const workspaceIds = Array.from(new Set([...notes.map((note) => note.workspaceId), ...folders.map((folder) => folder.workspaceId)]));

		const paths = await collectStoredFilePathsForNotes(prisma, noteIds);
		await deleteStoredObjects(paths);

		const deletedCount = await prisma.$transaction(async (tx) => {
			if (noteIds.length > 0) {
				await tx.file.deleteMany({
					where: {
						noteId: {
							in: noteIds,
						},
					},
				});
			}

			const [deletedNotes, deletedFolders] = await Promise.all([
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

			return deletedNotes.count + deletedFolders.count;
		});

		await Promise.all(workspaceIds.map((workspaceId) => invalidateWorkspaceTree(session.user.id, workspaceId)));

		return NextResponse.json({ deletedCount });
	} catch (error) {
		console.error("Failed to empty trash:", error);
		return NextResponse.json({ error: "Failed to empty trash" }, { status: 500 });
	}
}
