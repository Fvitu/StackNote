import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildChatSessionTitle, normalizeContextNoteIds } from "@/lib/ai-chat-sessions";

interface CreateSessionBody {
	workspaceId?: string;
	noteId?: string;
	noteTitle?: string;
	title?: string;
	contextNoteIds?: unknown;
}

function jsonError(message: string, status: number) {
	return NextResponse.json({ error: message }, { status });
}

async function resolveWorkspaceNoteTitle(userId: string, workspaceId: string, noteId: string | undefined) {
	if (!noteId) {
		return null;
	}

	return prisma.note.findFirst({
		where: {
			id: noteId,
			workspaceId,
			isArchived: false,
		},
		select: {
			title: true,
		},
	});
}

async function resolveWorkspaceIdForNote(userId: string, noteId: string | undefined) {
	if (!noteId) {
		return null;
	}

	const note = await prisma.note.findFirst({
		where: {
			id: noteId,
			isArchived: false,
			workspace: { userId },
		},
		select: {
			workspaceId: true,
		},
	});

	return note?.workspaceId ?? null;
}

export async function GET(req: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return jsonError("Unauthorized", 401);
	}

	const workspaceId = req.nextUrl.searchParams.get("workspaceId")?.trim();
	const noteId = req.nextUrl.searchParams.get("noteId")?.trim();

	if (!workspaceId) {
		return jsonError("workspaceId is required", 400);
	}

	const workspace = await prisma.workspace.findFirst({
		where: { id: workspaceId, userId: session.user.id },
		select: { id: true },
	});

	if (!workspace) {
		return jsonError("Workspace not found", 404);
	}

	const sessions = await prisma.aIChatSession.findMany({
		where: {
			userId: session.user.id,
			workspaceId,
			...(noteId ? { noteId } : {}),
		},
		select: {
			id: true,
			title: true,
			workspaceId: true,
			noteId: true,
			contextNoteIds: true,
			lastMessageAt: true,
			createdAt: true,
			updatedAt: true,
			_count: {
				select: {
					messages: true,
				},
			},
		},
		orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
	});

	return NextResponse.json({
		sessions: sessions.map((item) => ({
			id: item.id,
			title: item.title,
			workspaceId: item.workspaceId,
			noteId: item.noteId,
			contextNoteIds: item.contextNoteIds,
			lastMessageAt: item.lastMessageAt,
			createdAt: item.createdAt,
			updatedAt: item.updatedAt,
			messageCount: item._count.messages,
		})),
	});
}

export async function POST(req: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return jsonError("Unauthorized", 401);
	}

	let body: CreateSessionBody;
	try {
		body = (await req.json()) as CreateSessionBody;
	} catch {
		return jsonError("Invalid request body", 400);
	}

	const workspaceId = body.workspaceId?.trim();
	const noteId = body.noteId?.trim();
	const requestedTitle = body.title?.trim();
	const requestedContextNoteIds = normalizeContextNoteIds(body.contextNoteIds);

	let resolvedWorkspaceId = workspaceId;
	if (!resolvedWorkspaceId) {
		resolvedWorkspaceId = (await resolveWorkspaceIdForNote(session.user.id, noteId ?? undefined)) ?? undefined;
	}

	if (!resolvedWorkspaceId) {
		return jsonError("workspaceId is required", 400);
	}

	const workspace = await prisma.workspace.findFirst({
		where: { id: resolvedWorkspaceId, userId: session.user.id },
		select: { id: true },
	});

	if (!workspace) {
		return jsonError("Workspace not found", 404);
	}

	const note = await resolveWorkspaceNoteTitle(session.user.id, resolvedWorkspaceId, noteId);
	const contextNoteIds = requestedContextNoteIds.length > 0 ? requestedContextNoteIds : noteId ? [noteId] : [];
	const title = requestedTitle || note?.title || buildChatSessionTitle(body.noteTitle ?? "New chat");

	const createdSession = await prisma.aIChatSession.create({
		data: {
			userId: session.user.id,
			workspaceId: resolvedWorkspaceId,
			noteId: noteId ?? null,
			title,
			contextNoteIds,
		},
		select: {
			id: true,
			title: true,
			workspaceId: true,
			noteId: true,
			contextNoteIds: true,
			lastMessageAt: true,
			createdAt: true,
			updatedAt: true,
			_count: {
				select: {
					messages: true,
				},
			},
		},
	});

	return NextResponse.json({
		session: {
			id: createdSession.id,
			title: createdSession.title,
			workspaceId: createdSession.workspaceId,
			noteId: createdSession.noteId,
			contextNoteIds: createdSession.contextNoteIds,
			lastMessageAt: createdSession.lastMessageAt,
			createdAt: createdSession.createdAt,
			updatedAt: createdSession.updatedAt,
			messageCount: createdSession._count.messages,
		},
	});
}
