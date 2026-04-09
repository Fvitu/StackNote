import { prisma } from "@/lib/prisma";
import {
	AI_LIMITS,
	FLASHCARD_MODEL_LIMITS,
	QUIZ_MODEL_LIMITS,
	STT_MODEL_LIMITS,
	TEXT_MODEL_LIMITS,
	formatDurationSeconds,
	getQuotaDefinition,
	type FlashcardQuotaModelId,
	type QuotaCategory,
	type QuizQuotaModelId,
	type SttQuotaModelId,
	type TextQuotaModelId,
} from "@/lib/ai-limits";

type KnownTextModel = keyof typeof TEXT_MODEL_LIMITS;
type KnownFlashcardModel = keyof typeof FLASHCARD_MODEL_LIMITS;
type KnownQuizModel = keyof typeof QUIZ_MODEL_LIMITS;
type KnownVoiceModel = keyof typeof STT_MODEL_LIMITS;
type SharedStudyCategory = "flashcard" | "quiz";

type QuotaModelByCategory = {
	text: KnownTextModel;
	flashcard: KnownFlashcardModel;
	quiz: KnownQuizModel;
	voice: KnownVoiceModel;
};

interface StoredUsageWindow {
	requestCount: number;
	tokenCount: number;
	flashcardCount: number;
	audioSeconds: number;
	windowStartedAt: Date;
	windowEndsAt: Date;
}

const USAGE_STATS_RETRY_DELAY_MS = 2 * 60 * 1000;

const TRANSIENT_DATABASE_ERROR_CODES = new Set(["EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "P1001", "P1002", "P1017"]);

const usageStatsCacheByUser = new Map<string, UsageStats>();
const usageStatsRetryAtByUser = new Map<string, number>();
const usageStatsInFlightByUser = new Map<string, Promise<UsageStats>>();

interface CounterStat {
	used: number;
	limit: number;
	remaining: number;
}

export interface UsageModelStats {
	category: QuotaCategory;
	model: string;
	label: string;
	windowStartedAt: string | null;
	resetAt: string | null;
	requests: CounterStat;
	tokens?: CounterStat;
	flashcards?: CounterStat;
	questions?: CounterStat;
	audioSeconds?: CounterStat;
}

export interface UsageStats {
	textModels: UsageModelStats[];
	flashcardModels: UsageModelStats[];
	quizModels: UsageModelStats[];
	voiceModels: UsageModelStats[];
}

export interface QuotaCheckInput<TCategory extends QuotaCategory = QuotaCategory> {
	category: TCategory;
	model: QuotaModelByCategory[TCategory];
	requests?: number;
	tokens?: number;
	flashcards?: number;
	questions?: number;
	audioSeconds?: number;
}

export interface QuotaCheckResult extends UsageModelStats {
	allowed: boolean;
	error: string | null;
}

interface ActiveUsageCounters {
	requestCount: number;
	tokenCount: number;
	flashcardCount: number;
	audioSeconds: number;
	windowStartedAt: Date | null;
	windowEndsAt: Date | null;
}

function clampCounter(used: number, limit: number): CounterStat {
	return {
		used,
		limit,
		remaining: Math.max(0, limit - used),
	};
}

function getWindowEndDate(now: Date) {
	return new Date(now.getTime() + AI_LIMITS.ROLLING_WINDOW_MS);
}

function formatResetHint(resetAt: string | null) {
	return resetAt ? ` Your 24-hour window resets at ${resetAt}.` : "";
}

function buildQuotaExceededError(
	category: QuotaCategory,
	label: string,
	resetAt: string | null,
	metrics: {
		requests?: CounterStat;
		tokens?: CounterStat;
		flashcards?: CounterStat;
		questions?: CounterStat;
		audioSeconds?: CounterStat;
	},
) {
	if (metrics.tokens && metrics.tokens.used > metrics.tokens.limit) {
		return `You’ve reached the 24-hour token limit for ${label}: ${metrics.tokens.limit.toLocaleString()} tokens.${formatResetHint(resetAt)}`;
	}

	if (metrics.flashcards && metrics.flashcards.used > metrics.flashcards.limit) {
		return `You’ve reached the 24-hour flashcard limit for ${label}: ${metrics.flashcards.limit.toLocaleString()} flashcards.${formatResetHint(resetAt)}`;
	}

	if (metrics.questions && metrics.questions.used > metrics.questions.limit) {
		return `You’ve reached the 24-hour question limit for ${label}: ${metrics.questions.limit.toLocaleString()} questions.${formatResetHint(resetAt)}`;
	}

	if (metrics.audioSeconds && metrics.audioSeconds.used > metrics.audioSeconds.limit) {
		return `You’ve reached the 24-hour audio limit for ${label}: ${formatDurationSeconds(metrics.audioSeconds.limit)}.${formatResetHint(resetAt)}`;
	}

	if (metrics.requests && metrics.requests.used > metrics.requests.limit) {
		const noun = category === "voice" ? "transcription requests" : "requests";
		return `You’ve reached the 24-hour ${noun} limit for ${label}: ${metrics.requests.limit.toLocaleString()} ${noun}.${formatResetHint(resetAt)}`;
	}

	return null;
}

function getActiveCounters(window: StoredUsageWindow | null, now: Date): ActiveUsageCounters {
	if (!window || window.windowEndsAt.getTime() <= now.getTime()) {
		return {
			requestCount: 0,
			tokenCount: 0,
			flashcardCount: 0,
			audioSeconds: 0,
			windowStartedAt: null,
			windowEndsAt: null,
		};
	}

	return {
		requestCount: window.requestCount,
		tokenCount: window.tokenCount,
		flashcardCount: window.flashcardCount,
		audioSeconds: window.audioSeconds,
		windowStartedAt: window.windowStartedAt,
		windowEndsAt: window.windowEndsAt,
	};
}

function isSharedStudyCategory(category: QuotaCategory): category is SharedStudyCategory {
	return category === "flashcard" || category === "quiz";
}

function getCounterpartSharedStudyCategory(category: SharedStudyCategory): SharedStudyCategory {
	return category === "flashcard" ? "quiz" : "flashcard";
}

function getSharedStudyRequestLimit(model: string) {
	const flashcardLimit = FLASHCARD_MODEL_LIMITS[model as KnownFlashcardModel]?.requestsPerWindow ?? 0;
	const quizLimit = QUIZ_MODEL_LIMITS[model as KnownQuizModel]?.requestsPerWindow ?? 0;
	return Math.max(flashcardLimit, quizLimit);
}

function getSharedStudyWindowMetadata(primaryCounters: ActiveUsageCounters, counterpartCounters: ActiveUsageCounters) {
	const startedAtCandidates = [primaryCounters.windowStartedAt, counterpartCounters.windowStartedAt].filter((value): value is Date => value !== null);
	const resetAtCandidates = [primaryCounters.windowEndsAt, counterpartCounters.windowEndsAt].filter((value): value is Date => value !== null);

	const windowStartedAt = startedAtCandidates.length > 0 ? new Date(Math.min(...startedAtCandidates.map((value) => value.getTime()))).toISOString() : null;
	const resetAt = resetAtCandidates.length > 0 ? new Date(Math.min(...resetAtCandidates.map((value) => value.getTime()))).toISOString() : null;

	return { windowStartedAt, resetAt };
}

function applySharedStudyRequestStats(
	stats: UsageModelStats,
	model: string,
	primaryCounters: ActiveUsageCounters,
	counterpartCounters: ActiveUsageCounters,
	requestIncrement: number,
) {
	const requestLimit = getSharedStudyRequestLimit(model);
	const sharedRequestUsed = primaryCounters.requestCount + counterpartCounters.requestCount + requestIncrement;
	const { windowStartedAt, resetAt } = getSharedStudyWindowMetadata(primaryCounters, counterpartCounters);

	return {
		...stats,
		windowStartedAt,
		resetAt,
		requests: clampCounter(sharedRequestUsed, requestLimit),
	};
}

function buildUsageStats<TCategory extends QuotaCategory>(
	category: TCategory,
	model: QuotaModelByCategory[TCategory],
	counters: ActiveUsageCounters,
	increments: Omit<QuotaCheckInput<TCategory>, "category" | "model"> = {},
): UsageModelStats {
	const definition = getQuotaDefinition(category, model);
	if (!definition) {
		throw new Error(`Unsupported quota model: ${model}`);
	}

	const nextRequests = counters.requestCount + (increments.requests ?? 0);
	const resetAt = counters.windowEndsAt?.toISOString() ?? null;
	const base: UsageModelStats = {
		category,
		model,
		label: definition.label,
		windowStartedAt: counters.windowStartedAt?.toISOString() ?? null,
		resetAt,
		requests: clampCounter(nextRequests, definition.requestsPerWindow),
	};

	if ("tokensPerWindow" in definition) {
		base.tokens = clampCounter(counters.tokenCount + (increments.tokens ?? 0), definition.tokensPerWindow);
	}

	if ("questionsPerWindow" in definition) {
		base.questions = clampCounter(counters.tokenCount + (increments.questions ?? 0), definition.questionsPerWindow);
	}

	if ("flashcardsPerWindow" in definition) {
		base.flashcards = clampCounter(counters.flashcardCount + (increments.flashcards ?? 0), definition.flashcardsPerWindow);
	}

	if ("audioSecondsPerWindow" in definition) {
		base.audioSeconds = clampCounter(counters.audioSeconds + (increments.audioSeconds ?? 0), definition.audioSecondsPerWindow);
	}

	return base;
}

export async function checkQuotaLimit<TCategory extends QuotaCategory>(userId: string, input: QuotaCheckInput<TCategory>): Promise<QuotaCheckResult> {
	const now = new Date();
	const existingWindow = await prisma.aIQuotaWindow.findUnique({
		where: {
			userId_category_modelKey: {
				userId,
				category: input.category,
				modelKey: input.model,
			},
		},
		select: {
			requestCount: true,
			tokenCount: true,
			flashcardCount: true,
			audioSeconds: true,
			windowStartedAt: true,
			windowEndsAt: true,
		},
	});

	let counterpartCounters: ActiveUsageCounters | null = null;
	if (isSharedStudyCategory(input.category)) {
		const counterpartWindow = await prisma.aIQuotaWindow.findUnique({
			where: {
				userId_category_modelKey: {
					userId,
					category: getCounterpartSharedStudyCategory(input.category),
					modelKey: input.model,
				},
			},
			select: {
				requestCount: true,
				tokenCount: true,
				flashcardCount: true,
				audioSeconds: true,
				windowStartedAt: true,
				windowEndsAt: true,
			},
		});

		counterpartCounters = getActiveCounters(counterpartWindow, now);
	}

	const activeCounters = getActiveCounters(existingWindow, now);
	const nextStats = buildUsageStats(input.category, input.model, activeCounters, {
		requests: input.requests,
		tokens: input.tokens,
		flashcards: input.flashcards,
		questions: input.questions,
		audioSeconds: input.audioSeconds,
	});
	const stats =
		isSharedStudyCategory(input.category) && counterpartCounters
			? applySharedStudyRequestStats(nextStats, input.model, activeCounters, counterpartCounters, input.requests ?? 0)
			: nextStats;
	const error = buildQuotaExceededError(input.category, stats.label, stats.resetAt, {
		requests: stats.requests,
		tokens: stats.tokens,
		flashcards: stats.flashcards,
		questions: stats.questions,
		audioSeconds: stats.audioSeconds,
	});

	return {
		...stats,
		allowed: error === null,
		error,
	};
}

export async function recordQuotaUsage<TCategory extends QuotaCategory>(userId: string, input: QuotaCheckInput<TCategory>): Promise<QuotaCheckResult> {
	const now = new Date();
	const tokenIncrement = input.category === "quiz" ? (input.questions ?? 0) : (input.tokens ?? 0);

	const window = await prisma.$transaction(async (tx) => {
		const existingWindow = await tx.aIQuotaWindow.findUnique({
			where: {
				userId_category_modelKey: {
					userId,
					category: input.category,
					modelKey: input.model,
				},
			},
		});

		const nextWindowEndsAt = getWindowEndDate(now);

		if (!existingWindow) {
			return tx.aIQuotaWindow.create({
				data: {
					userId,
					category: input.category,
					modelKey: input.model,
					windowStartedAt: now,
					windowEndsAt: nextWindowEndsAt,
					requestCount: input.requests ?? 0,
					tokenCount: tokenIncrement,
					flashcardCount: input.flashcards ?? 0,
					audioSeconds: input.audioSeconds ?? 0,
				},
			});
		}

		if (existingWindow.windowEndsAt.getTime() <= now.getTime()) {
			return tx.aIQuotaWindow.update({
				where: { id: existingWindow.id },
				data: {
					windowStartedAt: now,
					windowEndsAt: nextWindowEndsAt,
					requestCount: input.requests ?? 0,
					tokenCount: tokenIncrement,
					flashcardCount: input.flashcards ?? 0,
					audioSeconds: input.audioSeconds ?? 0,
				},
			});
		}

		return tx.aIQuotaWindow.update({
			where: { id: existingWindow.id },
			data: {
				requestCount: { increment: input.requests ?? 0 },
				tokenCount: { increment: tokenIncrement },
				flashcardCount: { increment: input.flashcards ?? 0 },
				audioSeconds: { increment: input.audioSeconds ?? 0 },
			},
		});
	});

	let counterpartCounters: ActiveUsageCounters | null = null;
	if (isSharedStudyCategory(input.category)) {
		const counterpartWindow = await prisma.aIQuotaWindow.findUnique({
			where: {
				userId_category_modelKey: {
					userId,
					category: getCounterpartSharedStudyCategory(input.category),
					modelKey: input.model,
				},
			},
			select: {
				requestCount: true,
				tokenCount: true,
				flashcardCount: true,
				audioSeconds: true,
				windowStartedAt: true,
				windowEndsAt: true,
			},
		});

		counterpartCounters = getActiveCounters(counterpartWindow, now);
	}

	const counters = getActiveCounters(window, now);
	const rawStats = buildUsageStats(input.category, input.model, counters);
	const stats =
		isSharedStudyCategory(input.category) && counterpartCounters
			? applySharedStudyRequestStats(rawStats, input.model, counters, counterpartCounters, 0)
			: rawStats;
	const error = buildQuotaExceededError(input.category, stats.label, stats.resetAt, {
		requests: stats.requests,
		tokens: stats.tokens,
		flashcards: stats.flashcards,
		questions: stats.questions,
		audioSeconds: stats.audioSeconds,
	});

	return {
		...stats,
		allowed: error === null,
		error,
	};
}

function buildUsageListForCategory<TCategory extends QuotaCategory>(
	category: TCategory,
	definitions: Record<QuotaModelByCategory[TCategory], { label: string }>,
	windowsByModel: Map<string, StoredUsageWindow>,
	now: Date,
) {
	return Object.keys(definitions).map((modelKey) => {
		const model = modelKey as QuotaModelByCategory[TCategory];
		const counters = getActiveCounters(windowsByModel.get(model) ?? null, now);
		return buildUsageStats(category, model, counters);
	});
}

function applySharedStudyRequestUsage(
	stats: UsageStats,
	flashcardWindows: Map<string, StoredUsageWindow>,
	quizWindows: Map<string, StoredUsageWindow>,
	now: Date,
) {
	const sharedModels = new Set<string>([...Object.keys(FLASHCARD_MODEL_LIMITS), ...Object.keys(QUIZ_MODEL_LIMITS)]);

	const sharedByModel = new Map<
		string,
		{
			requests: CounterStat;
			windowStartedAt: string | null;
			resetAt: string | null;
		}
	>();

	for (const model of sharedModels) {
		const flashcardCounters = getActiveCounters(flashcardWindows.get(model) ?? null, now);
		const quizCounters = getActiveCounters(quizWindows.get(model) ?? null, now);
		const requestLimit = getSharedStudyRequestLimit(model);
		const { windowStartedAt, resetAt } = getSharedStudyWindowMetadata(flashcardCounters, quizCounters);

		sharedByModel.set(model, {
			requests: clampCounter(flashcardCounters.requestCount + quizCounters.requestCount, requestLimit),
			windowStartedAt,
			resetAt,
		});
	}

	return {
		...stats,
		flashcardModels: stats.flashcardModels.map((item) => {
			const shared = sharedByModel.get(item.model);
			if (!shared) {
				return item;
			}

			return {
				...item,
				windowStartedAt: shared.windowStartedAt,
				resetAt: shared.resetAt,
				requests: shared.requests,
			};
		}),
		quizModels: stats.quizModels.map((item) => {
			const shared = sharedByModel.get(item.model);
			if (!shared) {
				return item;
			}

			return {
				...item,
				windowStartedAt: shared.windowStartedAt,
				resetAt: shared.resetAt,
				requests: shared.requests,
			};
		}),
	};
}

function buildEmptyUsageStats(now: Date): UsageStats {
	const emptyWindows = new Map<string, StoredUsageWindow>();
	const baseStats = {
		textModels: buildUsageListForCategory("text", TEXT_MODEL_LIMITS, emptyWindows, now),
		flashcardModels: buildUsageListForCategory("flashcard", FLASHCARD_MODEL_LIMITS, emptyWindows, now),
		quizModels: buildUsageListForCategory("quiz", QUIZ_MODEL_LIMITS, emptyWindows, now),
		voiceModels: buildUsageListForCategory("voice", STT_MODEL_LIMITS, emptyWindows, now),
	};

	return applySharedStudyRequestUsage(baseStats, emptyWindows, emptyWindows, now);
}

function isTransientDatabaseError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) {
		return false;
	}

	const candidate = error as {
		code?: unknown;
		message?: unknown;
		cause?: unknown;
	};

	const code = typeof candidate.code === "string" ? candidate.code : null;
	if (code && TRANSIENT_DATABASE_ERROR_CODES.has(code)) {
		return true;
	}

	const message = typeof candidate.message === "string" ? candidate.message : "";
	if (
		message.includes("getaddrinfo EAI_AGAIN") ||
		message.includes("Can't reach database server") ||
		message.includes("Timed out fetching a new connection") ||
		message.includes("Connection terminated unexpectedly")
	) {
		return true;
	}

	return isTransientDatabaseError(candidate.cause);
}

export async function getUsageStats(userId: string): Promise<UsageStats> {
	const now = new Date();
	const retryAt = usageStatsRetryAtByUser.get(userId);
	if (retryAt && retryAt > now.getTime()) {
		return usageStatsCacheByUser.get(userId) ?? buildEmptyUsageStats(now);
	}

	const inFlightRequest = usageStatsInFlightByUser.get(userId);
	if (inFlightRequest) {
		return inFlightRequest;
	}

	const request = (async () => {
		try {
			const windows = await prisma.aIQuotaWindow.findMany({
				where: { userId },
				select: {
					category: true,
					modelKey: true,
					requestCount: true,
					tokenCount: true,
					flashcardCount: true,
					audioSeconds: true,
					windowStartedAt: true,
					windowEndsAt: true,
				},
			});

			const textWindows = new Map(
				windows
					.filter((window): window is typeof window & { modelKey: TextQuotaModelId } => window.category === "text")
					.map((window) => [window.modelKey, window]),
			);
			const flashcardWindows = new Map(
				windows
					.filter((window): window is typeof window & { modelKey: FlashcardQuotaModelId } => window.category === "flashcard")
					.map((window) => [window.modelKey, window]),
			);
			const quizWindows = new Map(
				windows
					.filter((window): window is typeof window & { modelKey: QuizQuotaModelId } => window.category === "quiz")
					.map((window) => [window.modelKey, window]),
			);
			const voiceWindows = new Map(
				windows
					.filter((window): window is typeof window & { modelKey: SttQuotaModelId } => window.category === "voice")
					.map((window) => [window.modelKey, window]),
			);

			const stats = applySharedStudyRequestUsage(
				{
					textModels: buildUsageListForCategory("text", TEXT_MODEL_LIMITS, textWindows, now),
					flashcardModels: buildUsageListForCategory("flashcard", FLASHCARD_MODEL_LIMITS, flashcardWindows, now),
					quizModels: buildUsageListForCategory("quiz", QUIZ_MODEL_LIMITS, quizWindows, now),
					voiceModels: buildUsageListForCategory("voice", STT_MODEL_LIMITS, voiceWindows, now),
				},
				flashcardWindows,
				quizWindows,
				now,
			);

			usageStatsCacheByUser.set(userId, stats);
			usageStatsRetryAtByUser.delete(userId);

			return stats;
		} catch (error) {
			if (isTransientDatabaseError(error)) {
				usageStatsRetryAtByUser.set(userId, now.getTime() + USAGE_STATS_RETRY_DELAY_MS);
				return usageStatsCacheByUser.get(userId) ?? buildEmptyUsageStats(now);
			}

			throw error;
		} finally {
			usageStatsInFlightByUser.delete(userId);
		}
	})();

	usageStatsInFlightByUser.set(userId, request);
	return request;
}
