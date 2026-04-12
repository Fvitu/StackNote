import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { groq } from "@/lib/groq";
import { prisma } from "@/lib/prisma";
import { checkQuotaLimit, recordQuotaUsage } from "@/lib/rate-limit";
import { AI_LIMITS } from "@/lib/ai-limits";
import { resolveTextModel } from "@/lib/groq-models";
import { buildSystemPrompt } from "@/lib/ai/generate-notes";
import { buildChatSessionTitle, normalizeContextNoteIds } from "@/lib/ai-chat-sessions";
import { parseAssistantResponseContent } from "@/lib/ai-response";
import { noteContentToText, truncateToTokenLimit } from "@/lib/ai/note-content";
import { parseFlashcardDeckMessage } from "@/lib/flashcard-chat-message";
import { parseQuizHistoryMessage } from "@/lib/quiz-chat-message";

export const maxDuration = 60;

interface StatelessChatMessage {
	role: "user" | "assistant";
	content: string;
}

interface ChatRequest {
	message?: string;
	messages?: StatelessChatMessage[];
	sessionId?: string;
	noteId?: string;
	noteContent?: unknown;
	noteTitle?: string;
	contextNoteIds?: string[];
	model?: string;
	source?: "chat" | "ai-block" | "home";
	contextMode?: "workspace" | "general";
}

interface ContextNote {
	id: string;
	title: string;
	content: unknown;
}

function buildContextLabel(contextNotes: ContextNote[]) {
	if (contextNotes.length === 0) {
		return undefined;
	}

	if (contextNotes.length === 1) {
		return `a note titled "${contextNotes[0]?.title || "Untitled"}"`;
	}

	const previewTitles = contextNotes
		.slice(0, 3)
		.map((note) => `"${note.title || "Untitled"}"`)
		.join(", ");

	return `${contextNotes.length} selected notes (${previewTitles}${contextNotes.length > 3 ? ", ..." : ""})`;
}

function buildContextText(contextNotes: ContextNote[]) {
	const sections = contextNotes
		.map((note) => {
			const plainText = noteContentToText(note.content);
			if (!plainText.trim()) {
				return "";
			}

			return `# ${note.title || "Untitled"}\n${plainText}`;
		})
		.filter(Boolean)
		.join("\n\n---\n\n");

	return sections ? truncateToTokenLimit(sections, AI_LIMITS.MAX_CONTEXT_TOKENS) : undefined;
}

function isGeneratedQuizCommand(content: string) {
	return /^Generate a\s+\d+\s*-?question\s+quiz\b/i.test(content.trim());
}

function sanitizeHistoryMessage(role: "user" | "assistant", content: string) {
	if (role !== "assistant") {
		return { content, isQuizHistory: false };
	}

	const flashcardDeck = parseFlashcardDeckMessage(content);
	if (flashcardDeck) {
		return {
			content: `Generated ${flashcardDeck.count} flashcards for "${flashcardDeck.title}".`,
			isQuizHistory: false,
		};
	}

	const quizHistory = parseQuizHistoryMessage(content);
	if (quizHistory) {
		return {
			content: null,
			isQuizHistory: true,
		};
	}

	const parsed = parseAssistantResponseContent(content);
	return {
		content: parsed.finalContent || content,
		isQuizHistory: false,
	};
}

function normalizeConversationMessages(messages: ChatRequest["messages"]) {
	if (!Array.isArray(messages)) {
		return [];
	}

	const normalized: Array<{ role: "user" | "assistant"; content: string }> = [];

	for (const entry of messages.slice(-20)) {
		if (!entry || typeof entry !== "object") {
			continue;
		}

		const role = entry.role;
		const content = typeof entry.content === "string" ? entry.content.trim() : "";
		if ((role !== "user" && role !== "assistant") || !content) {
			continue;
		}

		const sanitized = sanitizeHistoryMessage(role, content);
		if (!sanitized.content) {
			continue;
		}

		normalized.push({
			role,
			content: sanitized.content,
		});
	}

	return normalized;
}

export async function POST(req: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const userId = session.user.id;

	let body: ChatRequest;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
	}

	const { message, sessionId, noteId, noteContent, noteTitle, contextNoteIds, model, source, contextMode } = body;
	const normalizedConversation = normalizeConversationMessages(body.messages);
	const trimmedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
	const isStatelessRequest = !trimmedSessionId && normalizedConversation.length > 0;

	let latestUserMessage = typeof message === "string" ? message.trim() : "";
	if (isStatelessRequest) {
		const lastMessage = normalizedConversation[normalizedConversation.length - 1];
		if (!lastMessage || lastMessage.role !== "user") {
			return NextResponse.json({ error: "The last message must be from the user" }, { status: 400 });
		}

		latestUserMessage = lastMessage.content.trim();
	}

	if (!latestUserMessage) {
		return NextResponse.json({ error: "Message is required" }, { status: 400 });
	}

	if (!isStatelessRequest && !trimmedSessionId) {
		return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
	}

	const activeSession = isStatelessRequest
		? null
		: await prisma.aIChatSession.findFirst({
				where: {
					id: trimmedSessionId,
					userId,
				},
				select: {
					id: true,
					title: true,
					noteId: true,
					workspaceId: true,
					contextNoteIds: true,
				},
			});

	if (!isStatelessRequest && !activeSession) {
		return NextResponse.json({ error: "Chat session not found" }, { status: 404 });
	}

	const settings = await prisma.userSettings.findUnique({
		where: { userId },
	});
	const selectedModel = resolveTextModel(model, settings?.preferredTextModel);

	const quotaCheck = await checkQuotaLimit(userId, {
		category: "text",
		model: selectedModel,
		requests: 1,
		tokens: 1,
	});
	if (!quotaCheck.allowed) {
		return NextResponse.json(
			{
				error: quotaCheck.error ?? "Text model limit reached",
				model: selectedModel,
				resetAt: quotaCheck.resetAt,
			},
			{ status: 429 },
		);
	}

	const requestedContextNoteIds = normalizeContextNoteIds(contextNoteIds);
	const effectiveContextNoteIds = activeSession?.contextNoteIds.length ? activeSession.contextNoteIds : requestedContextNoteIds;
	let contextNotes: ContextNote[] = [];
	let noteContextText: string | undefined;
	let contextLabel: string | undefined;
	let ragContext = "";
	let ragNoteCount = 0;
	let persistedNoteId: string | null = null;
	let completionMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

	if (activeSession) {
		if (effectiveContextNoteIds.length > 0) {
			const accessibleWorkspaceIds = (
				await prisma.workspace.findMany({
					where: { userId },
					select: { id: true },
				})
			).map((workspace) => workspace.id);

			const storedNotes = await prisma.note.findMany({
				where: {
					id: { in: effectiveContextNoteIds },
					isArchived: false,
					deletedAt: null,
					workspaceId: { in: accessibleWorkspaceIds },
				},
				select: {
					id: true,
					title: true,
					content: true,
				},
			});

			const storedNoteMap = new Map(storedNotes.map((storedNote) => [storedNote.id, storedNote]));
			const mappedContextNotes: ContextNote[] = [];

			for (const selectedNoteId of effectiveContextNoteIds) {
				if (selectedNoteId === noteId && noteContent) {
					mappedContextNotes.push({
						id: selectedNoteId,
						title: noteTitle?.trim() || storedNoteMap.get(selectedNoteId)?.title || "Untitled",
						content: noteContent,
					});
					continue;
				}

				const storedNote = storedNoteMap.get(selectedNoteId);
				if (!storedNote) {
					continue;
				}

				mappedContextNotes.push({
					id: storedNote.id,
					title: storedNote.title,
					content: storedNote.content,
				});
			}

			contextNotes = mappedContextNotes;
		} else if (noteContent) {
			contextNotes = [
				{
					id: noteId ?? "current-note",
					title: noteTitle?.trim() || "Current note",
					content: noteContent,
				},
			];
		}

		noteContextText = buildContextText(contextNotes);
		contextLabel = buildContextLabel(contextNotes);
		persistedNoteId = noteId && contextNotes.some((contextNote) => contextNote.id === noteId) ? noteId : null;

		const recentMessages = await prisma.aIMessage.findMany({
			where: {
				sessionId: activeSession.id,
				userId,
			},
			orderBy: { createdAt: "desc" },
			take: 12,
			select: {
				role: true,
				content: true,
			},
		});
		const sessionHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
		for (const entry of recentMessages.reverse()) {
			const role = entry.role as "user" | "assistant";
			const sanitized = sanitizeHistoryMessage(role, entry.content);

			if (sanitized.isQuizHistory) {
				const previous = sessionHistory[sessionHistory.length - 1];
				if (previous?.role === "user" && isGeneratedQuizCommand(previous.content)) {
					sessionHistory.pop();
				}
				continue;
			}

			if (!sanitized.content) {
				continue;
			}

			sessionHistory.push({
				role,
				content: sanitized.content,
			});
		}

		const systemPrompt = [
			buildSystemPrompt({
				contextLabel,
				noteContent: noteContextText,
				source,
				hasWorkspaceContext: Boolean(ragContext),
			}),
			ragContext
				? `## Related workspace notes\nThese notes were retrieved automatically from the student's workspace because they appear relevant to the latest question.\n\n${ragContext}`
				: null,
		]
			.filter(Boolean)
			.join("\n\n");

		completionMessages = [
			{ role: "system", content: systemPrompt },
			...sessionHistory,
			{ role: "user", content: latestUserMessage },
		];
	} else {
		const shouldUseWorkspaceContext = contextMode === "workspace";
		if (shouldUseWorkspaceContext) {
			ragContext = "";
			ragNoteCount = 0;
		}

		const systemPrompt = [
			buildSystemPrompt({
				source,
				hasWorkspaceContext: Boolean(ragContext),
			}),
			ragContext
				? `## Related workspace notes\nThese notes were retrieved automatically from the student's workspace because they appear relevant to the latest question.\n\n${ragContext}`
				: null,
		]
			.filter(Boolean)
			.join("\n\n");

		completionMessages = [{ role: "system", content: systemPrompt }, ...normalizedConversation];
	}

	// Create streaming response
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			let fullResponse = "";
			let inputTokens = 0;
			let outputTokens = 0;
			let totalTokens = 0;
			const responseModel = selectedModel;

			try {
				const completion = await groq.chat.completions.create({
					model: selectedModel,
					messages: completionMessages,
					max_tokens: AI_LIMITS.MAX_RESPONSE_TOKENS,
					stream: true,
					temperature: 0.7,
				});

				for await (const chunk of completion) {
					const content = chunk.choices[0]?.delta?.content ?? "";
					if (content) {
						fullResponse += content;
						controller.enqueue(encoder.encode(content));
					}
					const chunkWithUsage = chunk as unknown as {
						usage?: {
							prompt_tokens?: number;
							completion_tokens?: number;
							total_tokens?: number;
							input_tokens?: number;
							output_tokens?: number;
						};
						x_groq?: {
							usage?: {
								prompt_tokens?: number;
								completion_tokens?: number;
								total_tokens?: number;
								input_tokens?: number;
								output_tokens?: number;
							};
						};
					};
					const usage = chunkWithUsage.usage ?? chunkWithUsage.x_groq?.usage;
					if (usage) {
						inputTokens = usage.prompt_tokens ?? usage.input_tokens ?? inputTokens;
						outputTokens = usage.completion_tokens ?? usage.output_tokens ?? outputTokens;
						totalTokens = usage.total_tokens ?? inputTokens + outputTokens;
					}
				}

				if (totalTokens > 0) {
					if (inputTokens === 0 && outputTokens > 0) {
						inputTokens = Math.max(totalTokens - outputTokens, 0);
					}

					if (outputTokens === 0 && inputTokens > 0) {
						outputTokens = Math.max(totalTokens - inputTokens, 0);
					}

					if (inputTokens === 0 && outputTokens === 0) {
						inputTokens = Math.min(totalTokens, Math.ceil(latestUserMessage.length / 4));
						outputTokens = Math.max(totalTokens - inputTokens, 0);
					}
				} else {
					// Estimate tokens if not provided (roughly 4 chars per token)
					inputTokens = Math.ceil(latestUserMessage.length / 4);
					outputTokens = Math.ceil(fullResponse.length / 4);
					totalTokens = inputTokens + outputTokens;
				}

				if (source !== "home") {
					const usageMetadata = {
						inputTokens,
						outputTokens,
						totalTokens,
					};
					const usageSuffix = `\n<!-- stacknote-ai-usage:${JSON.stringify(usageMetadata)} -->`;
					controller.enqueue(encoder.encode(usageSuffix));
					fullResponse += usageSuffix;
				}

				await recordQuotaUsage(userId, {
					category: "text",
					model: selectedModel,
					requests: 1,
					tokens: totalTokens,
				});

				if (activeSession) {
					const existingMessageCount = await prisma.aIMessage.count({
						where: {
							sessionId: activeSession.id,
							userId,
						},
					});

					await prisma.aIMessage.createMany({
						data: [
							{
								userId,
								sessionId: activeSession.id,
								noteId: persistedNoteId,
								role: "user",
								content: latestUserMessage,
								model: responseModel,
								tokensUsed: 0,
							},
							{
								userId,
								sessionId: activeSession.id,
								noteId: persistedNoteId,
								role: "assistant",
								content: fullResponse,
								model: responseModel,
								tokensUsed: totalTokens,
							},
						],
					});

					await prisma.aIChatSession.update({
						where: {
							id: activeSession.id,
						},
						data: {
							lastMessageAt: new Date(),
							...(activeSession.contextNoteIds.length === 0 && effectiveContextNoteIds.length > 0 ? { contextNoteIds: effectiveContextNoteIds } : {}),
							...(existingMessageCount === 0 ? { title: buildChatSessionTitle(latestUserMessage) } : {}),
						},
					});
				}

				controller.close();
			} catch (error) {
				console.error("AI chat error:", error);
				const errorMessage = error instanceof Error ? error.message : "AI service error";
				controller.enqueue(encoder.encode(`\n\n[Error: ${errorMessage}]`));
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
			"x-stacknote-rag-count": String(ragNoteCount),
		},
	});
}
