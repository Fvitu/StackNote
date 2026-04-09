export const FOLDER_NAME_MAX_LENGTH = 80;
export const NOTE_TITLE_MAX_LENGTH = 120;

// Disallow filesystem-reserved and control characters in folder/note names.
export const NAME_FORBIDDEN_CHARACTERS_REGEX = /[\\/:*?"<>|\u0000-\u001F]/;

export type NameValidationResult =
	| { ok: true; value: string }
	| { ok: false; error: string };

function normalizeNameValue(value: string): string {
	return value.trim().replace(/\s+/g, " ");
}

function validateName(value: unknown, label: "Folder name" | "Note title", maxLength: number): NameValidationResult {
	if (typeof value !== "string") {
		return { ok: false, error: `${label} must be a string` };
	}

	const normalized = normalizeNameValue(value);
	if (!normalized) {
		return { ok: false, error: `${label} is required` };
	}

	if (normalized.length > maxLength) {
		return { ok: false, error: `${label} must be ${maxLength} characters or fewer` };
	}

	if (NAME_FORBIDDEN_CHARACTERS_REGEX.test(normalized)) {
		return { ok: false, error: `${label} contains forbidden characters` };
	}

	return { ok: true, value: normalized };
}

export function validateFolderName(value: unknown): NameValidationResult {
	return validateName(value, "Folder name", FOLDER_NAME_MAX_LENGTH);
}

export function validateNoteTitle(value: unknown): NameValidationResult {
	return validateName(value, "Note title", NOTE_TITLE_MAX_LENGTH);
}
