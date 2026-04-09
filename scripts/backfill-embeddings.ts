import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { embedNoteAsync } from "@/lib/embed-note";

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 500;

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
	const notes = await prisma.note.findMany({
		where: {
			isArchived: false,
			vectorUpdatedAt: null,
		},
		select: {
			id: true,
			searchableText: true,
		},
		orderBy: {
			updatedAt: "desc",
		},
	});

	console.log(`[embedding-backfill] Found ${notes.length} notes to embed`);

	for (let index = 0; index < notes.length; index += BATCH_SIZE) {
		const batch = notes.slice(index, index + BATCH_SIZE);
		await Promise.all(
			batch.map(async (note) => {
				await embedNoteAsync(note.id, note.searchableText);
			}),
		);

		console.log(`[embedding-backfill] Processed ${Math.min(index + batch.length, notes.length)} / ${notes.length}`);

		if (index + BATCH_SIZE < notes.length) {
			await sleep(BATCH_DELAY_MS);
		}
	}
}

void main()
	.catch((error) => {
		console.error("[embedding-backfill] failed", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
