import { NextRequest, NextResponse } from "next/server";
import { createHighlighter } from "shiki";
import { SHIKI_LANGUAGE_IDS, stacknoteTheme, type SupportedLanguageId } from "@/lib/shiki-theme";
import { auth } from "@/lib/auth";

const cache = new Map<string, string>();

let highlighterPromise: ReturnType<typeof createHighlighter> | null = null;

function getHighlighter() {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighter({
			themes: [stacknoteTheme],
			langs: [...SHIKI_LANGUAGE_IDS],
		});
	}

	return highlighterPromise;
}

function normalizeLanguage(value: string): SupportedLanguageId {
	return (SHIKI_LANGUAGE_IDS.includes(value as SupportedLanguageId) ? value : "typescript") as SupportedLanguageId;
}

export async function POST(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = (await request.json().catch(() => null)) as { code?: string; language?: string } | null;

	if (!body || typeof body.code !== "string") {
		return NextResponse.json({ error: "code is required" }, { status: 400 });
	}

	const language = normalizeLanguage(body.language ?? "typescript");
	const cacheKey = `${language}::${body.code}`;

	const cached = cache.get(cacheKey);
	if (cached) {
		return NextResponse.json({ html: cached });
	}

	const highlighter = await getHighlighter();
	const html = highlighter.codeToHtml(body.code, {
		lang: language,
		theme: "stacknote-oled",
	});

	cache.set(cacheKey, html);
	if (cache.size > 400) {
		const firstKey = cache.keys().next().value;
		if (firstKey) cache.delete(firstKey);
	}

	return NextResponse.json({ html });
}
