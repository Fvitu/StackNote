"use client";

const STORAGE_KEY = "stacknote:pending-ai-prompt";

type PendingAiPrompt = {
	noteId: string;
	prompt: string;
	createdAt: number;
};

export function queuePendingAiPrompt(noteId: string, prompt: string) {
	if (typeof window === "undefined") {
		return;
	}

	const payload: PendingAiPrompt = {
		noteId,
		prompt,
		createdAt: Date.now(),
	};
	window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function readPendingAiPrompt(noteId: string) {
	if (typeof window === "undefined") {
		return null;
	}

	const raw = window.sessionStorage.getItem(STORAGE_KEY);
	if (!raw) {
		return null;
	}

	try {
		const parsed = JSON.parse(raw) as PendingAiPrompt;
		if (parsed.noteId !== noteId || typeof parsed.prompt !== "string" || !parsed.prompt.trim()) {
			return null;
		}

		return parsed;
	} catch {
		return null;
	}
}

export function clearPendingAiPrompt() {
	if (typeof window === "undefined") {
		return;
	}

	window.sessionStorage.removeItem(STORAGE_KEY);
}
