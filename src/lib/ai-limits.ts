export const AI_LIMITS = {
	MAX_CONTEXT_TOKENS: 4_000,
	MAX_RESPONSE_TOKENS: 2_000,
	MAX_AUDIO_FILE_MB: 25,
	FLASHCARD_MAX_PER_REQUEST: 20,
	QUIZ_MAX_PER_REQUEST: 15,
	ROLLING_WINDOW_MS: 24 * 60 * 60 * 1000,
} as const;

export const TEXT_MODEL_LIMITS = {
  "llama-3.3-70b-versatile": {
    label: "LLaMA 3.3 70B",
    requestsPerWindow: 50,
    tokensPerWindow: 5_000,
  },
  "openai/gpt-oss-120b": {
    label: "GPT-OSS 120B",
    requestsPerWindow: 50,
    tokensPerWindow: 10_000,
  },
  "qwen/qwen3-32b": {
    label: "Qwen 3 32B",
    requestsPerWindow: 100,
    tokensPerWindow: 25_000,
  },
  "llama-3.1-8b-instant": {
    label: "LLaMA 3.1 8B Instant",
    requestsPerWindow: 500,
    tokensPerWindow: 25_000,
  },
  "meta-llama/llama-4-scout-17b-16e-instruct": {
    label: "LLaMA 4 Scout 17B",
    requestsPerWindow: 100,
    tokensPerWindow: 25_000,
  },
} as const

export const FLASHCARD_MODEL_LIMITS = {
	"groq/compound": {
		label: "Groq Compound",
		requestsPerWindow: 30,
		flashcardsPerWindow: 50,
	},
	"groq/compound-mini": {
		label: "Groq Compound Mini",
		requestsPerWindow: 30,
		flashcardsPerWindow: 50,
	},
} as const;

export const QUIZ_MODEL_LIMITS = {
	"groq/compound": {
		label: "Groq Compound",
		requestsPerWindow: 30,
		questionsPerWindow: 30,
	},
	"groq/compound-mini": {
		label: "Groq Compound Mini",
		requestsPerWindow: 30,
		questionsPerWindow: 30,
	},
} as const;

export const STT_MODEL_LIMITS = {
  "whisper-large-v3": {
    label: "Whisper Large v3",
    requestsPerWindow: 100,
    audioSecondsPerWindow: 1_800,
  },
  "whisper-large-v3-turbo": {
    label: "Whisper Large v3 Turbo",
    requestsPerWindow: 100,
    audioSecondsPerWindow: 1_800,
  },
} as const

export type QuotaCategory = "text" | "flashcard" | "quiz" | "voice";

export type TextQuotaModelId = keyof typeof TEXT_MODEL_LIMITS
export type FlashcardQuotaModelId = keyof typeof FLASHCARD_MODEL_LIMITS
export type QuizQuotaModelId = keyof typeof QUIZ_MODEL_LIMITS;
export type SttQuotaModelId = keyof typeof STT_MODEL_LIMITS
export type QuotaModelId = TextQuotaModelId | FlashcardQuotaModelId | QuizQuotaModelId | SttQuotaModelId;

export type TextQuotaDefinition = (typeof TEXT_MODEL_LIMITS)[TextQuotaModelId]
export type FlashcardQuotaDefinition = (typeof FLASHCARD_MODEL_LIMITS)[FlashcardQuotaModelId]
export type QuizQuotaDefinition = (typeof QUIZ_MODEL_LIMITS)[QuizQuotaModelId];
export type SttQuotaDefinition = (typeof STT_MODEL_LIMITS)[SttQuotaModelId]
export type QuotaDefinition = TextQuotaDefinition | FlashcardQuotaDefinition | QuizQuotaDefinition | SttQuotaDefinition;

export const PRIMARY_FLASHCARD_MODEL: FlashcardQuotaModelId = "groq/compound"
export const FALLBACK_FLASHCARD_MODEL: FlashcardQuotaModelId = "groq/compound-mini"
export const PRIMARY_QUIZ_MODEL: QuizQuotaModelId = "groq/compound";
export const FALLBACK_QUIZ_MODEL: QuizQuotaModelId = "groq/compound-mini";

export function getTextQuotaDefinition(model: string): TextQuotaDefinition | null {
  if (model in TEXT_MODEL_LIMITS) {
    return TEXT_MODEL_LIMITS[model as TextQuotaModelId]
  }
  return null
}

export function getFlashcardQuotaDefinition(model: string): FlashcardQuotaDefinition | null {
  if (model in FLASHCARD_MODEL_LIMITS) {
    return FLASHCARD_MODEL_LIMITS[model as FlashcardQuotaModelId]
  }
  return null
}

export function getQuizQuotaDefinition(model: string): QuizQuotaDefinition | null {
	if (model in QUIZ_MODEL_LIMITS) {
		return QUIZ_MODEL_LIMITS[model as QuizQuotaModelId];
	}
	return null;
}

export function getSttQuotaDefinition(model: string): SttQuotaDefinition | null {
  if (model in STT_MODEL_LIMITS) {
    return STT_MODEL_LIMITS[model as SttQuotaModelId]
  }
  return null
}

export function getQuotaDefinition(category: QuotaCategory, model: string): QuotaDefinition | null {
  switch (category) {
		case "text":
			return getTextQuotaDefinition(model);
		case "flashcard":
			return getFlashcardQuotaDefinition(model);
		case "quiz":
			return getQuizQuotaDefinition(model);
		case "voice":
			return getSttQuotaDefinition(model);
		default:
			return null;
  }
}

export function formatDurationSeconds(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}
