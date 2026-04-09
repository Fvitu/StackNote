export const TEXT_MODELS = [
	{
		id: "openai/gpt-oss-120b",
		name: "GPT-OSS 120B",
		description: "Strongest general-purpose reasoning model",
		contextWindow: 131072,
		tier: "free",
		default: true,
	},
	{
		id: "qwen/qwen3-32b",
		name: "Qwen 3 32B",
		description: "Balanced reasoning with visible thinking-style responses",
		contextWindow: 131072,
		tier: "free",
		default: false,
	},
	{
		id: "llama-3.3-70b-versatile",
		name: "LLaMA 3.3 70B",
		description: "Reliable long-context text model",
		contextWindow: 128000,
		tier: "free",
		default: false,
	},
	{
		id: "llama-3.1-8b-instant",
		name: "LLaMA 3.1 8B Instant",
		description: "Fastest low-cost text model for lightweight note tasks",
		contextWindow: 131072,
		tier: "free",
		default: false,
	},
	{
		id: "meta-llama/llama-4-scout-17b-16e-instruct",
		name: "LLaMA 4 Scout 17B",
		description: "Fast multimodal-capable model",
		contextWindow: 131072,
		tier: "free",
		default: false,
	},
] as const;

export const STT_MODELS = [
	{
		id: "whisper-large-v3",
		name: "Whisper Large v3",
		description: "Highest accuracy transcription model",
		tier: "free",
		default: true,
	},
	{
		id: "whisper-large-v3-turbo",
		name: "Whisper Large v3 Turbo",
		description: "Faster transcription with the same daily quota",
		tier: "free",
		default: false,
	},
] as const;

export type TextModelId = (typeof TEXT_MODELS)[number]["id"];
export type SttModelId = (typeof STT_MODELS)[number]["id"];

export const DEFAULT_TEXT_MODEL: TextModelId = "openai/gpt-oss-120b";
export const DEFAULT_STT_MODEL: SttModelId = "whisper-large-v3";

export function isValidTextModel(model: string): model is TextModelId {
	return TEXT_MODELS.some((m) => m.id === model);
}

export function isValidSttModel(model: string): model is SttModelId {
	return STT_MODELS.some((m) => m.id === model);
}

export function resolveTextModel(requestedModel?: string | null, preferredModel?: string | null): TextModelId {
	if (requestedModel && isValidTextModel(requestedModel)) {
		return requestedModel;
	}

	if (preferredModel && isValidTextModel(preferredModel)) {
		return preferredModel;
	}

	return DEFAULT_TEXT_MODEL;
}

export function resolveSttModel(requestedModel?: string | null, preferredModel?: string | null): SttModelId {
	if (requestedModel && isValidSttModel(requestedModel)) {
		return requestedModel;
	}

	if (preferredModel && isValidSttModel(preferredModel)) {
		return preferredModel;
	}

	return DEFAULT_STT_MODEL;
}
