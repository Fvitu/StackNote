import { normalizeCodeLanguage } from "@/lib/code-language";
import { buildFileAccessUrl } from "@/lib/file-url";

type UnknownRecord = Record<string, unknown>;

const CONTENTLESS_BLOCK_TYPES = new Set(["imageMedia", "linkPreview", "pdfMedia", "audioMedia", "videoEmbed", "equation", "codeBlock", "aiBlock"]);

function toRecord(value: unknown): UnknownRecord | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as UnknownRecord;
}

function inlineToText(value: unknown): string {
	if (typeof value === "string") return value;
	if (!Array.isArray(value)) return "";

	const parts: string[] = [];
	for (const item of value) {
		if (typeof item === "string") {
			parts.push(item);
			continue;
		}

		const obj = toRecord(item);
		if (!obj) continue;

		const text = obj.text;
		if (typeof text === "string") {
			parts.push(text);
			continue;
		}

		const content = obj.content;
		if (Array.isArray(content)) {
			parts.push(inlineToText(content));
		}
	}

	return parts.join("");
}

function normalizeInlineContent(value: unknown): unknown[] | undefined {
	if (typeof value === "string") {
		return value.length > 0 ? [{ type: "text", text: value }] : [];
	}

	if (!Array.isArray(value)) return undefined;

	const normalized = value
		.map((item) => {
			if (typeof item === "string") {
				return item.length > 0 ? { type: "text", text: item } : null;
			}

			const obj = toRecord(item);
			if (!obj || typeof obj.type !== "string") return null;

			const next: UnknownRecord = {
				type: obj.type,
			};

			if (typeof obj.text === "string") {
				next.text = obj.text;
			}

			if (obj.styles && toRecord(obj.styles)) {
				next.styles = obj.styles;
			}

			if (obj.props && toRecord(obj.props)) {
				next.props = obj.props;
			}

			if (Array.isArray(obj.content)) {
				const content = normalizeInlineContent(obj.content);
				if (content !== undefined) {
					next.content = content;
				}
			}

			return next;
		})
		.filter((item): item is UnknownRecord => item !== null);

	return normalized;
}

function normalizeFileBackedMediaBlock(block: UnknownRecord): UnknownRecord {
	const type = block.type;
	if (type !== "imageMedia" && type !== "pdfMedia" && type !== "audioMedia") {
		return block;
	}

	const props = toRecord(block.props);
	if (!props || typeof props.fileId !== "string" || props.fileId.length === 0) {
		return block;
	}

	const stableUrl = buildFileAccessUrl(props.fileId);
	if (props.url === stableUrl) {
		return block;
	}

	return {
		...block,
		props: {
			...props,
			url: stableUrl,
		},
	};
}

function normalizeSingleBlock(block: unknown): unknown {
	const obj = toRecord(block);
	if (!obj) return block;
	const blockType = typeof obj.type === "string" ? obj.type : undefined;
	const isContentlessBlock = blockType ? CONTENTLESS_BLOCK_TYPES.has(blockType) : false;

	const normalizedChildren = Array.isArray(obj.children) ? obj.children.map((child) => normalizeSingleBlock(child)) : obj.children;

	let nextBlock: UnknownRecord = obj;

	if (blockType === "codeBlock") {
		const props = toRecord(obj.props) ?? {};
		const code = typeof props.code === "string" ? props.code : inlineToText(obj.content);

		nextBlock = {
			...obj,
			type: "codeBlock",
			content: undefined,
			props: {
				...props,
				code,
				language: normalizeCodeLanguage(typeof props.language === "string" ? props.language : "typescript"),
				showLineNumbers: typeof props.showLineNumbers === "boolean" ? props.showLineNumbers : true,
				filename: typeof props.filename === "string" ? props.filename : "",
			},
		};
	}

	if (isContentlessBlock) {
		nextBlock = {
			...nextBlock,
			content: undefined,
			children: undefined,
		};
	}

	const normalizedContent = isContentlessBlock ? undefined : normalizeInlineContent(obj.content);
	if (normalizedContent !== undefined) {
		nextBlock = {
			...nextBlock,
			content: normalizedContent,
		};
	} else if (!isContentlessBlock) {
		delete nextBlock.content;
	}

	nextBlock = normalizeFileBackedMediaBlock(nextBlock);

	if (!isContentlessBlock && normalizedChildren !== nextBlock.children) {
		nextBlock = {
			...nextBlock,
			children: normalizedChildren,
		};
	}

	return nextBlock;
}

export function normalizeBlockNoteContent(content: unknown): unknown {
	if (!Array.isArray(content)) return content;
	return content.map((block) => normalizeSingleBlock(block));
}
