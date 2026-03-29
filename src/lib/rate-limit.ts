import { prisma } from "@/lib/prisma"
import {
  AI_LIMITS,
  FLASHCARD_MODEL_LIMITS,
  STT_MODEL_LIMITS,
  TEXT_MODEL_LIMITS,
  formatDurationSeconds,
  getQuotaDefinition,
  type FlashcardQuotaModelId,
  type QuotaCategory,
  type SttQuotaModelId,
  type TextQuotaModelId,
} from "@/lib/ai-limits"

type KnownTextModel = keyof typeof TEXT_MODEL_LIMITS
type KnownFlashcardModel = keyof typeof FLASHCARD_MODEL_LIMITS
type KnownVoiceModel = keyof typeof STT_MODEL_LIMITS

type QuotaModelByCategory = {
  text: KnownTextModel
  flashcard: KnownFlashcardModel
  voice: KnownVoiceModel
}

interface CounterStat {
  used: number
  limit: number
  remaining: number
}

export interface UsageModelStats {
  category: QuotaCategory
  model: string
  label: string
  windowStartedAt: string | null
  resetAt: string | null
  requests: CounterStat
  tokens?: CounterStat
  flashcards?: CounterStat
  audioSeconds?: CounterStat
}

export interface UsageStats {
  textModels: UsageModelStats[]
  flashcardModels: UsageModelStats[]
  voiceModels: UsageModelStats[]
}

export interface QuotaCheckInput<TCategory extends QuotaCategory = QuotaCategory> {
  category: TCategory
  model: QuotaModelByCategory[TCategory]
  requests?: number
  tokens?: number
  flashcards?: number
  audioSeconds?: number
}

export interface QuotaCheckResult extends UsageModelStats {
  allowed: boolean
  error: string | null
}

interface ActiveUsageCounters {
  requestCount: number
  tokenCount: number
  flashcardCount: number
  audioSeconds: number
  windowStartedAt: Date | null
  windowEndsAt: Date | null
}

function clampCounter(used: number, limit: number): CounterStat {
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
  }
}

function getWindowEndDate(now: Date) {
  return new Date(now.getTime() + AI_LIMITS.ROLLING_WINDOW_MS)
}

function formatResetHint(resetAt: string | null) {
  return resetAt ? ` Your 24-hour window resets at ${resetAt}.` : ""
}

function buildQuotaExceededError(
  category: QuotaCategory,
  label: string,
  resetAt: string | null,
  metrics: {
    requests?: CounterStat
    tokens?: CounterStat
    flashcards?: CounterStat
    audioSeconds?: CounterStat
  },
) {
  if (metrics.tokens && metrics.tokens.used > metrics.tokens.limit) {
    return `You’ve reached the 24-hour token limit for ${label}: ${metrics.tokens.limit.toLocaleString()} tokens.${formatResetHint(resetAt)}`
  }

  if (metrics.flashcards && metrics.flashcards.used > metrics.flashcards.limit) {
    return `You’ve reached the 24-hour flashcard limit for ${label}: ${metrics.flashcards.limit.toLocaleString()} flashcards.${formatResetHint(resetAt)}`
  }

  if (metrics.audioSeconds && metrics.audioSeconds.used > metrics.audioSeconds.limit) {
    return `You’ve reached the 24-hour audio limit for ${label}: ${formatDurationSeconds(metrics.audioSeconds.limit)}.${formatResetHint(resetAt)}`
  }

  if (metrics.requests && metrics.requests.used > metrics.requests.limit) {
    const noun = category === "voice" ? "transcription requests" : "requests"
    return `You’ve reached the 24-hour ${noun} limit for ${label}: ${metrics.requests.limit.toLocaleString()} ${noun}.${formatResetHint(resetAt)}`
  }

  return null
}

function getActiveCounters(window: {
  requestCount: number
  tokenCount: number
  flashcardCount: number
  audioSeconds: number
  windowStartedAt: Date
  windowEndsAt: Date
} | null, now: Date): ActiveUsageCounters {
  if (!window || window.windowEndsAt.getTime() <= now.getTime()) {
    return {
      requestCount: 0,
      tokenCount: 0,
      flashcardCount: 0,
      audioSeconds: 0,
      windowStartedAt: null,
      windowEndsAt: null,
    }
  }

  return {
    requestCount: window.requestCount,
    tokenCount: window.tokenCount,
    flashcardCount: window.flashcardCount,
    audioSeconds: window.audioSeconds,
    windowStartedAt: window.windowStartedAt,
    windowEndsAt: window.windowEndsAt,
  }
}

function buildUsageStats<TCategory extends QuotaCategory>(
  category: TCategory,
  model: QuotaModelByCategory[TCategory],
  counters: ActiveUsageCounters,
  increments: Omit<QuotaCheckInput<TCategory>, "category" | "model"> = {},
): UsageModelStats {
  const definition = getQuotaDefinition(category, model)
  if (!definition) {
    throw new Error(`Unsupported quota model: ${model}`)
  }

  const nextRequests = counters.requestCount + (increments.requests ?? 0)
  const resetAt = counters.windowEndsAt?.toISOString() ?? null
  const base: UsageModelStats = {
    category,
    model,
    label: definition.label,
    windowStartedAt: counters.windowStartedAt?.toISOString() ?? null,
    resetAt,
    requests: clampCounter(nextRequests, definition.requestsPerWindow),
  }

  if ("tokensPerWindow" in definition) {
    base.tokens = clampCounter(
      counters.tokenCount + (increments.tokens ?? 0),
      definition.tokensPerWindow,
    )
  }

  if ("flashcardsPerWindow" in definition) {
    base.flashcards = clampCounter(
      counters.flashcardCount + (increments.flashcards ?? 0),
      definition.flashcardsPerWindow,
    )
  }

  if ("audioSecondsPerWindow" in definition) {
    base.audioSeconds = clampCounter(
      counters.audioSeconds + (increments.audioSeconds ?? 0),
      definition.audioSecondsPerWindow,
    )
  }

  return base
}

export async function checkQuotaLimit<TCategory extends QuotaCategory>(
  userId: string,
  input: QuotaCheckInput<TCategory>,
): Promise<QuotaCheckResult> {
  const now = new Date()
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
  })

  const activeCounters = getActiveCounters(existingWindow, now)
  const stats = buildUsageStats(input.category, input.model, activeCounters, {
    requests: input.requests,
    tokens: input.tokens,
    flashcards: input.flashcards,
    audioSeconds: input.audioSeconds,
  })
  const error = buildQuotaExceededError(input.category, stats.label, stats.resetAt, {
    requests: stats.requests,
    tokens: stats.tokens,
    flashcards: stats.flashcards,
    audioSeconds: stats.audioSeconds,
  })

  return {
    ...stats,
    allowed: error === null,
    error,
  }
}

export async function recordQuotaUsage<TCategory extends QuotaCategory>(
  userId: string,
  input: QuotaCheckInput<TCategory>,
): Promise<QuotaCheckResult> {
  const now = new Date()

  const window = await prisma.$transaction(async (tx) => {
    const existingWindow = await tx.aIQuotaWindow.findUnique({
      where: {
        userId_category_modelKey: {
          userId,
          category: input.category,
          modelKey: input.model,
        },
      },
    })

    const nextWindowEndsAt = getWindowEndDate(now)

    if (!existingWindow) {
      return tx.aIQuotaWindow.create({
        data: {
          userId,
          category: input.category,
          modelKey: input.model,
          windowStartedAt: now,
          windowEndsAt: nextWindowEndsAt,
          requestCount: input.requests ?? 0,
          tokenCount: input.tokens ?? 0,
          flashcardCount: input.flashcards ?? 0,
          audioSeconds: input.audioSeconds ?? 0,
        },
      })
    }

    if (existingWindow.windowEndsAt.getTime() <= now.getTime()) {
      return tx.aIQuotaWindow.update({
        where: { id: existingWindow.id },
        data: {
          windowStartedAt: now,
          windowEndsAt: nextWindowEndsAt,
          requestCount: input.requests ?? 0,
          tokenCount: input.tokens ?? 0,
          flashcardCount: input.flashcards ?? 0,
          audioSeconds: input.audioSeconds ?? 0,
        },
      })
    }

    return tx.aIQuotaWindow.update({
      where: { id: existingWindow.id },
      data: {
        requestCount: { increment: input.requests ?? 0 },
        tokenCount: { increment: input.tokens ?? 0 },
        flashcardCount: { increment: input.flashcards ?? 0 },
        audioSeconds: { increment: input.audioSeconds ?? 0 },
      },
    })
  })

  const counters = getActiveCounters(window, now)
  const stats = buildUsageStats(input.category, input.model, counters)
  const error = buildQuotaExceededError(input.category, stats.label, stats.resetAt, {
    requests: stats.requests,
    tokens: stats.tokens,
    flashcards: stats.flashcards,
    audioSeconds: stats.audioSeconds,
  })

  return {
    ...stats,
    allowed: error === null,
    error,
  }
}

function buildUsageListForCategory<TCategory extends QuotaCategory>(
  category: TCategory,
  definitions: Record<QuotaModelByCategory[TCategory], { label: string }>,
  windowsByModel: Map<string, {
    requestCount: number
    tokenCount: number
    flashcardCount: number
    audioSeconds: number
    windowStartedAt: Date
    windowEndsAt: Date
  }>,
  now: Date,
) {
  return Object.keys(definitions).map((modelKey) => {
    const model = modelKey as QuotaModelByCategory[TCategory]
    const counters = getActiveCounters(windowsByModel.get(model) ?? null, now)
    return buildUsageStats(category, model, counters)
  })
}

export async function getUsageStats(userId: string): Promise<UsageStats> {
  const now = new Date()
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
  })

  const textWindows = new Map(
    windows
      .filter((window): window is typeof window & { modelKey: TextQuotaModelId } => window.category === "text")
      .map((window) => [window.modelKey, window]),
  )
  const flashcardWindows = new Map(
    windows
      .filter((window): window is typeof window & { modelKey: FlashcardQuotaModelId } => window.category === "flashcard")
      .map((window) => [window.modelKey, window]),
  )
  const voiceWindows = new Map(
    windows
      .filter((window): window is typeof window & { modelKey: SttQuotaModelId } => window.category === "voice")
      .map((window) => [window.modelKey, window]),
  )

  return {
    textModels: buildUsageListForCategory("text", TEXT_MODEL_LIMITS, textWindows, now),
    flashcardModels: buildUsageListForCategory("flashcard", FLASHCARD_MODEL_LIMITS, flashcardWindows, now),
    voiceModels: buildUsageListForCategory("voice", STT_MODEL_LIMITS, voiceWindows, now),
  }
}
