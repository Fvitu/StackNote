import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { groq } from "@/lib/groq";
import { prisma } from "@/lib/prisma";
import { AI_LIMITS, FALLBACK_FLASHCARD_MODEL, PRIMARY_FLASHCARD_MODEL, type FlashcardQuotaModelId } from "@/lib/ai-limits";
import { checkQuotaLimit, recordQuotaUsage } from "@/lib/rate-limit";
import { serializeFlashcardDeckMessage } from "@/lib/flashcard-chat-message";

export const maxDuration = 60;

interface FlashcardRequest {
	source: "selection" | "note";
	text: string;
	noteId?: string;
	titleHint?: string;
	sessionId?: string;
	count?: number;
	language?: string;
	instructions?: string;
}

interface GeneratedCard {
	front: string;
	back: string;
}

interface GeneratedDeck {
	title: string;
	cards: GeneratedCard[];
}

const FLASHCARD_SYSTEM_PROMPT = `\
You are a flashcard generation engine integrated into StackNote, a student study workspace.
Your sole task is to analyze study material and produce a set of high-quality flashcards in JSON format.
 
## Output format
Respond ONLY with a valid JSON object. No markdown fences, no explanation, no preamble, no postamble.
If you include anything outside of the JSON object, the system will fail to parse your response.
 
Format:
{
  "title": "Concise deck title",
  "cards": [
    { "front": "question or term", "back": "answer or definition" },
    ...
  ]
}
 
## Card generation rules
- Generate a short, specific title for the deck that matches the study topic.
- The title must be in the same language as the cards.
- The title must never be "Untitled", "Flashcards", or another generic placeholder.
- Generate exactly the number of cards requested by the user instruction.
- Prefer quality over quantity — a smaller set of precise cards beats a large set of vague ones.
- **Definitions:** front = term only, back = concise definition (max 2 sentences).
- **Concepts:** front = a question ("What is...?", "How does...?", "Why does...?", "What is the effect of...?"), back = direct, factual answer.
- **Formulas:** front = "Formula for [concept]?", back = the formula in plain text or LaTeX, plus a one-line explanation.
- **Processes:** front = "What are the steps to...?" or "How do you...?", back = numbered steps (concise).
- Avoid yes/no questions. Cards should require active recall, not recognition.
- Keep all backs under 60 words. Conciseness aids memory.
- Do not create cards for trivial information (e.g. "Who gave this lecture?" or "What year was this?").
- Do not duplicate cards or near-duplicate with synonym fronts.
- Do not invent content not present in the material.
- If the user explicitly requests an output language, generate all cards in that language.
- Otherwise, detect the language of the study material and generate all cards (front and back) in that same language. Do not translate the content.
- If the material mixes languages (e.g. English terms in a Spanish text), preserve that mix naturally — don't force uniformity.`;

const FLASHCARD_USER_PREFIX = `Generate flashcards from the following study material:\n\n`;

class QuotaExceededError extends Error {
	constructor(
		message: string,
		readonly model: string,
		readonly resetAt: string | null,
	) {
		super(message);
		this.name = "QuotaExceededError";
	}
}

function quotaExceededResponse(error: string, model: string, resetAt: string | null) {
	return NextResponse.json(
		{
			error,
			model,
			resetAt,
		},
		{ status: 429 },
	);
}

function sanitizeTitleCandidate(value: string) {
	return value
		.replace(/\s+/g, " ")
		.replace(/^["'`]+|["'`]+$/g, "")
		.trim();
}

function buildFallbackDeckTitle(sourceText: string, titleHint?: string) {
	const normalizedHint = sanitizeTitleCandidate(titleHint ?? "");
	if (normalizedHint && !/^untitled$/i.test(normalizedHint)) {
		return normalizedHint;
	}

	const sourceLines = sourceText
		.split(/\r?\n/)
		.map((line) =>
			sanitizeTitleCandidate(
				line
					.replace(/^#{1,6}\s*/, "")
					.replace(/^[-*]\s*/, "")
					.replace(/^\[[^\]]+\]\s*/, ""),
			),
		)
		.filter((line) => line.length >= 4);

	const candidate = sourceLines.find((line) => !/^embedded\b/i.test(line)) ?? sourceLines[0] ?? "Study Deck";
	return candidate.length > 70 ? `${candidate.slice(0, 67).trimEnd()}...` : candidate;
}

function normalizeGeneratedTitle(title: string | undefined, fallbackTitle: string) {
	const normalizedTitle = sanitizeTitleCandidate(title ?? "");
	if (!normalizedTitle || /^untitled$/i.test(normalizedTitle) || /^flashcards?$/i.test(normalizedTitle)) {
		return fallbackTitle;
	}

	return normalizedTitle;
}

function parseGeneratedCards(rawCards: unknown) {
	if (!Array.isArray(rawCards)) {
		throw new Error("Response cards are not an array");
	}

	const cards = rawCards.filter((card): card is GeneratedCard =>
		Boolean(
			card &&
			typeof card === "object" &&
			typeof (card as GeneratedCard).front === "string" &&
			typeof (card as GeneratedCard).back === "string" &&
			(card as GeneratedCard).front.trim() &&
			(card as GeneratedCard).back.trim(),
		),
	);

	if (cards.length === 0) {
		throw new Error("No valid cards generated");
	}

	return cards;
}

function extractJsonCandidate(responseText: string) {
	const trimmed = responseText.trim();
	const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
	if (fencedMatch?.[1]) {
		return fencedMatch[1].trim();
	}

	const objectMatch = trimmed.match(/\{[\s\S]*\}/);
	const arrayMatch = trimmed.match(/\[[\s\S]*\]/);

	if (objectMatch && (!arrayMatch || objectMatch.index! <= arrayMatch.index!)) {
		return objectMatch[0];
	}

	if (arrayMatch) {
		return arrayMatch[0];
	}

	throw new Error("No JSON payload found in response");
}

function parseGeneratedDeck(responseText: string, fallbackTitle: string): GeneratedDeck {
	const parsed = JSON.parse(extractJsonCandidate(responseText)) as unknown;

	if (Array.isArray(parsed)) {
		return {
			title: fallbackTitle,
			cards: parseGeneratedCards(parsed),
		};
	}

	if (!parsed || typeof parsed !== "object") {
		throw new Error("Response is not a supported JSON payload");
	}

	const payload = parsed as Record<string, unknown>;
	const cardsSource = Array.isArray(payload.cards) ? payload.cards : Array.isArray(payload.flashcards) ? payload.flashcards : null;

	if (!cardsSource) {
		throw new Error("Response does not include flashcards");
	}

	return {
		title: normalizeGeneratedTitle(
			typeof payload.title === "string" ? payload.title : typeof payload.deckTitle === "string" ? payload.deckTitle : undefined,
			fallbackTitle,
		),
		cards: parseGeneratedCards(cardsSource),
	};
}

async function requestFlashcardsFromModel(
	model: FlashcardQuotaModelId,
	sourceText: string,
	targetCount: number,
	options: {
		targetLanguage?: string;
		titleHint?: string;
		customInstructions?: string;
	},
) {
	const targetLanguage = options.targetLanguage?.trim();
	const titleHint = options.titleHint?.trim();
	const customInstructions = options.customInstructions?.trim();
	const fallbackTitle = buildFallbackDeckTitle(sourceText, titleHint);
	const promptSections = [
		`Generate exactly ${targetCount} flashcards. Do not generate more or fewer.`,
		targetLanguage ? `Write every flashcard and the deck title in ${targetLanguage}. Keep formulas, symbols, and technical terms accurate.` : "",
		titleHint ? `Reference title/context: ${titleHint}. Use it only as context, not as a required final title.` : "",
		customInstructions ? `Additional user instructions:\n${customInstructions}` : "",
	].filter(Boolean);

	const completion = await groq.chat.completions.create({
		model,
		messages: [
			{ role: "system", content: FLASHCARD_SYSTEM_PROMPT },
			{
				role: "user",
				content: FLASHCARD_USER_PREFIX + sourceText.slice(0, 8000) + `\n\n${promptSections.join("\n\n")}`,
			},
		],
		max_tokens: 2000,
		temperature: 0.3,
	});

	const responseText = completion.choices[0]?.message?.content ?? "";
	return {
		model,
		tokensUsed: completion.usage?.total_tokens ?? 0,
		...parseGeneratedDeck(responseText, fallbackTitle),
	};
}

export async function POST(req: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: FlashcardRequest;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
	}

	const { source, text, noteId, titleHint, sessionId, count, language, instructions } = body;

	if (!source || !["selection", "note"].includes(source)) {
		return NextResponse.json({ error: "Invalid source type" }, { status: 400 });
	}

	if (!text || typeof text !== "string" || !text.trim()) {
		return NextResponse.json({ error: "Text content is required" }, { status: 400 });
	}

	if (count !== undefined && (!Number.isInteger(count) || Number.isNaN(count))) {
		return NextResponse.json({ error: "Count must be an integer" }, { status: 400 });
	}

	if (language !== undefined && (typeof language !== "string" || !language.trim())) {
		return NextResponse.json({ error: "Language must be a non-empty string" }, { status: 400 });
	}

	if (titleHint !== undefined && typeof titleHint !== "string") {
		return NextResponse.json({ error: "Title hint must be a string" }, { status: 400 });
	}

	if (instructions !== undefined && typeof instructions !== "string") {
		return NextResponse.json({ error: "Instructions must be a string" }, { status: 400 });
	}

	const targetCount = Math.min(Math.max(count ?? 10, 1), AI_LIMITS.FLASHCARD_MAX_PER_REQUEST);
	const targetLanguage = language?.trim() || undefined;
	const sanitizedTitleHint = titleHint?.trim() || undefined;
	const customInstructions = instructions?.trim() || undefined;

	let activeSessionId: string | null = null;
	if (sessionId?.trim()) {
		const activeSession = await prisma.aIChatSession.findFirst({
			where: {
				id: sessionId.trim(),
				userId: session.user.id,
			},
			select: { id: true },
		});

		if (!activeSession) {
			return NextResponse.json({ error: "Chat session not found" }, { status: 404 });
		}

		activeSessionId = activeSession.id;
	}

	const primaryQuota = await checkQuotaLimit(session.user.id, {
		category: "flashcard",
		model: PRIMARY_FLASHCARD_MODEL,
		requests: 1,
		flashcards: targetCount,
	});
	if (!primaryQuota.allowed) {
		return quotaExceededResponse(primaryQuota.error ?? "Flashcard limit reached", PRIMARY_FLASHCARD_MODEL, primaryQuota.resetAt);
	}

	try {
		const generation = await requestFlashcardsFromModel(PRIMARY_FLASHCARD_MODEL, text, targetCount, {
			targetLanguage,
			titleHint: sanitizedTitleHint,
			customInstructions,
		}).catch(async (primaryError) => {
			console.warn("Primary flashcard model failed, falling back to groq/compound-mini:", primaryError);

			const fallbackQuota = await checkQuotaLimit(session.user.id, {
				category: "flashcard",
				model: FALLBACK_FLASHCARD_MODEL,
				requests: 1,
				flashcards: targetCount,
			});
			if (!fallbackQuota.allowed) {
				throw new QuotaExceededError(fallbackQuota.error ?? "Flashcard limit reached", FALLBACK_FLASHCARD_MODEL, fallbackQuota.resetAt);
			}

			return requestFlashcardsFromModel(FALLBACK_FLASHCARD_MODEL, text, targetCount, {
				targetLanguage,
				titleHint: sanitizedTitleHint,
				customInstructions,
			});
		});

		const usageResult = await recordQuotaUsage(session.user.id, {
			category: "flashcard",
			model: generation.model,
			requests: 1,
			flashcards: generation.cards.length,
		});
		if (!usageResult.allowed) {
			return quotaExceededResponse(usageResult.error ?? "Flashcard limit reached", generation.model, usageResult.resetAt);
		}

		const deck = await prisma.flashcardDeck.create({
			data: {
				userId: session.user.id,
				noteId: noteId ?? null,
				title: generation.title,
				description: source === "selection" ? "Generated from selected text" : "Generated from note",
				cardCount: generation.cards.length,
				flashcards: {
					create: generation.cards.map((card) => ({
						front: card.front.trim(),
						back: card.back.trim(),
					})),
				},
			},
			include: {
				flashcards: true,
			},
		});

		const payload = {
			deckId: deck.id,
			title: deck.title,
			cards: deck.flashcards.map((card) => ({
				id: card.id,
				front: card.front,
				back: card.back,
			})),
			count: deck.cardCount,
		};

		if (activeSessionId) {
			await prisma.aIMessage.create({
				data: {
					userId: session.user.id,
					sessionId: activeSessionId,
					noteId: noteId ?? null,
					role: "assistant",
					content: serializeFlashcardDeckMessage(payload),
					model: generation.model,
					tokensUsed: generation.tokensUsed,
				},
			});

			await prisma.aIChatSession.update({
				where: { id: activeSessionId },
				data: {
					lastMessageAt: new Date(),
				},
			});
		}

		return NextResponse.json({
			...payload,
			model: generation.model,
			sessionId: activeSessionId,
		});
	} catch (error) {
		console.error("Flashcard generation error:", error);
		if (error instanceof QuotaExceededError) {
			return quotaExceededResponse(error.message, error.model, error.resetAt);
		}
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Failed to generate flashcards",
			},
			{ status: 500 },
		);
	}
}
