import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeContextNoteIds } from "@/lib/ai-chat-sessions";

interface UpdateSessionBody {
	title?: string;
	noteId?: string;
	contextNoteIds?: unknown;
}

function jsonError(message: string, status: number) {
	return NextResponse.json({ error: message }, { status });
}

function mapSession(session: {
	id: string;
	title: string;
	workspaceId: string;
	noteId: string | null;
	contextNoteIds: string[];
	lastMessageAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
	_count: { messages: number };
}) {
	return {
		id: session.id,
		title: session.title,
		workspaceId: session.workspaceId,
		noteId: session.noteId,
		contextNoteIds: session.contextNoteIds,
		lastMessageAt: session.lastMessageAt,
		createdAt: session.createdAt,
		updatedAt: session.updatedAt,
		messageCount: session._count.messages,
	};
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user?.id) {
		return jsonError("Unauthorized", 401);
	}

	const { id } = await params;
	if (!id) {
		return jsonError("Session id is required", 400);
	}

	const aiSession = await prisma.aIChatSession.findFirst({
		where: {
			id,
			userId: session.user.id,
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

	if (!aiSession) {
		return jsonError("Chat session not found", 404);
	}

	const messages = await prisma.aIMessage.findMany({
		where: {
			sessionId: aiSession.id,
			userId: session.user.id,
		},
		orderBy: { createdAt: "asc" },
		select: {
			id: true,
			role: true,
			content: true,
			model: true,
			createdAt: true,
		},
	});

	return NextResponse.json({
		session: mapSession(aiSession),
		messages: messages.map((message) => ({
			id: message.id,
			role: message.role,
			content: message.content,
			model: message.model,
			timestamp: message.createdAt,
		})),
	});
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user?.id) {
		return jsonError("Unauthorized", 401);
	}

	const { id } = await params;
	if (!id) {
		return jsonError("Session id is required", 400);
	}

	let body: UpdateSessionBody;
	try {
		body = (await req.json()) as UpdateSessionBody;
	} catch {
		return jsonError("Invalid request body", 400);
	}

	const title = body.title?.trim();
	const noteId = body.noteId?.trim();
	const normalizedContextNoteIds = normalizeContextNoteIds(body.contextNoteIds);

	const existingSession = await prisma.aIChatSession.findFirst({
		where: {
			id,
			userId: session.user.id,
		},
		select: {
			id: true,
		},
	});

	if (!existingSession) {
		return jsonError("Chat session not found", 404);
	}

	const updatedSession = await prisma.aIChatSession.update({
		where: { id },
		data: {
			...(title ? { title } : {}),
			...(noteId ? { noteId } : {}),
			...(Array.isArray(body.contextNoteIds) ? { contextNoteIds: normalizedContextNoteIds } : {}),
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

	return NextResponse.json({ session: mapSession(updatedSession) });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user?.id) {
		return jsonError("Unauthorized", 401);
	}

	const { id } = await params;
	if (!id) {
		return jsonError("Session id is required", 400);
	}

	const result = await prisma.aIChatSession.deleteMany({
		where: {
			id,
			userId: session.user.id,
		},
	});

	if (result.count === 0) {
		return jsonError("Chat session not found", 404);
	}

	return NextResponse.json({ ok: true });
}
