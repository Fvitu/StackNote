import { prisma } from "@/lib/prisma";
import { noteContentToText, truncateToTokenLimit } from "@/lib/ai/note-content";
import { generateQueryEmbedding } from "@/lib/embeddings";

export interface SemanticSearchResult {
	id: string;
	title: string;
	emoji: string | null;
	folderId: string | null;
	updatedAt: Date;
	excerpt: string;
	similarity: number;
}

type SemanticSearchRow = {
	id: string;
	title: string;
	emoji: string | null;
	folderId: string | null;
	updatedAt: Date;
	searchableText: string | null;
	similarity: number;
};

type SimilarityOnlyRow = {
	id: string;
	title: string;
	content: unknown;
	similarity: number;
};

function buildExcerpt(searchableText: string | null, maxLength = 300) {
	const plainText = (searchableText ?? "").replace(/\s+/g, " ").trim();
	if (!plainText) {
		return "";
	}

	return plainText.length > maxLength ? `${plainText.slice(0, maxLength).trim()}…` : plainText;
}

export async function semanticSearch(query: string, workspaceId: string, limit = 10, similarityThreshold = 0.5): Promise<SemanticSearchResult[]> {
	const queryEmbedding = await generateQueryEmbedding(query);
	if (!queryEmbedding) {
		return [];
	}

	const vectorLiteral = JSON.stringify(queryEmbedding);
	const results = await prisma.$queryRaw<SemanticSearchRow[]>`
		SELECT
			"id",
			"title",
			"emoji",
			"folderId",
			"updatedAt",
			COALESCE(to_jsonb("notes") ->> 'searchableText', to_jsonb("notes") ->> 'searchable_text', '') AS "searchableText",
			1 - ("embedding" <=> ${vectorLiteral}::vector) AS "similarity"
		FROM "notes"
		WHERE
			"workspaceId" = ${workspaceId}
			AND "isArchived" = false
			AND "embedding" IS NOT NULL
			AND "vectorUpdatedAt" IS NOT NULL
		ORDER BY "embedding" <=> ${vectorLiteral}::vector
		LIMIT ${limit}
	`;

	return results
		.filter((result) => result.similarity >= similarityThreshold)
		.map((result) => ({
			id: result.id,
			title: result.title,
			emoji: result.emoji,
			folderId: result.folderId,
			updatedAt: result.updatedAt,
			excerpt: buildExcerpt(result.searchableText),
			similarity: Number(result.similarity),
		}));
}

export async function buildRagContext(query: string, workspaceId: string, currentNoteId?: string | null) {
	const queryEmbedding = await generateQueryEmbedding(query);
	if (!queryEmbedding) {
		return { context: "", noteCount: 0 };
	}

	const vectorLiteral = JSON.stringify(queryEmbedding);
	const results = await prisma.$queryRaw<SimilarityOnlyRow[]>`
		SELECT
			"id",
			"title",
			"content",
			1 - ("embedding" <=> ${vectorLiteral}::vector) AS "similarity"
		FROM "notes"
		WHERE
			"workspaceId" = ${workspaceId}
			AND "isArchived" = false
			AND "embedding" IS NOT NULL
			AND "id" != ${currentNoteId ?? ""}
		ORDER BY "embedding" <=> ${vectorLiteral}::vector
		LIMIT 3
	`;

	const relevantNotes = results.filter((result) => result.similarity > 0.6);
	if (relevantNotes.length === 0) {
		return { context: "", noteCount: 0 };
	}

	const context = relevantNotes
		.map((note) => `### ${note.title || "Untitled"}\n${truncateToTokenLimit(buildExcerpt(noteContentToText(note.content), 800), 250)}`)
		.join("\n\n---\n\n");

	return {
		context,
		noteCount: relevantNotes.length,
	};
}
