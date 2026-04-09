import { isEmbeddingsConfigured } from "@/lib/embeddings";

type EnqueueNoteEmbeddingJobInput = {
	noteId: string;
	origin: string;
	cookieHeader?: string | null;
};

export async function enqueueNoteEmbeddingJob({ noteId, origin, cookieHeader }: EnqueueNoteEmbeddingJobInput) {
	if (!isEmbeddingsConfigured()) {
		return;
	}

	const headers = new Headers();
	if (cookieHeader) {
		headers.set("cookie", cookieHeader);
	}

	await fetch(new URL(`/api/notes/${noteId}/embed`, origin), {
		method: "POST",
		headers,
		cache: "no-store",
	});
}
