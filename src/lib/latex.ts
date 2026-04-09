const UNIT_TEXT_PATTERN = /^[A-Za-z0-9\u03A9\u03BC\u00B0%/().,^+\-\s\u00B7\u22C5\u2022]+$/;

function looksLikeUnitText(value: string) {
	const trimmed = value.trim();
	if (!trimmed || !UNIT_TEXT_PATTERN.test(trimmed)) {
		return false;
	}

	const tokens = trimmed.match(/[A-Za-z\u03A9\u03BC]+/g) ?? [];
	return tokens.length > 0 && tokens.every((token) => token.length <= 4);
}

export function normalizeLatexSource(source: string) {
	return source
		.replace(/\u00a0/g, " ")
		.replace(/\\text\{([^{}]+)\}/g, (match, inner: string) => (looksLikeUnitText(inner) ? `\\mathrm{${inner.trim()}}` : match));
}
