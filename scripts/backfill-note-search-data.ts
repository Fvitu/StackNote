import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { generateEmbedding, isEmbeddingsConfigured, prepareEmbeddingText } from "../src/lib/embeddings";
import { buildSearchableTextValue } from "../src/lib/searchable-text";
const MIN_EMBEDDING_TEXT_LENGTH = 50;

async function main() {
	const notes = await prisma.note.findMany({
		select: {
			id: true,
			content: true,
			searchableText: true,
		},
		orderBy: { updatedAt: "asc" },
	});

	let updatedSearchableTextCount = 0;
	let embeddedCount = 0;

	for (const note of notes) {
		const searchableText = buildSearchableTextValue(note.content);
		const textChanged = searchableText !== note.searchableText;

		if (textChanged) {
			await prisma.note.update({
				where: { id: note.id },
				data: { searchableText },
			});

			await prisma.$executeRaw`
				UPDATE "notes"
				SET "embedding" = NULL,
						"vectorUpdatedAt" = NULL
				WHERE "id" = ${note.id}
			`;

			updatedSearchableTextCount += 1;
		}

		if (!isEmbeddingsConfigured() || !searchableText) {
			continue;
		}

		const embeddingText = prepareEmbeddingText(searchableText);
		if (embeddingText.length < MIN_EMBEDDING_TEXT_LENGTH) {
			continue;
		}

		const embedding = await generateEmbedding(searchableText);
		if (!embedding) {
			continue;
		}

		await prisma.$executeRaw`
			UPDATE "notes"
			SET "embedding" = ${JSON.stringify(embedding)}::vector,
					"vectorUpdatedAt" = NOW()
			WHERE "id" = ${note.id}
		`;
		embeddedCount += 1;
	}

	console.log(
		JSON.stringify(
			{
				notesProcessed: notes.length,
				searchableTextUpdated: updatedSearchableTextCount,
				embeddingsUpdated: embeddedCount,
			},
			null,
			2,
		),
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
