import type { NoteData } from "@/lib/note-client";
import { localNotes, type LocalNoteRecord } from "@/lib/db/local";

export function noteDataToLocalRecord(note: NoteData): LocalNoteRecord {
	return {
		id: note.id,
		title: note.title,
		emoji: note.emoji ?? null,
		workspaceId: null,
		folderId: note.folderId ?? null,
		coverImage: note.coverImage,
		coverImageMeta: note.coverImageMeta,
		content: note.content,
		createdAt: note.createdAt,
		updatedAt: note.updatedAt,
		editorWidth: note.editorWidth ?? null,
		_syncStatus: "synced",
	};
}

export function localRecordToNoteData(note: LocalNoteRecord, workspaceName = "Workspace"): NoteData {
	return {
		id: note.id,
		title: note.title,
		emoji: note.emoji ?? null,
		coverImage: note.coverImage ?? null,
		coverImageMeta: note.coverImageMeta,
		content: note.content,
		createdAt: note.createdAt,
		updatedAt: note.updatedAt,
		editorWidth: note.editorWidth ?? null,
		folderId: note.folderId ?? null,
		workspace: { name: workspaceName },
		folder: null,
		folderPath: [],
	};
}

export async function fetchNoteWithLocalFallback(noteId: string, fetchRemote: (noteId: string) => Promise<NoteData>) {
	try {
		const remoteNote = await fetchRemote(noteId);
		await localNotes.upsert(noteDataToLocalRecord(remoteNote));
		return remoteNote;
	} catch (error) {
		const localNote = await localNotes.getById(noteId);
		if (localNote) {
			return localRecordToNoteData(localNote);
		}

		throw error;
	}
}
