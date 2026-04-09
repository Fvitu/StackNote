import { prisma } from "@/lib/prisma";
import { generateEmbedding, isEmbeddingsConfigured, prepareEmbeddingText } from "@/lib/embeddings";

const MIN_EMBEDDING_TEXT_LENGTH = 50;
const REEMBED_COOLDOWN_MS = 30_000;

export async function embedNoteAsync(noteId: string, searchableText: unknown) {
	if (!isEmbeddingsConfigured()) {
		return;
	}

	const text = prepareEmbeddingText(searchableText);
	if (text.trim().length < MIN_EMBEDDING_TEXT_LENGTH) {
		await prisma.$executeRaw`
			UPDATE "notes"
			SET "embedding" = NULL,
					"vectorUpdatedAt" = NULL
			WHERE "id" = ${noteId}
		`;
		return;
	}

	const note = await prisma.note.findUnique({
		where: { id: noteId },
		select: {
			vectorUpdatedAt: true,
		},
	});

	if (note?.vectorUpdatedAt && Date.now() - note.vectorUpdatedAt.getTime() < REEMBED_COOLDOWN_MS) {
		return;
	}

	const embedding = await generateEmbedding(text);
	if (!embedding) {
		return;
	}

	await prisma.$executeRaw`
		UPDATE "notes"
		SET "embedding" = ${JSON.stringify(embedding)}::vector,
				"vectorUpdatedAt" = NOW()
		WHERE "id" = ${noteId}
	`;
}
