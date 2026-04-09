type InlineContent = {
	type?: string;
	text?: string;
	props?: Record<string, unknown>;
	content?: InlineContent[] | string;
};

type Block = {
	type?: string;
	props?: Record<string, unknown>;
	content?: InlineContent[] | Block[] | string;
	children?: Block[];
};

const TEXT_BLOCK_TYPES = new Set([
	"paragraph",
	"heading",
	"bulletListItem",
	"numberedListItem",
	"checkListItem",
	"quote",
	"callout",
]);

const MEDIA_BLOCK_TYPES = new Set([
	"image",
	"imageMedia",
	"video",
	"videoMedia",
	"videoEmbed",
	"audio",
	"audioMedia",
	"file",
	"fileBlock",
	"pdfMedia",
]);

function getStringValue(value: unknown) {
	return typeof value === "string" ? value : "";
}

function getStringProp(props: Record<string, unknown> | undefined, key: string) {
	return getStringValue(props?.[key]).trim();
}

function normalizePart(text: string) {
	return text.replace(/\s+/g, " ").trim();
}

function extractLeafText(content: InlineContent[] | string | undefined): string[] {
	if (!content) {
		return [];
	}

	if (typeof content === "string") {
		const normalized = normalizePart(content);
		return normalized ? [normalized] : [];
	}

	const parts: string[] = [];

	for (const item of content) {
		if (!item || typeof item !== "object") {
			continue;
		}

		const text = normalizePart(getStringValue(item.text));
		if (text) {
			parts.push(text);
		}

		if (item.type === "inlineEquation") {
			const latex = normalizePart(getStringProp(item.props, "latex"));
			if (latex) {
				parts.push(latex);
			}
		}

		if (Array.isArray(item.content) || typeof item.content === "string") {
			parts.push(...extractLeafText(item.content));
		}
	}

	return parts;
}

function extractCodeText(block: Block) {
	const code =
		getStringProp(block.props, "code") ||
		getStringProp(block.props, "text") ||
		(typeof block.content === "string" ? block.content.trim() : "");

	return normalizePart(code);
}

function extractMathText(block: Block) {
	const latex =
		getStringProp(block.props, "latex") ||
		getStringProp(block.props, "source") ||
		getStringProp(block.props, "text") ||
		(typeof block.content === "string" ? block.content.trim() : "");

	return normalizePart(latex);
}

function walkBlock(block: Block, parts: string[]) {
	const blockType = block.type ?? "";

	if (TEXT_BLOCK_TYPES.has(blockType)) {
		parts.push(...extractLeafText(Array.isArray(block.content) || typeof block.content === "string" ? block.content : undefined));
	} else if (blockType === "codeBlock") {
		const codeText = extractCodeText(block);
		if (codeText) {
			parts.push(codeText);
		}
	} else if (blockType === "mathBlock" || blockType === "equation") {
		const mathText = extractMathText(block);
		if (mathText) {
			parts.push(mathText);
		}
	} else if (!MEDIA_BLOCK_TYPES.has(blockType) && Array.isArray(block.content)) {
		for (const item of block.content) {
			if (item && typeof item === "object" && "type" in item) {
				walkBlock(item as Block, parts);
			}
		}
	}

	if (Array.isArray(block.children)) {
		for (const child of block.children) {
			if (child && typeof child === "object") {
				walkBlock(child, parts);
			}
		}
	}
}

export function extractSearchableText(content: unknown) {
	if (!Array.isArray(content)) {
		return "";
	}

	const parts: string[] = [];

	for (const block of content) {
		if (block && typeof block === "object") {
			walkBlock(block as Block, parts);
		}
	}

	return parts
		.map((part) => normalizePart(part))
		.filter(Boolean)
		.join(" ")
		.trim();
}

export function buildSearchableTextValue(content: unknown) {
	const searchableText = extractSearchableText(content);
	return searchableText || null;
}
