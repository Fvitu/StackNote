import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateWorkspaceTree } from "@/lib/server-data";
import { validateFolderName } from "@/lib/item-name-validation";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;
	const body = await req.json();
	const { name } = body;

	if (name === undefined) {
		return NextResponse.json({ error: "name is required" }, { status: 400 });
	}

	const validatedName = validateFolderName(name);
	if (!validatedName.ok) {
		return NextResponse.json({ error: validatedName.error }, { status: 400 });
	}

	const folder = await prisma.folder.findUnique({
		where: { id },
		include: { workspace: { select: { userId: true } } },
	});

	if (!folder || folder.deletedAt) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	if (folder.workspace.userId !== session.user.id) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const updated = await prisma.folder.update({
		where: { id },
		data: { name: validatedName.value },
	});

	await invalidateWorkspaceTree(session.user.id, folder.workspaceId);

	return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;

	const folder = await prisma.folder.findUnique({
		where: { id },
		include: { workspace: { select: { userId: true } } },
	});

	if (!folder || folder.deletedAt) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	if (folder.workspace.userId !== session.user.id) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const workspaceFolders = await prisma.folder.findMany({
		where: { workspaceId: folder.workspaceId, deletedAt: null },
		select: { id: true, parentId: true },
	});

	const childrenByParent = new Map<string | null, string[]>();
	for (const candidate of workspaceFolders) {
		const parentKey = candidate.parentId ?? null;
		const siblings = childrenByParent.get(parentKey);
		if (siblings) {
			siblings.push(candidate.id);
		} else {
			childrenByParent.set(parentKey, [candidate.id]);
		}
	}

	const descendantFolderIds = new Set<string>();
	const queue: string[] = [id];
	while (queue.length > 0) {
		const currentFolderId = queue.shift();
		if (!currentFolderId || descendantFolderIds.has(currentFolderId)) {
			continue;
		}

		descendantFolderIds.add(currentFolderId);
		const children = childrenByParent.get(currentFolderId) ?? [];
		for (const childId of children) {
			if (!descendantFolderIds.has(childId)) {
				queue.push(childId);
			}
		}
	}

	const foldersToDelete = Array.from(descendantFolderIds);

	const notesToDelete = await prisma.note.findMany({
		where: {
			workspaceId: folder.workspaceId,
			folderId: { in: foldersToDelete },
			deletedAt: null,
		},
		select: { id: true, folderId: true },
	});

	await prisma.$transaction(async (tx) => {
		const deletedAt = new Date();

		for (const folderId of foldersToDelete) {
			const workspaceFolder = workspaceFolders.find((candidate) => candidate.id === folderId);
			await tx.folder.update({
				where: { id: folderId },
				data: {
					deletedAt,
					originalParentId: workspaceFolder?.parentId ?? null,
				},
			});
		}

		for (const note of notesToDelete) {
			await tx.note.update({
				where: { id: note.id },
				data: {
					deletedAt,
					originalParentId: note.folderId,
				},
			});
		}
	});
	await invalidateWorkspaceTree(session.user.id, folder.workspaceId);

	return NextResponse.json({ success: true, deleted: { folders: foldersToDelete.length, notes: notesToDelete.length } });
}
