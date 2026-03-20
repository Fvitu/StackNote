import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeBlockNoteContent } from "@/lib/blocknote-normalize";
import { ensureDbReady } from "@/lib/dbInit";
import { updateNoteSearchVector } from "@/lib/note-server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	await ensureDbReady(prisma);

	const { id } = await params;

	const note = await prisma.note.findUnique({
		where: { id },
		include: { workspace: { select: { userId: true, name: true } }, folder: { select: { name: true } } },
	});

	if (!note) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	if (note.workspace.userId !== session.user.id) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	return NextResponse.json(note);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	await ensureDbReady(prisma);

	const { id } = await params;
	const body = await req.json();
	const { title, folderId, emoji } = body;
	const content = body.content !== undefined ? normalizeBlockNoteContent(body.content) : undefined;

	const note = await prisma.note.findUnique({
		where: { id },
		include: { workspace: { select: { userId: true } } },
	});

	if (!note) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	if (note.workspace.userId !== session.user.id) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const data: Record<string, unknown> = {};
	if (title !== undefined) data.title = title;
	if (content !== undefined) data.content = content;
	if (folderId !== undefined) data.folderId = folderId;
	if (emoji !== undefined) data.emoji = emoji;

	await ensureDbReady(prisma);

	const updated = await prisma.$transaction(async (tx) => {
		const updatedNote = await tx.note.update({
			where: { id },
			data,
		});

		if (title !== undefined || content !== undefined) {
			await updateNoteSearchVector(tx, id);
		}

		return updatedNote;
	});

	return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	await ensureDbReady(prisma);

	const { id } = await params;

	const note = await prisma.note.findUnique({
		where: { id },
		include: { workspace: { select: { userId: true } } },
	});

	if (!note) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	if (note.workspace.userId !== session.user.id) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	// Delete associated files from storage then remove DB records and archive note in a single DB transaction
	await ensureDbReady(prisma);
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

	return NextResponse.json({ success: true });
}
