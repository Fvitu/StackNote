const CHAT_SESSION_TITLE_MAX_LENGTH = 48

export function normalizeContextNoteIds(noteIds: unknown): string[] {
	if (!Array.isArray(noteIds)) {
		return []
	}

	const uniqueIds = new Set<string>()

	for (const noteId of noteIds) {
		if (typeof noteId === "string") {
			const trimmed = noteId.trim()
			if (trimmed) {
				uniqueIds.add(trimmed)
			}
		}
	}

	return Array.from(uniqueIds)
}

export function buildChatSessionTitle(message: string) {
	const normalized = message.trim().replace(/\s+/g, " ")
	if (!normalized) {
		return "New chat"
	}

	if (normalized.length <= CHAT_SESSION_TITLE_MAX_LENGTH) {
		return normalized
	}

	return `${normalized.slice(0, CHAT_SESSION_TITLE_MAX_LENGTH - 1).trimEnd()}…`
}
