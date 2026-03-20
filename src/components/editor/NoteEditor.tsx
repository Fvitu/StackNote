"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, forwardRef, useImperativeHandle, useMemo, useRef, useState, type WheelEvent } from "react";
import { useCreateBlockNote, SuggestionMenuController, getDefaultReactSlashMenuItems, useExtensionState } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu, SuggestionMenu as SuggestionMenuExtension } from "@blocknote/core/extensions";
import { offset, shift, size } from "@floating-ui/react";
import type { DefaultReactSuggestionItem } from "@blocknote/react";
import { ImageIcon, FileText, Music, Video, Sigma, Code } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";
import { customBlockSpecs } from "@/components/editor/blocks";
import { customInlineContentSpecs } from "@/components/editor/inline";
import { getAcceptForType, getMediaTypeFromFile, parseVideoEmbedUrl, type MediaType } from "@/lib/media";
import { uploadFileForNote } from "@/lib/upload";
import { useFileDrop } from "@/hooks/useFileDrop";
import { normalizeBlockNoteContent } from "@/lib/blocknote-normalize";

const SINGLE_URL_REGEX = /^https?:\/\/[^\s]+$/i;

type MinimalBlock = {
	id: string;
	content?: unknown;
	children?: unknown;
};

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

function getBlockText(block: unknown): string {
	if (!block || typeof block !== "object") {
		return "";
	}

	const current = block as MinimalBlock;
	return extractTextContent(current.content).trim();
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

interface NoteEditorProps {
	noteId: string;
	initialContent: unknown;
	onSave: (content: unknown) => Promise<void>;
	onContentChange?: (content: unknown) => void;
}

export interface NoteEditorRef {
	undo: () => void;
	redo: () => void;
	canUndo: () => boolean;
	canRedo: () => boolean;
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

export const NoteEditor = forwardRef<NoteEditorRef, NoteEditorProps>(({ noteId, initialContent, onSave, onContentChange }, ref) => {
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const uploadTypeRef = useRef<MediaType>("image");
	const pendingLinkPreviewRef = useRef<Set<string>>(new Set());
	const [pickerType, setPickerType] = useState<MediaType>("image");

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

	const editor = useCreateBlockNote(
		{
			initialContent: (Array.isArray(normalizeBlockNoteContent(initialContent)) ? normalizeBlockNoteContent(initialContent) : undefined) as any,
			pasteHandler: ({ event, defaultPasteHandler }) => {
				const clipboard = event.clipboardData;
				if (!clipboard) {
					return defaultPasteHandler();
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

				const blockIdBeforePaste = editor.getTextCursorPosition().block.id;
				const plainText = clipboard.getData("text/plain");
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

	const debouncedSave = useDebouncedCallback(async (content: unknown) => {
		await onSave(content);
	}, 1500);

	const transformUrlBlockToEmbed = useCallback(
		async (blockId: string) => {
			if (pendingLinkPreviewRef.current.has(blockId)) {
				return;
			}

			const currentBlock = editor.getBlock(blockId);
			if (!currentBlock) {
				return;
			}

			const parts = extractUrlTransformParts(getBlockText(currentBlock));
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
			onContentChange?.(content);
			debouncedSave(content);
		});
	}, [debouncedSave, editor, onContentChange]);

	useEffect(() => {
		return () => {
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
			if (!extractUrlTransformParts(getBlockText(currentBlock))) {
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
		async (file: File, type: MediaType) => {
			const cursorBlock = editor.getTextCursorPosition().block;

			const placeholder =
				type === "image"
					? insertOrUpdateBlockForSlashMenu(editor, {
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
						} as any)
					: type === "pdf"
						? insertOrUpdateBlockForSlashMenu(editor, {
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
							} as any)
						: type === "audio"
							? insertOrUpdateBlockForSlashMenu(editor, {
									type: "audioMedia",
									props: {
										url: "",
										fileId: "",
										filename: file.name,
										uploading: true,
										progress: 10,
										error: "",
									},
								} as any)
							: insertOrUpdateBlockForSlashMenu(editor, {
									type: "video",
									props: {
										url: "",
										name: file.name,
										showPreview: true,
										caption: "",
									},
								});

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
			} catch (error) {
				editor.replaceBlocks(
					[placeholder.id],
					[
						{
							type: "paragraph",
							content: `Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				);
				editor.setTextCursorPosition(cursorBlock.id);
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

	const mediaSlashItems = useMemo<DefaultReactSuggestionItem[]>(() => {
		return [
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
		];
	}, [insertCodeBlock, insertEquation, insertVideoEmbed, openUploadPicker]);

	const slashItems = useMemo(() => {
		// Remove default "Media" group items so only our custom media upload items appear
		const defaults = getDefaultReactSlashMenuItems(editor).filter((item) => item.title !== "Code Block" && item.group !== "Media");
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
		onDropFiles: async (files) => {
			for (const file of files) {
				const type = getMediaTypeFromFile(file);
				if (!type) continue;
				await uploadSingleFile(file, type);
			}
		},
	});

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

		if (!tiptapEditor?.can) return true;
		const canApi = tiptapEditor.can();

		const direct = canApi?.[command];
		if (typeof direct === "function") {
			return Boolean(direct());
		}

		const chainApi = canApi?.chain?.();
		const chained = chainApi?.[command];
		if (typeof chained === "function") {
			const chainResult = chained.call(chainApi);
			if (typeof chainResult?.run === "function") {
				return Boolean(chainResult.run());
			}
			if (typeof chainApi?.run === "function") {
				return Boolean(chainApi.run());
			}
		}

		// If command availability cannot be determined reliably, keep controls enabled.
		return true;
	};

	useImperativeHandle(ref, () => ({
		undo: () => editor.undo(),
		redo: () => editor.redo(),
		canUndo: () => canRunHistoryCommand("undo"),
		canRedo: () => canRunHistoryCommand("redo"),
	}));

	return (
		<div className="relative mx-auto w-full flex-1" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
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
						return;
					}

					await uploadSingleFile(file, inferred);
					event.target.value = "";
				}}
			/>

			<BlockNoteView editor={editor} theme="dark" slashMenu={false} data-theming-css-variables-demo>
				<SuggestionMenuController
					triggerCharacter="/"
					getItems={async (query) => filterSuggestionItems(slashItems, query)}
					floatingUIOptions={slashMenuFloatingUIOptions}
				/>
			</BlockNoteView>

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
