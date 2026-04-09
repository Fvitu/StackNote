import { noteContentToText } from "@/lib/ai/note-content";

// Nomic `nomic-embed-text-v1.5` returns 768-dimensional vectors; keep the DB type in sync.
export const EMBEDDING_DIMENSION = 768;
const DEFAULT_EMBEDDING_MODEL = "nomic-embed-text-v1.5";
const EMBEDDING_MAX_CHARS = 8_000;
const NOMIC_EMBEDDING_URL = "https://api-atlas.nomic.ai/v1/embedding/text";

type NomicEmbeddingResponse = {
	embeddings?: number[][];
};

type OpenAiCompatibleEmbeddingResponse = {
	data?: Array<{
		embedding?: number[];
	}>;
};

function getEmbeddingModel() {
	return process.env.EMBEDDINGS_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
}

export function isEmbeddingsConfigured() {
	return Boolean(process.env.EMBEDDINGS_API_KEY?.trim() || process.env.NOMIC_API_KEY?.trim());
}

export function stripMarkdown(text: string): string {
	return text
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`[^`]*`/g, " ")
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/#{1,6}\s/g, "")
		.replace(/>\s?/g, "")
		.replace(/[*_~]/g, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export function prepareEmbeddingText(input: string | unknown) {
	const text = typeof input === "string" ? input : noteContentToText(input);
	return stripMarkdown(text).slice(0, EMBEDDING_MAX_CHARS);
}

async function requestOpenAiCompatibleEmbedding(baseUrl: string, apiKey: string, text: string) {
	const response = await fetch(new URL("embeddings", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`), {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: getEmbeddingModel(),
			input: text,
		}),
	});

	if (!response.ok) {
		throw new Error(`Embedding request failed: ${response.status} ${response.statusText}`);
	}

	const data = (await response.json()) as OpenAiCompatibleEmbeddingResponse;
	return data.data?.[0]?.embedding ?? null;
}

async function requestNomicEmbedding(apiKey: string, text: string, taskType: "search_document" | "search_query") {
	const response = await fetch(NOMIC_EMBEDDING_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: getEmbeddingModel(),
			texts: [text],
			task_type: taskType,
		}),
	});

	if (!response.ok) {
		throw new Error(`Embedding request failed: ${response.status} ${response.statusText}`);
	}

	const data = (await response.json()) as NomicEmbeddingResponse;
	return data.embeddings?.[0] ?? null;
}

async function requestEmbedding(text: string, taskType: "search_document" | "search_query"): Promise<number[] | null> {
	const cleanText = prepareEmbeddingText(text);
	if (!cleanText) {
		return null;
	}

	const openAiCompatibleApiKey = process.env.EMBEDDINGS_API_KEY?.trim();
	const openAiCompatibleBaseUrl = process.env.EMBEDDINGS_BASE_URL?.trim();
	const nomicApiKey = process.env.NOMIC_API_KEY?.trim();

	const embedding =
		openAiCompatibleApiKey && openAiCompatibleBaseUrl
			? await requestOpenAiCompatibleEmbedding(openAiCompatibleBaseUrl, openAiCompatibleApiKey, cleanText)
			: nomicApiKey
				? await requestNomicEmbedding(nomicApiKey, cleanText, taskType)
				: null;

	if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSION) {
		throw new Error(`Embedding response did not include a ${EMBEDDING_DIMENSION}-dimension vector`);
	}

	return embedding;
}

export function generateEmbedding(text: string) {
	return requestEmbedding(text, "search_document");
}

export function generateQueryEmbedding(query: string) {
	return requestEmbedding(query, "search_query");
}
