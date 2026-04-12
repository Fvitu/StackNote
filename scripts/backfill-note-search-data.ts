import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { buildSearchableTextValue } from "../src/lib/searchable-text";

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

	for (const note of notes) {
		const searchableText = buildSearchableTextValue(note.content);
		const textChanged = searchableText !== note.searchableText;

		if (textChanged) {
			await prisma.note.update({
				where: { id: note.id },
				data: {
					searchableText,
				},
			});

			updatedSearchableTextCount += 1;
		}
	}

	console.log(
		JSON.stringify(
			{
				notesProcessed: notes.length,
				searchableTextUpdated: updatedSearchableTextCount,
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
