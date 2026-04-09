export const NOTE_CACHE_KEY = "stacknote:cache";
export const NOTE_CACHE_LIMIT = 100;

export const NOTE_VERSION_LIMIT = 50;
export const NOTE_VERSION_IDLE_THRESHOLD_MS = 5 * 60 * 1000;
export const NOTE_VERSION_MAX_INTERVAL_MS = 30 * 60 * 1000;

export interface NoteVersionSummary {
	id: string;
	createdAt: string;
	manual: boolean;
	label: string | null;
}

export interface NoteVersionDetail extends NoteVersionSummary {
	content: unknown;
	coverImage?: string | null;
	coverImageMeta?: unknown;
	title?: string | null;
	emoji?: string | null;
}

export interface CreateNoteVersionPayload {
	manual: boolean;
	label?: string;
	content?: unknown;
}
