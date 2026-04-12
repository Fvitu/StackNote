import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildFileAccessUrl } from "@/lib/file-url";
import { prisma } from "@/lib/prisma";
import { normalizeBlockNoteContent } from "@/lib/blocknote-normalize";
import { parseNoteCoverMeta } from "@/lib/note-cover";

async function resolveCoverImageUrl(coverImage: string | null | undefined, coverImageMeta: unknown): Promise<string | null | undefined> {
	const parsedMeta = parseNoteCoverMeta(coverImageMeta);
	if (!parsedMeta || parsedMeta.source !== "upload") {
		return coverImage;
	}

	return buildFileAccessUrl(parsedMeta.fileId);
}

async function getAuthorizedNote(noteId: string, userId: string) {
	const note = await prisma.note.findFirst({
		where: {
			id: noteId,
			deletedAt: null,
			workspace: {
				userId,
			},
		},
		select: { id: true },
	});

	if (!note) {
		return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
	}

	return { note };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; versionId: string }> }) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id, versionId } = await params;
	const access = await getAuthorizedNote(id, session.user.id);
	if ("error" in access) {
		return access.error;
	}

	const version = await prisma.noteVersion.findFirst({
		where: {
			id: versionId,
			noteId: id,
		},
		select: {
			id: true,
			createdAt: true,
			manual: true,
			label: true,
			content: true,
		},
	});

	if (!version) {
		return NextResponse.json({ error: "Version not found" }, { status: 404 });
	}

	const rawContent = version.content as unknown;
	let normalizedContent = normalizeBlockNoteContent(rawContent);
	let coverImage: string | null | undefined;
	let coverImageMeta: unknown;
	let title: string | null | undefined;
	let emoji: string | null | undefined;

	if (rawContent && typeof rawContent === "object" && !Array.isArray(rawContent)) {
		const snapshot = rawContent as Record<string, unknown>;
		if ("content" in snapshot) {
			normalizedContent = normalizeBlockNoteContent(snapshot.content);
		}

		if (typeof snapshot.coverImage === "string" || snapshot.coverImage === null) {
			coverImage = snapshot.coverImage as string | null;
		}

		if ("coverImageMeta" in snapshot) {
			coverImageMeta = snapshot.coverImageMeta;
		}

		if (typeof snapshot.title === "string" || snapshot.title === null) {
			title = snapshot.title as string | null;
		}

		if (typeof snapshot.emoji === "string" || snapshot.emoji === null) {
			emoji = snapshot.emoji as string | null;
		}
	}

	const resolvedCoverImage = await resolveCoverImageUrl(coverImage, coverImageMeta);

	return NextResponse.json({
		...version,
		content: normalizedContent,
		title,
		emoji,
		coverImage: resolvedCoverImage,
		coverImageMeta,
	});
}
