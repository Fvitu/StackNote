"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import dynamic from "next/dynamic";
import { useCallback, useEffect, forwardRef, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type WheelEvent } from "react";
import { toast } from "sonner";
import {
	useCreateBlockNote,
	SuggestionMenuController,
	getDefaultReactSlashMenuItems,
	useExtensionState,
	FormattingToolbar,
	FormattingToolbarController,
	getFormattingToolbarItems,
	FileReplaceButton,
	FileRenameButton,
	useBlockNoteEditor,
	useComponentsContext,
	useEditorState,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu, SuggestionMenu as SuggestionMenuExtension } from "@blocknote/core/extensions";
import { offset, shift, size } from "@floating-ui/react";
import type { DefaultReactSuggestionItem } from "@blocknote/react";
import { ImageIcon, FileText, Music, Video, Sigma, Code, Download, Sparkles, Smile } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";
import { customBlockSpecs } from "@/components/editor/blocks";
import { customInlineContentSpecs } from "@/components/editor/inline";
import { EmojiPickerSkeleton } from "@/components/layout/AppShellSkeleton";
import { getAcceptForType, getMediaTypeFromFile, parseVideoEmbedUrl, type MediaType } from "@/lib/media";
import { uploadFileForNote } from "@/lib/upload";
import { useFileDrop } from "@/hooks/useFileDrop";
import { normalizeBlockNoteContent } from "@/lib/blocknote-normalize";
import { convertPlainTextToEditorHtml, parseRichTextToBlocks, shouldPreferPlainTextPaste, transformExternalHtmlForEditor } from "@/lib/editor-paste";

const SINGLE_URL_REGEX = /^https?:\/\/[^\s]+$/i;

type MinimalBlock = {
	id: string;
	content?: unknown;
	children?: unknown;
};

const CONTENTLESS_BLOCK_TYPES = new Set(["imageMedia", "linkPreview", "pdfMedia", "audioMedia", "videoEmbed", "equation", "codeBlock", "aiBlock"]);
const SAFE_INITIAL_BLOCK_TYPES = new Set([
	"paragraph",
	"heading",
	"bulletListItem",
	"numberedListItem",
	"checkListItem",
	"quote",
	"table",
	"imageMedia",
	"linkPreview",
	"pdfMedia",
	"audioMedia",
	"videoEmbed",
	"equation",
	"codeBlock",
	"aiBlock",
]);

function createSafeBlockId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}

	return `block-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function toSanitizedInlineContent(value: unknown): unknown[] | undefined {
	if (typeof value === "string") {
		return value.length > 0 ? [{ type: "text", text: value }] : [];
	}

	if (!Array.isArray(value)) {
		return undefined;
	}

	const sanitized = value
		.map((item) => {
			if (typeof item === "string") {
				return item.length > 0 ? { type: "text", text: item } : null;
			}

			if (!isPlainObject(item) || typeof item.type !== "string") {
				return null;
			}

			const next: Record<string, unknown> = {
				type: item.type,
			};

			if (typeof item.text === "string") {
				next.text = item.text;
			}

			if (item.styles && isPlainObject(item.styles)) {
				next.styles = item.styles;
			}

			if (item.props && isPlainObject(item.props)) {
				next.props = item.props;
			}

			if (Array.isArray(item.content)) {
				next.content = toSanitizedInlineContent(item.content);
			}

			return next;
		})
		.filter((item): item is Record<string, unknown> => item !== null);

	return sanitized;
}

function sanitizeBlockProps(value: unknown): Record<string, unknown> | undefined {
	if (!isPlainObject(value)) {
		return undefined;
	}

	const sanitized: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value)) {
		if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
			sanitized[key] = item;
			continue;
		}

		if (item === null) {
			sanitized[key] = item;
		}
	}

	return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function sanitizeBlockChildren(value: unknown): Record<string, unknown>[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}

	const sanitized = value.map((child) => sanitizeInitialBlock(child)).filter((child): child is Record<string, unknown> => child !== null);

	return sanitized.length > 0 ? sanitized : undefined;
}

function createFallbackParagraphBlock(): Record<string, unknown> {
	return {
		id: createSafeBlockId(),
		type: "paragraph",
		content: [],
	};
}

function sanitizeInitialBlock(block: unknown): Record<string, unknown> | null {
	if (!isPlainObject(block) || typeof block.type !== "string") {
		return null;
	}

	if (!SAFE_INITIAL_BLOCK_TYPES.has(block.type)) {
		const text = typeof block.content === "string" ? block.content : extractTextContent(block.content).trim();
		return text.length > 0
			? {
					id: createSafeBlockId(),
					type: "paragraph",
					content: text,
				}
			: null;
	}

	const isContentlessBlock = CONTENTLESS_BLOCK_TYPES.has(block.type);

	const next: Record<string, unknown> = {
		id: typeof block.id === "string" && block.id.length > 0 ? block.id : createSafeBlockId(),
		type: block.type,
	};

	const sanitizedProps = sanitizeBlockProps(block.props);
	if (sanitizedProps) {
		next.props = sanitizedProps;
	}

	if (isContentlessBlock) {
		delete next.content;
		next.children = undefined;
	} else {
		const sanitizedContent = toSanitizedInlineContent(block.content);
		if (sanitizedContent !== undefined) {
			next.content = sanitizedContent;
		} else if (typeof block.content === "string" && block.content.trim().length > 0) {
			next.content = block.content;
		} else {
			next.content = [];
		}

		const sanitizedChildren = sanitizeBlockChildren(block.children);
		if (sanitizedChildren) {
			next.children = sanitizedChildren;
		}
	}

	if (block.type === "table" && !Array.isArray(next.children)) {
		return createFallbackParagraphBlock();
	}

	return next;
}

function getSafeInitialContent(content: unknown): unknown[] | undefined {
	const normalized = normalizeBlockNoteContent(content);
	if (!Array.isArray(normalized)) {
		return undefined;
	}

	const sanitizedBlocks = normalized.map((block) => sanitizeInitialBlock(block)).filter((block): block is Record<string, unknown> => block !== null);

	return sanitizedBlocks.length > 0 ? sanitizedBlocks : [createFallbackParagraphBlock()];
}

function sanitizePastedUrl(value: string): string {
	const trimmed = value.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
	return trimmed.replace(/^<|>$/g, "");
}

type UrlTransformParts = {
	url: string;
	leadingText: string;
	trailingText: string;
};

type LinkPreviewProps = {
	url: string;
	title: string;
	description: string;
	image: string;
	siteName: string;
	favicon: string;
	loading: boolean;
	error: string;
};

type LinkPreviewApiPayload = {
	title?: string;
	description?: string;
	image?: string;
	siteName?: string;
	favicon?: string;
	embedType?: "none" | "video";
	embedUrl?: string;
	platform?: "youtube" | "loom" | "vimeo" | "unknown";
};

type PartialEditorBlock = Record<string, unknown>;

type SelectedFileContext = {
	blockType: string;
	fileId: string;
	fileName: string;
};

type BlockInsertPosition = {
	referenceBlockId: string;
	placement: "before" | "after";
};

type Point = {
	x: number;
	y: number;
};

type EmojiPanelPosition = {
	left: number;
	top: number;
};

type EmojiSelection = {
	emoji: string;
};

type NoteEmojiPickerProps = {
	onEmojiClick: (emojiData: EmojiSelection) => void;
	autoFocusSearch?: boolean;
	lazyLoadEmojis?: boolean;
	searchPlaceholder?: string;
	previewConfig?: {
		showPreview: boolean;
	};
	width?: string | number;
	height?: string | number;
	style?: CSSProperties;
};

const STACKNOTE_BLOCK_CLIPBOARD_MIME = "application/x-stacknote-blocks+json";
const EMOJI_PANEL_MARGIN = 8;
const EMOJI_PANEL_WIDTH = 360;
const EMOJI_PANEL_HEIGHT = 408;
const EmojiPickerClient = dynamic(
	async () => {
			const emojiPickerModule = await import("emoji-picker-react");
			const EmojiPicker = emojiPickerModule.default;

		return function NoteEmojiPicker({
			onEmojiClick,
			autoFocusSearch,
			lazyLoadEmojis,
			searchPlaceholder,
			previewConfig,
			width,
			height,
			style,
		}: NoteEmojiPickerProps) {
			return (
				<EmojiPicker
					onEmojiClick={onEmojiClick}
					theme={emojiPickerModule.Theme.DARK}
					emojiStyle={emojiPickerModule.EmojiStyle.APPLE}
					autoFocusSearch={autoFocusSearch}
					lazyLoadEmojis={lazyLoadEmojis}
					searchPlaceholder={searchPlaceholder}
					previewConfig={previewConfig}
					width={width}
					height={height}
					style={style}
				/>
			);
		};
	},
	{
		ssr: false,
		loading: () => <EmojiPickerSkeleton />,
	},
);

type StackNoteClipboardPayload = {
	version: 1;
	blocks: unknown[];
};

type SerializedClipboardBlocks = {
	json: string;
	html: string;
	plainText: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneBlockForClipboard(block: unknown): unknown {
	if (!isPlainObject(block)) {
		return block;
	}

	const { id: _id, children, ...rest } = block;
	const nextBlock: Record<string, unknown> = { ...rest };

	if (Array.isArray(children)) {
		nextBlock.children = children.map((child) => cloneBlockForClipboard(child));
	}

	return nextBlock;
}

function getClipboardBlocks(editor: any, root: HTMLElement, selectedBlockIds: string[]): unknown[] {
	return getTopLevelSelectedBlockIds(root, selectedBlockIds)
		.map((blockId) => editor.getBlock(blockId))
		.filter((block): block is unknown => Boolean(block))
		.map((block) => cloneBlockForClipboard(block));
}

function serializeSelectedBlocksForClipboard(editor: any, root: HTMLElement, selectedBlockIds: string[]): SerializedClipboardBlocks | null {
	const blocks = getClipboardBlocks(editor, root, selectedBlockIds);
	if (blocks.length === 0) {
		return null;
	}

	const normalizedBlocks = normalizeBlockNoteContent(blocks);
	const payload: StackNoteClipboardPayload = {
		version: 1,
		blocks: Array.isArray(normalizedBlocks) ? normalizedBlocks : blocks,
	};

	let html = "";
	let plainText = "";
	try {
		html = editor.blocksToFullHTML(payload.blocks as any);
	} catch {
		html = "";
	}

	try {
		plainText = editor.blocksToMarkdownLossy(payload.blocks as any);
	} catch {
		plainText = "";
	}

	return {
		json: JSON.stringify(payload),
		html,
		plainText,
	};
}

function readStackNoteClipboardBlocks(value: string): unknown[] | null {
	if (!value) {
		return null;
	}

	try {
		const parsed = JSON.parse(value) as unknown;
		const blocks = Array.isArray(parsed) ? parsed : isPlainObject(parsed) && Array.isArray(parsed.blocks) ? parsed.blocks : null;

		if (!blocks) {
			return null;
		}

		const clonedBlocks = blocks.map((block) => cloneBlockForClipboard(block));
		const normalizedBlocks = normalizeBlockNoteContent(clonedBlocks);
		return Array.isArray(normalizedBlocks) ? normalizedBlocks : clonedBlocks;
	} catch {
		return null;
	}
}

const REPLACE_HIDDEN_BLOCK_TYPES = new Set(["imageMedia", "pdfMedia", "audioMedia"]);
const RENAME_HIDDEN_BLOCK_TYPES = new Set(["imageMedia"]);

function useSelectedFileContext(): SelectedFileContext | null {
	const editor = useBlockNoteEditor<any, any, any>();

	return useEditorState<SelectedFileContext | null>({
		editor,
		on: "selection",
		selector: ({ editor: currentEditor }) => {
			if (!currentEditor || !currentEditor.isEditable) {
				return null;
			}

			const selectedBlocks = currentEditor.getSelection()?.blocks || [currentEditor.getTextCursorPosition().block];
			if (selectedBlocks.length !== 1) {
				return null;
			}

			const block = selectedBlocks[0] as {
				type: string;
				props?: Record<string, unknown>;
			};
			const props = block.props;
			if (!props || typeof props.url !== "string" || props.url.length === 0) {
				return null;
			}

			const fileId = typeof props.fileId === "string" ? props.fileId : "";
			if (!fileId) {
				return null;
			}

			const fileNameFromProps =
				typeof props.name === "string"
					? props.name
					: typeof props.filename === "string"
						? props.filename
						: typeof props.alt === "string"
							? props.alt
							: "download";

			return {
				blockType: block.type,
				fileId,
				fileName: fileNameFromProps,
			};
		},
	});
}

function ConditionalFileReplaceButton() {
	const selectedFile = useSelectedFileContext();

	if (selectedFile && REPLACE_HIDDEN_BLOCK_TYPES.has(selectedFile.blockType)) {
		return null;
	}

	return <FileReplaceButton />;
}

function ConditionalFileRenameButton() {
	const selectedFile = useSelectedFileContext();

	if (selectedFile && RENAME_HIDDEN_BLOCK_TYPES.has(selectedFile.blockType)) {
		return null;
	}

	return <FileRenameButton />;
}

function ImmediateFileDownloadButton() {
	const selectedFile = useSelectedFileContext();
	const Components = useComponentsContext();

	if (!selectedFile || !Components) {
		return null;
	}

	return (
		<Components.FormattingToolbar.Button
			className="bn-button"
			label="Download file"
			mainTooltip="Download file"
			icon={<Download size={18} />}
			onClick={() => {
				const anchor = document.createElement("a");
				anchor.href = `/api/files/${encodeURIComponent(selectedFile.fileId)}?download=1`;
				anchor.download = selectedFile.fileName;
				anchor.rel = "noopener";
				document.body.append(anchor);
				anchor.click();
				anchor.remove();
			}}
		/>
	);
}

function CustomFormattingToolbar() {
	const toolbarItems = useMemo(
		() =>
			getFormattingToolbarItems().map((item) => {
				const key = String(item.key ?? "");

				if (key.includes("replaceFileButton")) {
					return <ConditionalFileReplaceButton key={key} />;
				}

				if (key.includes("fileRenameButton")) {
					return <ConditionalFileRenameButton key={key} />;
				}

				if (key.includes("fileDownloadButton")) {
					return <ImmediateFileDownloadButton key={key} />;
				}

				return item;
			}),
		[],
	);

	return <FormattingToolbar>{toolbarItems}</FormattingToolbar>;
}

function extractUrlTransformParts(blockText: string): UrlTransformParts | null {
	const normalized = blockText.replace(/\r\n?/g, "\n");
	const fullUrlCandidate = sanitizePastedUrl(normalized);
	if (SINGLE_URL_REGEX.test(fullUrlCandidate)) {
		return {
			url: fullUrlCandidate,
			leadingText: "",
			trailingText: "",
		};
	}

	const lines = normalized.split("\n");
	for (let index = lines.length - 1; index >= 0; index -= 1) {
		const line = lines[index] ?? "";
		const trimmedLine = sanitizePastedUrl(line);
		if (!trimmedLine) {
			continue;
		}

		if (!SINGLE_URL_REGEX.test(trimmedLine)) {
			break;
		}

		const leadingText = lines.slice(0, index).join("\n").trim();
		const trailingText = lines
			.slice(index + 1)
			.join("\n")
			.trim();

		return {
			url: trimmedLine,
			leadingText,
			trailingText,
		};
	}

	// Fallback: capture the last URL token when inline content encoding loses expected line boundaries.
	const urlMatches = Array.from(normalized.matchAll(/https?:\/\/[^\s<>"')\]]+/gi));
	const lastMatch = urlMatches[urlMatches.length - 1];
	if (lastMatch?.[0] && typeof lastMatch.index === "number") {
		const url = sanitizePastedUrl(lastMatch[0]);
		if (SINGLE_URL_REGEX.test(url)) {
			const before = normalized.slice(0, lastMatch.index).trim();
			const after = normalized.slice(lastMatch.index + lastMatch[0].length).trim();
			return {
				url,
				leadingText: before,
				trailingText: after,
			};
		}
	}

	return null;
}

function extractTextContent(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}

	if (Array.isArray(value)) {
		return value.map((item) => extractTextContent(item)).join("");
	}

	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		if (record.type === "hardBreak") {
			return "\n";
		}
		if (typeof record.text === "string") {
			return record.text;
		}
		if (record.content !== undefined) {
			return extractTextContent(record.content);
		}
		if (record.children !== undefined) {
			return extractTextContent(record.children);
		}
	}

	return "";
}

function getTrimmedBlockText(block: unknown): string {
	if (!block || typeof block !== "object") {
		return "";
	}

	const current = block as MinimalBlock;
	return extractTextContent(current.content).trim();
}

function getBlockContentType(editor: ReturnType<typeof useCreateBlockNote>, blockType: string): string | undefined {
	const blockSchema = editor.schema.blockSchema as Record<string, { content?: string }>;
	return blockSchema[blockType]?.content;
}

function buildLinkPreviewProps(parts: UrlTransformParts, overrides: Partial<LinkPreviewProps> = {}): LinkPreviewProps {
	return {
		url: parts.url,
		title: overrides.title ?? parts.url,
		description: overrides.description ?? "",
		image: overrides.image ?? "",
		siteName: overrides.siteName ?? "",
		favicon: overrides.favicon ?? "",
		loading: overrides.loading ?? false,
		error: overrides.error ?? "",
	};
}

function buildLinkPreviewReplacementBlocks(parts: UrlTransformParts, props: LinkPreviewProps): PartialEditorBlock[] {
	const replacementBlocks: PartialEditorBlock[] = [];

	if (parts.leadingText) {
		replacementBlocks.push({
			type: "paragraph",
			content: parts.leadingText,
		});
	}

	replacementBlocks.push({
		type: "linkPreview",
		props,
	});

	if (parts.trailingText) {
		replacementBlocks.push({
			type: "paragraph",
			content: parts.trailingText,
		});
	}

	return replacementBlocks;
}

function getClipboardImageFiles(clipboard: DataTransfer): File[] {
	const filesFromClipboard = Array.from(clipboard.files ?? []).filter((file) => file.type.toLowerCase().startsWith("image/"));
	if (filesFromClipboard.length > 0) {
		return filesFromClipboard;
	}

	const imageItems = Array.from(clipboard.items ?? []).filter((item) => item.kind === "file" && item.type.toLowerCase().startsWith("image/"));
	return imageItems
		.map((item, index) => {
			const file = item.getAsFile();
			if (!file) return null;

			const hasName = typeof file.name === "string" && file.name.trim().length > 0;
			if (hasName) return file;

			const extension = file.type.split("/")[1] || "png";
			return new File([file], `pasted-image-${Date.now()}-${index}.${extension}`, { type: file.type || "image/png" });
		})
		.filter((file): file is File => file !== null);
}

function serializeContentForAutosave(content: unknown): string {
	try {
		return JSON.stringify(normalizeBlockNoteContent(content)) ?? "null";
	} catch {
		return "null";
	}
}

interface NoteEditorProps {
	workspaceId: string;
	noteId: string;
	initialContent: unknown;
	onSave: (noteId: string, content: unknown) => Promise<void>;
	onContentChange?: (noteId: string, content: unknown) => void;
}

export interface NoteEditorRef {
	undo: () => void;
	redo: () => void;
	canUndo: () => boolean;
	canRedo: () => boolean;
	appendMarkdownToEnd: (markdown: string) => boolean;
	beginBlockSelection: (clientX: number, clientY: number) => void;
	updateBlockSelection: (clientX: number, clientY: number, source?: "pointer" | "scroll") => void;
	clearBlockSelection: () => void;
	deleteSelectedBlocks: () => boolean;
}

function groupSlashItems(items: readonly DefaultReactSuggestionItem[]): DefaultReactSuggestionItem[] {
	const groupedItems = new Map<string, DefaultReactSuggestionItem[]>();

	for (const item of items) {
		const groupKey = item.group ?? "__ungrouped__";
		const existingGroup = groupedItems.get(groupKey);

		if (existingGroup) {
			existingGroup.push(item);
			continue;
		}

		groupedItems.set(groupKey, [item]);
	}

	return Array.from(groupedItems.values()).flat();
}

function getVerticalBoundaryRect(element: Element | null): DOMRect {
	if (typeof window === "undefined") {
		return new DOMRect(0, 0, 0, 0);
	}

	let current = element instanceof HTMLElement ? element : (element?.parentElement ?? null);

	while (current) {
		const styles = window.getComputedStyle(current);
		const canScrollVertically =
			(styles.overflowY === "auto" || styles.overflowY === "scroll" || styles.overflowY === "overlay") && current.scrollHeight > current.clientHeight;

		if (canScrollVertically) {
			return current.getBoundingClientRect();
		}

		current = current.parentElement;
	}

	return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}

function isTextInputElement(element: EventTarget | null): boolean {
	if (!(element instanceof HTMLElement)) {
		return false;
	}

	return Boolean(element.closest('input, textarea, select, button, a, [contenteditable="true"], .mantine-Menu-dropdown, iframe, audio'));
}

function getBlockElements(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(".bn-block-outer[data-id]"));
}

function getBlockElementById(root: HTMLElement, blockId: string): HTMLElement | null {
	return root.querySelector<HTMLElement>(`.bn-block-outer[data-id="${blockId}"]`);
}

function getOrderedBlockIds(root: HTMLElement): string[] {
	return getBlockElements(root)
		.map((element) => element.dataset.id)
		.filter((id): id is string => Boolean(id));
}

function getBlockSelectionRect(startPoint: Point, currentPoint: Point): DOMRect {
	const left = Math.min(startPoint.x, currentPoint.x);
	const right = Math.max(startPoint.x, currentPoint.x);
	const top = Math.min(startPoint.y, currentPoint.y);
	const bottom = Math.max(startPoint.y, currentPoint.y);

	return new DOMRect(left, top, right - left, bottom - top);
}

function getTopLevelSelectedBlockIds(root: HTMLElement, blockIds: string[]): string[] {
	const selectedBlockIds = Array.from(new Set(blockIds));
	const selectedBlockIdSet = new Set(selectedBlockIds);

	return selectedBlockIds.filter((blockId) => {
		const element = getBlockElementById(root, blockId);
		if (!element) {
			return false;
		}

		let ancestor = element.parentElement?.closest<HTMLElement>(".bn-block-outer[data-id]") ?? null;
		while (ancestor) {
			const ancestorId = ancestor.dataset.id;
			if (ancestorId && selectedBlockIdSet.has(ancestorId)) {
				return false;
			}

			ancestor = ancestor.parentElement?.closest<HTMLElement>(".bn-block-outer[data-id]") ?? null;
		}

		return true;
	});
}

function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
	return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function getBlockIdsIntersectingRect(root: HTMLElement, rect: DOMRect): string[] {
	return getBlockElements(root)
		.filter((element) => rectsIntersect(rect, element.getBoundingClientRect()))
		.map((element) => element.dataset.id)
		.filter((id): id is string => Boolean(id));
}

function getBlockSelectionRange(root: HTMLElement, anchorId: string, endpointId: string): string[] {
	const orderedBlockIds = getOrderedBlockIds(root);
	const anchorIndex = orderedBlockIds.indexOf(anchorId);
	const endpointIndex = orderedBlockIds.indexOf(endpointId);

	if (anchorIndex === -1 || endpointIndex === -1) {
		return [];
	}

	const startIndex = Math.min(anchorIndex, endpointIndex);
	const endIndex = Math.max(anchorIndex, endpointIndex);
	return orderedBlockIds.slice(startIndex, endIndex + 1);
}

function getDropInsertionPosition(root: HTMLElement, clientX: number, clientY: number): BlockInsertPosition | null {
	const blockElements = getBlockElements(root);
	if (blockElements.length === 0) {
		return null;
	}

	let closestBlock: HTMLElement | null = null;
	let closestDistance = Number.POSITIVE_INFINITY;

	for (const element of blockElements) {
		const rect = element.getBoundingClientRect();
		const distance = Math.abs(clientY - (rect.top + rect.height / 2));
		if (distance < closestDistance) {
			closestBlock = element;
			closestDistance = distance;
		}
	}

	if (!closestBlock?.dataset.id) {
		return null;
	}

	const rect = closestBlock.getBoundingClientRect();
	return {
		referenceBlockId: closestBlock.dataset.id,
		placement: clientY < rect.top + rect.height / 2 ? "before" : "after",
	};
}

export const NoteEditor = forwardRef<NoteEditorRef, NoteEditorProps>(({ workspaceId, noteId, initialContent, onSave, onContentChange }, ref) => {
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const editorRootRef = useRef<HTMLDivElement | null>(null);
	const uploadTypeRef = useRef<MediaType>("image");
	const pendingLinkPreviewRef = useRef<Set<string>>(new Set());
	const lastAutosaveSnapshotRef = useRef(serializeContentForAutosave(initialContent));
	const blockSelectionKeyRef = useRef("");
	const blockSelectionStartPointRef = useRef<Point | null>(null);
	const blockSelectionAnchorIdRef = useRef<string | null>(null);
	const emojiPanelRef = useRef<HTMLDivElement | null>(null);
	const [pickerType, setPickerType] = useState<MediaType>("image");
	const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
	const [emojiPanelOpen, setEmojiPanelOpen] = useState(false);
	const [emojiPanelPosition, setEmojiPanelPosition] = useState<EmojiPanelPosition>({
		left: EMOJI_PANEL_MARGIN,
		top: EMOJI_PANEL_MARGIN,
	});

	const editorSchema = useMemo(
		() =>
			BlockNoteSchema.create({
				blockSpecs: {
					...defaultBlockSpecs,
					...customBlockSpecs,
				},
				inlineContentSpecs: {
					...defaultInlineContentSpecs,
					...customInlineContentSpecs,
				},
			}),
		[],
	);

	const safeInitialContent = useMemo(() => getSafeInitialContent(initialContent), [initialContent]);

	const editor = useCreateBlockNote(
		{
			initialContent: safeInitialContent as any,
			pasteHandler: ({ event, defaultPasteHandler }) => {
				const clipboard = event.clipboardData;
				if (!clipboard) {
					return defaultPasteHandler();
				}

				const stackNoteClipboardBlocks = readStackNoteClipboardBlocks(clipboard.getData(STACKNOTE_BLOCK_CLIPBOARD_MIME));
				if (stackNoteClipboardBlocks) {
					if (stackNoteClipboardBlocks.length === 0) {
						return true;
					}

					const cursorBlock = editor.getTextCursorPosition().block;
					if (!cursorBlock) {
						return false;
					}

					editor.insertBlocks(stackNoteClipboardBlocks as any, cursorBlock, "after");
					return true;
				}

				const imageFiles = getClipboardImageFiles(clipboard);
				if (imageFiles.length > 0) {
					void (async () => {
						for (const imageFile of imageFiles) {
							await uploadSingleFile(imageFile, "image");
						}
					})();
					return true;
				}

				const plainText = clipboard.getData("text/plain");
				const html = clipboard.getData("text/html");
				const shouldNormalizeRichHtml =
					Boolean(html) &&
					(html.includes("$") || html.includes("\\(") || html.includes("\\[") || (plainText && shouldPreferPlainTextPaste(plainText)));

				if (shouldNormalizeRichHtml) {
					editor.pasteHTML(transformExternalHtmlForEditor(html));
					return true;
				}

				if (plainText && shouldPreferPlainTextPaste(plainText)) {
					editor.pasteHTML(convertPlainTextToEditorHtml(plainText));
					return true;
				}

				const blockIdBeforePaste = editor.getTextCursorPosition().block.id;
				const shouldAttemptLinkPreview = Boolean(plainText && extractUrlTransformParts(plainText));
				const handled = defaultPasteHandler();

				if (handled !== false && shouldAttemptLinkPreview) {
					window.setTimeout(() => {
						const blockIdAfterPaste = editor.getTextCursorPosition().block.id;
						const candidateBlockIds = Array.from(new Set([blockIdBeforePaste, blockIdAfterPaste]));

						for (const candidateBlockId of candidateBlockIds) {
							void transformUrlBlockToEmbed(candidateBlockId);
						}
					}, 0);
				}

				return handled;
			},
			schema: editorSchema,
		},
		[noteId],
	);

	const debouncedSave = useDebouncedCallback(async (content: unknown, targetNoteId: string) => {
		await onSave(targetNoteId, content);
	}, 1500);

	useEffect(() => {
		const handleCommit = () => {
			const content = editor.document;
			const contentSnapshot = serializeContentForAutosave(content);
			if (contentSnapshot === lastAutosaveSnapshotRef.current) {
				void debouncedSave.flush();
				return;
			}

			lastAutosaveSnapshotRef.current = contentSnapshot;
			onContentChange?.(noteId, content);
			debouncedSave.cancel();
			void onSave(noteId, content);
		};

		window.addEventListener("stacknote:commit-note-content", handleCommit);
		return () => {
			window.removeEventListener("stacknote:commit-note-content", handleCommit);
		};
	}, [debouncedSave, editor, noteId, onContentChange, onSave]);

	const transformUrlBlockToEmbed = useCallback(
		async (blockId: string) => {
			if (pendingLinkPreviewRef.current.has(blockId)) {
				return;
			}

			const currentBlock = editor.getBlock(blockId);
			if (!currentBlock) {
				return;
			}

			const parts = extractUrlTransformParts(getTrimmedBlockText(currentBlock));
			if (!parts) {
				return;
			}

			pendingLinkPreviewRef.current.add(blockId);
			let previewBlockId: string | undefined;
			try {
				const { insertedBlocks } = editor.replaceBlocks(
					[blockId],
					buildLinkPreviewReplacementBlocks(parts, buildLinkPreviewProps(parts, { loading: true })) as any,
				);
				const previewBlock = insertedBlocks.find((block) => block.type === "linkPreview");
				if (!previewBlock) {
					return;
				}
				previewBlockId = previewBlock.id;

				if (typeof navigator !== "undefined" && !navigator.onLine) {
					throw new Error("Cannot fetch link preview while offline");
				}

				const response = await fetch(`/api/link-preview?url=${encodeURIComponent(parts.url)}`);
				if (!response.ok) {
					throw new Error("Failed to fetch link metadata");
				}

				const payload = (await response.json()) as LinkPreviewApiPayload;
				const activePreviewBlock = editor.getBlock(previewBlockId);
				if (!activePreviewBlock || activePreviewBlock.type !== "linkPreview") {
					return;
				}

				editor.updateBlock(previewBlockId, {
					type: "linkPreview",
					props: {
						...buildLinkPreviewProps(parts, {
							title: payload.title ?? parts.url,
							description: payload.description ?? "",
							image: payload.image ?? "",
							siteName: payload.siteName ?? "",
							favicon: payload.favicon ?? "",
							loading: false,
							error: "",
						}),
					},
				} as any);
			} catch {
				if (!previewBlockId) {
					return;
				}

				const currentPreviewBlock = editor.getBlock(previewBlockId);
				if (currentPreviewBlock?.type === "linkPreview") {
					editor.updateBlock(previewBlockId, {
						type: "linkPreview",
						props: {
							...buildLinkPreviewProps(parts, {
								loading: false,
								error: "Could not fetch metadata",
							}),
						},
					} as any);
				}
			} finally {
				pendingLinkPreviewRef.current.delete(blockId);
			}
		},
		[editor],
	);

	useEffect(() => {
		return editor.onChange(() => {
			const content = editor.document;
			const contentSnapshot = serializeContentForAutosave(content);
			if (contentSnapshot === lastAutosaveSnapshotRef.current) {
				return;
			}

			lastAutosaveSnapshotRef.current = contentSnapshot;
			onContentChange?.(noteId, content);
			debouncedSave(content, noteId);
		});
	}, [debouncedSave, editor, noteId, onContentChange]);

	useEffect(() => {
		return () => {
			void debouncedSave.flush();
			debouncedSave.cancel();
		};
	}, [debouncedSave]);

	useEffect(() => {
		const rootElement = editor.domElement;
		if (!rootElement) return;

		const onKeyDown = (event: KeyboardEvent) => {
			const targetNode = event.target instanceof Node ? event.target : null;
			if (!targetNode || !rootElement.contains(targetNode)) {
				return;
			}

			if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) {
				return;
			}

			const currentBlock = editor.getTextCursorPosition().block;
			if (!extractUrlTransformParts(getTrimmedBlockText(currentBlock))) {
				return;
			}

			window.setTimeout(() => {
				void transformUrlBlockToEmbed(currentBlock.id);
			}, 0);
		};

		document.addEventListener("keydown", onKeyDown, true);
		return () => {
			document.removeEventListener("keydown", onKeyDown, true);
		};
	}, [editor, transformUrlBlockToEmbed]);

	const uploadSingleFile = useCallback(
		async (file: File, type: MediaType, insertPosition?: BlockInsertPosition) => {
			const cursorBlock = editor.getTextCursorPosition().block;

			const placeholderBlock =
				type === "image"
					? {
							type: "imageMedia",
							props: {
								url: "",
								fileId: "",
								alt: file.name,
								width: 25,
								caption: "",
								name: file.name,
								uploading: true,
								progress: 10,
								error: "",
							},
						}
					: type === "pdf"
						? {
								type: "pdfMedia",
								props: {
									url: "",
									fileId: "",
									filename: file.name,
									fileSize: "Uploading...",
									uploading: true,
									progress: 10,
									error: "",
								},
							}
						: type === "audio"
							? {
									type: "audioMedia",
									props: {
										url: "",
										fileId: "",
										filename: file.name,
										uploading: true,
										progress: 10,
										error: "",
									},
								}
							: {
									type: "video",
									props: {
										url: "",
										name: file.name,
										showPreview: true,
										caption: "",
									},
								};

			const placeholder = insertPosition
				? editor.insertBlocks([placeholderBlock] as any, insertPosition.referenceBlockId, insertPosition.placement)[0]
				: insertOrUpdateBlockForSlashMenu(editor, placeholderBlock as any);

			let simulated = 10;
			const timer = window.setInterval(() => {
				simulated = Math.min(92, simulated + 6);

				if (type === "image") {
					editor.updateBlock(placeholder.id, {
						type: "imageMedia",
						props: {
							...(placeholder.props as Record<string, unknown>),
							progress: simulated,
						},
					} as any);
					return;
				}

				if (type === "pdf") {
					editor.updateBlock(placeholder.id, {
						type: "pdfMedia",
						props: {
							...(placeholder.props as Record<string, unknown>),
							progress: simulated,
						},
					} as any);
					return;
				}

				if (type === "audio") {
					editor.updateBlock(placeholder.id, {
						type: "audioMedia",
						props: {
							...(placeholder.props as Record<string, unknown>),
							progress: simulated,
						},
					} as any);
				}
			}, 130);

			try {
				const uploaded = await uploadFileForNote(noteId, file, type);

				if (type === "image") {
					editor.replaceBlocks([placeholder.id], [
						{
							type: "imageMedia",
							props: {
								url: uploaded.url,
								fileId: uploaded.fileId,
								alt: uploaded.name,
								width: 25,
								caption: "",
								name: uploaded.name,
								uploading: false,
								progress: 100,
								error: "",
							},
						},
					] as any);
					toast.success("File uploaded");
					return;
				}

				if (type === "pdf") {
					editor.replaceBlocks([placeholder.id], [
						{
							type: "pdfMedia",
							props: {
								url: uploaded.url,
								fileId: uploaded.fileId,
								filename: uploaded.name,
								fileSize: `${Math.max(1, Math.round(uploaded.size / 1024))} KB`,
							},
						},
					] as any);
					toast.success("File uploaded");
					return;
				}

				if (type === "audio") {
					editor.replaceBlocks([placeholder.id], [
						{
							type: "audioMedia",
							props: {
								url: uploaded.url,
								fileId: uploaded.fileId,
								filename: uploaded.name,
							},
						},
					] as any);
					toast.success("File uploaded");
					return;
				}

				editor.replaceBlocks([placeholder.id], [
					{
						type: "video",
						props: {
							url: uploaded.url,
							name: uploaded.name,
							showPreview: true,
							caption: "",
						},
					},
				] as any);
				toast.success("File uploaded");
			} catch (error) {
				editor.replaceBlocks(
					[placeholder.id],
					[
						{
							type: "paragraph",
							content: "Upload failed. Please try again.",
						},
					],
				);
				editor.setTextCursorPosition(cursorBlock.id);
				console.error("Failed to upload file", error);
				toast.error("Upload failed. Please try again.");
			} finally {
				window.clearInterval(timer);
			}
		},
		[editor, noteId],
	);

	const openUploadPicker = useCallback((type: MediaType) => {
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
			fileInputRef.current.accept = getAcceptForType(type);
		}
		uploadTypeRef.current = type;
		setPickerType(type);
		fileInputRef.current?.click();
	}, []);

	const insertVideoEmbed = useCallback(() => {
		const raw = window.prompt("Paste a YouTube, Loom, or Vimeo URL...")?.trim();
		if (!raw) return;

		const transformed = parseVideoEmbedUrl(raw);
		insertOrUpdateBlockForSlashMenu(editor, {
			type: "videoEmbed",
			props: {
				url: raw,
				embedUrl: transformed.embedUrl,
				platform: transformed.platform,
				title: "",
			},
		} as any);
	}, [editor]);

	const insertEquation = useCallback(() => {
		insertOrUpdateBlockForSlashMenu(editor, {
			type: "equation",
			props: {
				latex: "\\int_0^1 x^2 dx",
				displayMode: true,
			},
		} as any);
	}, [editor]);

	const insertCodeBlock = useCallback(() => {
		insertOrUpdateBlockForSlashMenu(editor, {
			type: "codeBlock",
			props: {
				code: "",
				language: "typescript",
				showLineNumbers: true,
				filename: "",
			},
		} as any);
	}, [editor]);

	const insertAIBlock = useCallback(() => {
		insertOrUpdateBlockForSlashMenu(editor, {
			type: "aiBlock",
			props: {
				prompt: "",
				response: "",
				workspaceId,
				sessionId: "",
				noteId,
				model: "openai/gpt-oss-120b",
				status: "idle",
				error: "",
			},
		} as any);
	}, [editor, noteId, workspaceId]);

	const closeEmojiPanel = useCallback(() => {
		setEmojiPanelOpen(false);
	}, []);

	const openEmojiPanel = useCallback(() => {
		const rootElement = editorRootRef.current;
		const defaultPosition: EmojiPanelPosition = {
			left: EMOJI_PANEL_MARGIN,
			top: EMOJI_PANEL_MARGIN,
		};

		if (!rootElement) {
			setEmojiPanelPosition(defaultPosition);
			setEmojiPanelOpen(true);
			return;
		}

		let nextPosition = defaultPosition;
		try {
			const selection = editor.prosemirrorState.selection;
			const cursorCoords = editor.prosemirrorView.coordsAtPos(selection.from);
			const rootRect = rootElement.getBoundingClientRect();
			const panelWidth = Math.min(EMOJI_PANEL_WIDTH, Math.max(0, rootRect.width - EMOJI_PANEL_MARGIN * 2));
			const maxLeft = Math.max(EMOJI_PANEL_MARGIN, rootRect.width - panelWidth - EMOJI_PANEL_MARGIN);
			const maxTop = Math.max(EMOJI_PANEL_MARGIN, rootRect.height - EMOJI_PANEL_HEIGHT - EMOJI_PANEL_MARGIN);

			nextPosition = {
				left: Math.max(EMOJI_PANEL_MARGIN, Math.min(maxLeft, cursorCoords.left - rootRect.left)),
				top: Math.max(EMOJI_PANEL_MARGIN, Math.min(maxTop, cursorCoords.bottom - rootRect.top + EMOJI_PANEL_MARGIN)),
			};
		} catch {
			nextPosition = defaultPosition;
		}

		setEmojiPanelPosition(nextPosition);
		setEmojiPanelOpen(true);
	}, [editor]);

	const handleEmojiPickerClick = useCallback(
		(emojiData: EmojiSelection) => {
			editor.insertInlineContent(emojiData.emoji, { updateSelection: true });
			closeEmojiPanel();
			editor.focus();
		},
		[closeEmojiPanel, editor],
	);

	const openEmojiPanelFromSlash = useCallback(() => {
		insertOrUpdateBlockForSlashMenu(editor, {
			type: "paragraph",
			content: "",
		} as any);

		window.requestAnimationFrame(() => {
			editor.focus();
			openEmojiPanel();
		});
	}, [editor, openEmojiPanel]);

	useEffect(() => {
		if (!emojiPanelOpen) {
			return;
		}

		const handleMouseDown = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) {
				return;
			}

			if (emojiPanelRef.current?.contains(target)) {
				return;
			}

			closeEmojiPanel();
		};

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key !== "Escape") {
				return;
			}

			event.preventDefault();
			closeEmojiPanel();
			editor.focus();
		};

		document.addEventListener("mousedown", handleMouseDown, true);
		document.addEventListener("keydown", handleEscape, true);

		return () => {
			document.removeEventListener("mousedown", handleMouseDown, true);
			document.removeEventListener("keydown", handleEscape, true);
		};
	}, [closeEmojiPanel, editor, emojiPanelOpen]);

	useEffect(() => {
		const rootElement = editor.domElement;
		if (!rootElement) {
			return;
		}

		const onKeyDown = (event: KeyboardEvent) => {
			const targetNode = event.target instanceof Node ? event.target : null;
			if (!targetNode || !rootElement.contains(targetNode)) {
				return;
			}

			if (event.key !== ":" || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) {
				return;
			}

			const selection = editor.prosemirrorState.selection;
			if (!selection.empty) {
				return;
			}

			const currentBlock = editor.getTextCursorPosition().block;
			if (!currentBlock) {
				return;
			}

			const currentBlockType = currentBlock.type as string;
			if (getBlockContentType(editor, currentBlockType) === "none") {
				return;
			}

			event.preventDefault();
			openEmojiPanel();
		};

		document.addEventListener("keydown", onKeyDown, true);
		return () => {
			document.removeEventListener("keydown", onKeyDown, true);
		};
	}, [editor, openEmojiPanel]);

	const mediaSlashItems = useMemo<DefaultReactSuggestionItem[]>(() => {
		return [
			{
				title: "Emoji",
				subtext: "Search and insert an emoji",
				aliases: ["emote", "icon", "smile"],
				icon: <Smile size={16} />,
				group: "Basic blocks",
				onItemClick: openEmojiPanelFromSlash,
			},
			{
				title: "Image",
				subtext: "Upload or embed an image",
				icon: <ImageIcon size={16} />,
				group: "Media",
				onItemClick: () => openUploadPicker("image"),
			},
			{
				title: "PDF",
				subtext: "Attach a PDF document",
				icon: <FileText size={16} />,
				group: "Media",
				onItemClick: () => openUploadPicker("pdf"),
			},
			{
				title: "Audio",
				subtext: "Upload an audio file or recording",
				icon: <Music size={16} />,
				group: "Media",
				onItemClick: () => openUploadPicker("audio"),
			},
			{
				title: "Video",
				subtext: "Embed YouTube, Loom, or Vimeo",
				icon: <Video size={16} />,
				group: "Media",
				onItemClick: insertVideoEmbed,
			},
			{
				title: "Equation",
				subtext: "Insert a KaTeX math equation",
				icon: <Sigma size={16} />,
				group: "Advanced",
				onItemClick: insertEquation,
			},
			{
				title: "Code",
				subtext: "Syntax-highlighted code block",
				icon: <Code size={16} />,
				group: "Advanced",
				onItemClick: insertCodeBlock,
			},
			{
				title: "Ask AI",
				subtext: "Ask AI to generate content",
				icon: <Sparkles size={16} />,
				group: "AI",
				onItemClick: insertAIBlock,
			},
		];
	}, [insertAIBlock, insertCodeBlock, insertEquation, insertVideoEmbed, openEmojiPanelFromSlash, openUploadPicker]);

	const slashItems = useMemo(() => {
		// Remove default "Media" group items so only our custom media upload items appear
		const defaults = getDefaultReactSlashMenuItems(editor).filter(
			(item) => item.title !== "Code Block" && item.group !== "Media" && item.title !== "Emoji",
		);
		// Keep items from the same group contiguous because BlockNote keys group labels by group name.
		return groupSlashItems([...defaults, ...mediaSlashItems]);
	}, [editor, mediaSlashItems]);

	const slashMenuState = useExtensionState(SuggestionMenuExtension, {
		editor,
		selector: (state) => (state?.triggerCharacter === "/" ? state : undefined),
	});

	const slashMenuPlacement = useMemo<"bottom-start" | "top-start">(() => {
		if (typeof window === "undefined" || !slashMenuState?.show) {
			return "bottom-start";
		}

		const referenceRect = slashMenuState.referencePos;
		const boundaryRect = getVerticalBoundaryRect(editor.domElement?.firstElementChild ?? editor.domElement ?? null);
		const padding = 10;
		const gap = 10;
		const spaceAbove = Math.max(0, referenceRect.top - boundaryRect.top - padding - gap);
		const spaceBelow = Math.max(0, boundaryRect.bottom - referenceRect.bottom - padding - gap);

		return spaceAbove > spaceBelow ? "top-start" : "bottom-start";
	}, [editor, slashMenuState]);

	const slashMenuFloatingUIOptions = useMemo(
		() => ({
			useFloatingOptions: {
				strategy: "fixed" as const,
				placement: slashMenuPlacement,
				middleware: [
					offset(10),
					shift({ padding: 10 }),
					size({
						apply({ elements, availableHeight }) {
							elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px`;
						},
						padding: 10,
					}),
				],
			},
			elementProps: {
				onWheelCapture: (event: WheelEvent<HTMLDivElement>) => {
					event.stopPropagation();
				},
				style: {
					overscrollBehavior: "contain",
					zIndex: 70,
				},
			},
		}),
		[slashMenuPlacement],
	);

	const { isDragging, handleDragOver, handleDragLeave, handleDrop } = useFileDrop({
		onDropFiles: async (files, event) => {
			const rootElement = editorRootRef.current;
			const insertPosition = rootElement ? getDropInsertionPosition(rootElement, event.clientX, event.clientY) : null;

			for (const file of files) {
				const type = getMediaTypeFromFile(file);
				if (!type) {
					toast.error("File type not supported");
					continue;
				}
				await uploadSingleFile(file, type, insertPosition ?? undefined);
			}
		},
	});

	const clearBrowserTextSelection = useCallback(() => {
		if (typeof window !== "undefined") {
			window.getSelection()?.removeAllRanges();
		}
	}, []);

	const focusBlockSelection = useCallback(() => {
		if (typeof document === "undefined") {
			return;
		}

		const activeElement = document.activeElement;
		if (activeElement instanceof HTMLElement && activeElement !== editorRootRef.current) {
			activeElement.blur();
		}

		editorRootRef.current?.focus({ preventScroll: true });
	}, []);

	const clearBlockSelection = useCallback(() => {
		blockSelectionStartPointRef.current = null;
		blockSelectionAnchorIdRef.current = null;
		blockSelectionKeyRef.current = "";
		clearBrowserTextSelection();
		setSelectedBlockIds([]);
	}, [clearBrowserTextSelection]);

	const removeSelectedBlocks = useCallback(
		(event?: KeyboardEvent) => {
			if (selectedBlockIds.length === 0) {
				return false;
			}

			event?.preventDefault();
			event?.stopImmediatePropagation();

			const rootElement = editorRootRef.current;
			if (!rootElement) {
				return false;
			}

			const blocksToRemove = getTopLevelSelectedBlockIds(rootElement, selectedBlockIds).filter((id) => Boolean(editor.getBlock(id)));
			if (blocksToRemove.length === 0) {
				clearBlockSelection();
				return false;
			}

			const firstBlock = editor.getBlock(blocksToRemove[0]);
			const lastBlock = editor.getBlock(blocksToRemove[blocksToRemove.length - 1]);
			const isWholeDocumentSelection = blocksToRemove.length === editor.document.length;
			const canUseNativeSelection =
				blocksToRemove.length > 1 &&
				Boolean(firstBlock && lastBlock) &&
				getBlockContentType(editor, firstBlock!.type) !== "none" &&
				getBlockContentType(editor, lastBlock!.type) !== "none";

			if (isWholeDocumentSelection || !canUseNativeSelection) {
				editor.removeBlocks(blocksToRemove);
				clearBlockSelection();
				return true;
			}

			try {
				editor.setSelection(blocksToRemove[0], blocksToRemove[blocksToRemove.length - 1]);
				const tiptapEditor = editor._tiptapEditor as unknown as {
					commands?: {
						deleteSelection?: () => boolean;
					};
					chain?: () => {
						deleteSelection?: () => { run?: () => boolean };
					};
				};
				let deleted = false;
				const deleteSelection = tiptapEditor.commands?.deleteSelection;
				if (typeof deleteSelection === "function") {
					deleted = deleteSelection() !== false;
				} else {
					const chain = tiptapEditor.chain?.();
					const chainedDeleteSelection = chain?.deleteSelection;
					if (typeof chainedDeleteSelection === "function") {
						const result = chainedDeleteSelection.call(chain);
						if (typeof result?.run === "function") {
							deleted = result.run() !== false;
						}
					}
				}
				if (!deleted) {
					editor.removeBlocks(blocksToRemove);
				}
			} catch (err) {
				console.error("Failed to remove selected blocks", err);
				editor.removeBlocks(blocksToRemove);
			}
			clearBlockSelection();
			return true;
		},
		[clearBlockSelection, editor, selectedBlockIds],
	);

	useEffect(() => {
		const rootElement = editorRootRef.current;
		if (!rootElement || selectedBlockIds.length === 0) {
			return;
		}

		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node) || !rootElement.contains(target)) {
				return;
			}

			clearBlockSelection();
		};

		rootElement.addEventListener("pointerdown", handlePointerDown, true);
		return () => {
			rootElement.removeEventListener("pointerdown", handlePointerDown, true);
		};
	}, [clearBlockSelection, selectedBlockIds.length]);

	useEffect(() => {
		const rootElement = editorRootRef.current;
		if (!rootElement || selectedBlockIds.length === 0) {
			return;
		}

		const handleCopy = (event: ClipboardEvent) => {
			const clipboard = event.clipboardData;
			if (!clipboard) {
				return;
			}

			const payload = serializeSelectedBlocksForClipboard(editor, rootElement, selectedBlockIds);
			if (!payload) {
				return;
			}

			clipboard.setData(STACKNOTE_BLOCK_CLIPBOARD_MIME, payload.json);
			clipboard.setData("text/html", payload.html);
			clipboard.setData("text/plain", payload.plainText);
			event.preventDefault();
			event.stopImmediatePropagation();
		};

		const handleCut = (event: ClipboardEvent) => {
			const clipboard = event.clipboardData;
			if (!clipboard) {
				return;
			}

			const payload = serializeSelectedBlocksForClipboard(editor, rootElement, selectedBlockIds);
			if (!payload) {
				return;
			}

			clipboard.setData(STACKNOTE_BLOCK_CLIPBOARD_MIME, payload.json);
			clipboard.setData("text/html", payload.html);
			clipboard.setData("text/plain", payload.plainText);
			event.preventDefault();
			event.stopImmediatePropagation();
			removeSelectedBlocks();
		};

		document.addEventListener("copy", handleCopy, true);
		document.addEventListener("cut", handleCut, true);
		return () => {
			document.removeEventListener("copy", handleCopy, true);
			document.removeEventListener("cut", handleCut, true);
		};
	}, [editor, removeSelectedBlocks, selectedBlockIds]);

	useEffect(() => {
		const rootElement = editorRootRef.current;
		if (!rootElement) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Delete" && event.key !== "Backspace") {
				return;
			}

			if (selectedBlockIds.length > 0) {
				removeSelectedBlocks(event);
				return;
			}

			if (isTextInputElement(event.target)) {
				return;
			}

			const targetNode = event.target instanceof Node ? event.target : null;
			const targetElement = targetNode instanceof Element ? targetNode : null;
			const isEditorOrCanvasTarget =
				!targetElement || targetElement === document.body || targetElement === document.documentElement || rootElement.contains(targetElement);

			if (!isEditorOrCanvasTarget) {
				return;
			}
		};

		document.addEventListener("keydown", handleKeyDown, true);
		return () => {
			document.removeEventListener("keydown", handleKeyDown, true);
		};
	}, [clearBlockSelection, editor, selectedBlockIds]);

	const canRunHistoryCommand = (command: "undo" | "redo") => {
		const tiptapEditor = editor._tiptapEditor as unknown as {
			can?: () => {
				undo?: () => boolean;
				redo?: () => boolean;
				chain?: () => {
					undo?: () => { run?: () => boolean };
					redo?: () => { run?: () => boolean };
					run?: () => boolean;
				};
			};
			state?: {
				plugins?: Array<{
					getState?: (state: unknown) =>
						| {
								done?: { eventCount?: number };
								undone?: { eventCount?: number };
						  }
						| undefined;
				}>;
			};
		};

		const stackName = command === "undo" ? "done" : "undone";
		const historyDepth = tiptapEditor?.state?.plugins
			?.map((plugin) => plugin.getState?.(tiptapEditor.state))
			.find((pluginState) => typeof pluginState?.[stackName]?.eventCount === "number")?.[stackName]?.eventCount;

		if (typeof historyDepth === "number") {
			return historyDepth > 0;
		}

		if (!tiptapEditor?.can) {
			return true;
		}

		const canApi = tiptapEditor.can();
		const directCommand = canApi?.[command];
		if (typeof directCommand === "function") {
			return Boolean(directCommand());
		}

		const chainApi = canApi?.chain?.();
		const chainedCommand = chainApi?.[command];
		if (typeof chainedCommand === "function") {
			const chainResult = chainedCommand.call(chainApi);
			if (typeof chainResult?.run === "function") {
				return Boolean(chainResult.run());
			}
			if (typeof chainApi?.run === "function") {
				return Boolean(chainApi.run());
			}
		}

		return true;
	};

	const applyBlockSelection = useCallback(
		(blockIds: string[]) => {
			const nextSelectionKey = blockIds.join(",");
			if (blockSelectionKeyRef.current === nextSelectionKey) {
				return;
			}

			blockSelectionKeyRef.current = nextSelectionKey;
			clearBrowserTextSelection();
			focusBlockSelection();
			setSelectedBlockIds(blockIds);
		},
		[clearBrowserTextSelection, focusBlockSelection],
	);

	useEffect(() => {
		const rootElement = editorRootRef.current;
		const handleSelectAll = (event: KeyboardEvent) => {
			const isSelectAll = (event.key === "a" || event.key === "A") && (event.ctrlKey || event.metaKey);
			if (!isSelectAll) return;

			const targetNode = event.target instanceof Node ? event.target : null;
			const targetElement = targetNode instanceof Element ? targetNode : null;
			const isEditorOrCanvasTarget =
				!targetElement ||
				targetElement === document.body ||
				targetElement === document.documentElement ||
				(rootElement && rootElement.contains(targetElement));
			if (!isEditorOrCanvasTarget) return;

			if (!rootElement) return;

			event.preventDefault();
			const allBlockIds = getOrderedBlockIds(rootElement);
			if (allBlockIds.length === 0) return;
			applyBlockSelection(allBlockIds);
		};

		document.addEventListener("keydown", handleSelectAll, true);
		return () => document.removeEventListener("keydown", handleSelectAll, true);
	}, [applyBlockSelection]);

	const beginBlockSelection = useCallback(
		(clientX: number, clientY: number) => {
			const rootElement = editorRootRef.current;
			if (!rootElement) {
				return;
			}

			clearBlockSelection();
			blockSelectionStartPointRef.current = { x: clientX, y: clientY };

			const initialSelection = getBlockIdsIntersectingRect(rootElement, new DOMRect(clientX, clientY, 0, 0));
			blockSelectionAnchorIdRef.current = initialSelection[0] ?? null;
			applyBlockSelection(initialSelection);
		},
		[applyBlockSelection, clearBlockSelection],
	);

	const updateBlockSelection = useCallback(
		(clientX: number, clientY: number, source: "pointer" | "scroll" = "pointer") => {
			const rootElement = editorRootRef.current;
			if (!rootElement) {
				return;
			}

			const startPoint = blockSelectionStartPointRef.current ?? { x: clientX, y: clientY };
			if (!blockSelectionStartPointRef.current) {
				blockSelectionStartPointRef.current = startPoint;
			}

			const selectionRect = getBlockSelectionRect(startPoint, { x: clientX, y: clientY });
			const nextSelection = getBlockIdsIntersectingRect(rootElement, selectionRect);
			if (nextSelection.length === 0) {
				applyBlockSelection([]);
				return;
			}

			if (!blockSelectionAnchorIdRef.current) {
				blockSelectionAnchorIdRef.current = clientY >= startPoint.y ? (nextSelection[0] ?? null) : (nextSelection[nextSelection.length - 1] ?? null);
			}

			const anchorId = blockSelectionAnchorIdRef.current;
			if (!anchorId) {
				applyBlockSelection(nextSelection);
				return;
			}

			const endpointId = clientY >= startPoint.y ? nextSelection[nextSelection.length - 1] : nextSelection[0];
			if (!endpointId) {
				applyBlockSelection(nextSelection);
				return;
			}

			applyBlockSelection(getBlockSelectionRange(rootElement, anchorId, endpointId));
		},
		[applyBlockSelection],
	);

	const appendMarkdownToEnd = useCallback(
		(markdown: string) => {
			const trimmed = markdown.trim();
			if (!trimmed) {
				return false;
			}

			let newBlocks = parseRichTextToBlocks(editor, trimmed);
			if (newBlocks.length === 0) {
				newBlocks = [
					{
						type: "paragraph",
						content: trimmed,
					},
				];
			}

			const anchorBlock = editor.document[editor.document.length - 1] ?? editor.getTextCursorPosition().block;
			if (!anchorBlock) {
				return false;
			}

			editor.insertBlocks(newBlocks as any, anchorBlock, "after");
			return true;
		},
		[editor],
	);

	useImperativeHandle(ref, () => ({
		undo: () => editor.undo(),
		redo: () => editor.redo(),
		canUndo: () => canRunHistoryCommand("undo"),
		canRedo: () => canRunHistoryCommand("redo"),
		appendMarkdownToEnd,
		beginBlockSelection,
		updateBlockSelection,
		clearBlockSelection,
		deleteSelectedBlocks: () => removeSelectedBlocks(),
	}));

	return (
		<div
			ref={editorRootRef}
			className="stacknote-editor-root relative mx-auto w-full flex-1"
			tabIndex={-1}
			data-has-block-selection={selectedBlockIds.length > 0 ? "true" : "false"}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}>
			<input
				ref={fileInputRef}
				type="file"
				hidden
				accept={getAcceptForType(pickerType)}
				onChange={async (event) => {
					const file = event.target.files?.[0];
					if (!file) return;

					const expectedType = uploadTypeRef.current;
					const inferred = getMediaTypeFromFile(file);
					if (!inferred || inferred !== expectedType) {
						event.target.value = "";
						toast.error("File type not supported");
						return;
					}

					await uploadSingleFile(file, inferred);
					event.target.value = "";
				}}
			/>

			<BlockNoteView editor={editor} theme="dark" slashMenu={false} emojiPicker={false} formattingToolbar={false} data-theming-css-variables-demo>
				<FormattingToolbarController formattingToolbar={CustomFormattingToolbar} />
				<SuggestionMenuController
					triggerCharacter="/"
					getItems={async (query) => filterSuggestionItems(slashItems, query)}
					floatingUIOptions={slashMenuFloatingUIOptions}
				/>
			</BlockNoteView>

			{emojiPanelOpen && (
				<div
					ref={emojiPanelRef}
					className="absolute z-30 overflow-hidden rounded-[var(--sn-radius-lg)] border dropdown-enter"
					style={{
						left: emojiPanelPosition.left,
						top: emojiPanelPosition.top,
						width: `min(${EMOJI_PANEL_WIDTH}px, calc(100% - ${EMOJI_PANEL_MARGIN * 2}px))`,
						backgroundColor: "var(--bg-hover)",
						borderColor: "var(--border-strong)",
						boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
					}}>
					<div className="border-b px-3 py-2" style={{ borderColor: "var(--border-strong)" }}>
						<div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--text-tertiary)" }}>
							Search emojis
						</div>
					</div>
					<div className="p-2">
						<EmojiPickerClient
							onEmojiClick={handleEmojiPickerClick}
							autoFocusSearch
							lazyLoadEmojis
							searchPlaceholder="Search emojis"
							previewConfig={{ showPreview: false }}
							width="100%"
							height={340}
							style={{ width: "100%", border: 0, boxShadow: "none" }}
						/>
					</div>
				</div>
			)}

			{selectedBlockIds.map((blockId) => {
				const blockElement = editorRootRef.current ? getBlockElementById(editorRootRef.current, blockId) : null;
				if (!blockElement) {
					return null;
				}

				const rootRect = editorRootRef.current?.getBoundingClientRect();
				const blockRect = blockElement.getBoundingClientRect();
				if (!rootRect) {
					return null;
				}

				return (
					<div
						key={blockId}
						className="pointer-events-none absolute z-10 rounded-[5px] border stacknote-selected-block"
						style={{
							left: blockRect.left - rootRect.left - 2,
							top: blockRect.top - rootRect.top + 1,
							width: blockRect.width + 4,
							height: Math.max(0, blockRect.height - 2),
						}}
					/>
				);
			})}

			{isDragging && (
				<div
					className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[var(--sn-radius-lg)] border-2 border-dashed transition-opacity duration-150"
					style={{
						backgroundColor: "rgba(124, 106, 255, 0.08)",
						borderColor: "var(--sn-accent)",
						color: "#c4bcff",
					}}>
					<span className="rounded-[var(--sn-radius-md)] px-3 py-2 text-sm" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
						Drop files to add to your note
					</span>
				</div>
			)}
		</div>
	);
});

NoteEditor.displayName = "NoteEditor";
