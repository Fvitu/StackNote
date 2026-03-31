import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeBlockNoteContent } from "@/lib/blocknote-normalize";
import { invalidateWorkspaceTree } from "@/lib/server-data";

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

	return NextResponse.json(note);
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

	const data: Record<string, unknown> = {};
	if (title !== undefined) data.title = title;
	if (content !== undefined) data.content = content;
	if (folderId !== undefined) data.folderId = folderId;
	if (emoji !== undefined) data.emoji = emoji;

	const updated = await prisma.$transaction(async (tx) => {
		return tx.note.update({
			where: { id },
			data,
		});
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
		await prisma.$transaction([prisma.file.deleteMany({ where: { noteId: id } }), prisma.note.update({ where: { id }, data: { isArchived: true } })]);
	} catch (err) {
		console.error("DB cleanup/archival failed:", err);
		return NextResponse.json({ error: "Failed to delete associated files" }, { status: 500 });
	}

	await invalidateWorkspaceTree(session.user.id, note.workspaceId);

	return NextResponse.json({ success: true });
}
