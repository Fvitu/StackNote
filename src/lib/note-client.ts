"use client";

import { fetchJson } from "@/lib/api-client";

export interface NoteData {
	id: string;
	title: string;
	emoji?: string | null;
	coverImage: string | null;
	coverImageMeta?: unknown;
	content: unknown;
	createdAt: string;
	updatedAt: string;
	editorWidth?: number | null;
	folderId?: string | null;
	workspace: { name: string };
	folder: { name: string } | null;
}

export function fetchNote(noteId: string) {
	return fetchJson<NoteData>(`/api/notes/${noteId}`);
}
