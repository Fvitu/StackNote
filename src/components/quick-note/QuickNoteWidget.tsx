"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { en } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import "@blocknote/mantine/style.css";
import { ArrowDown, FilePenLine, MoveDiagonal2, Trash2 } from "lucide-react";

import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useQuickNote } from "@/hooks/useQuickNote";

const QUICK_NOTE_MIN_WIDTH = 260;
const QUICK_NOTE_MIN_HEIGHT = 320;
const QUICK_NOTE_MAX_WIDTH = 760;
const QUICK_NOTE_MAX_HEIGHT = 820;
const QUICK_NOTE_VIEWPORT_MARGIN = 48;
const QUICK_NOTE_COLLAPSED_WIDTH = 190;
const QUICK_NOTE_TRANSITION = "280ms cubic-bezier(0.22, 1, 0.36, 1)";
const QUICK_NOTE_RIGHT_MARGIN = 24;
const QUICK_NOTE_PANEL_GAP = 24;

type ResizeMode = "left" | "top" | "corner";

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function getQuickNoteMaxSize() {
	if (typeof window === "undefined") {
		return {
			width: QUICK_NOTE_MAX_WIDTH,
			height: QUICK_NOTE_MAX_HEIGHT,
		};
	}

	return {
		width: Math.max(QUICK_NOTE_MIN_WIDTH, Math.min(QUICK_NOTE_MAX_WIDTH, window.innerWidth - QUICK_NOTE_VIEWPORT_MARGIN)),
		height: Math.max(QUICK_NOTE_MIN_HEIGHT, Math.min(QUICK_NOTE_MAX_HEIGHT, window.innerHeight - QUICK_NOTE_VIEWPORT_MARGIN)),
	};
}

const quickNoteSchema = BlockNoteSchema.create({
	blockSpecs: {
		paragraph: defaultBlockSpecs.paragraph,
		heading: defaultBlockSpecs.heading,
		bulletListItem: defaultBlockSpecs.bulletListItem,
		numberedListItem: defaultBlockSpecs.numberedListItem,
		checkListItem: defaultBlockSpecs.checkListItem,
	},
	inlineContentSpecs: defaultInlineContentSpecs,
});

function normalizeContent(content: unknown) {
	return Array.isArray(content) && content.length > 0 ? content : [{ type: "paragraph", content: [] }];
}

function QuickNoteEditor({ initialContent, onChange }: { initialContent: unknown; onChange: (nextContent: unknown) => void }) {
	const editor = useCreateBlockNote({
		schema: quickNoteSchema,
		initialContent: normalizeContent(initialContent),
		dictionary: {
			...en,
			placeholders: {
				...en.placeholders,
				default: "Enter text",
				emptyDocument: "Enter text",
			},
		},
	});

	return (
		<div className="stacknote-editor-root h-full min-h-0 w-full">
			<BlockNoteView
				editor={editor}
				theme="dark"
				slashMenu={false}
				sideMenu={false}
				emojiPicker={false}
				formattingToolbar={false}
				filePanel={false}
				tableHandles={false}
				className="h-full"
				data-theming-css-variables-demo
				onChange={() => onChange(editor.document)}
			/>
		</div>
	);
}

export function QuickNoteWidget({ userId }: { userId: string }) {
	const [isExpanded, setIsExpanded] = useState(false);
	const [size, setSize] = useState({ width: 300, height: 420 });
	const [viewportWidth, setViewportWidth] = useState(0);
	const [resetToken, setResetToken] = useState(0);
	const resizeStateRef = useRef<{ mode: ResizeMode; startX: number; startY: number; width: number; height: number } | null>(null);
	const isCompactMobile = viewportWidth > 0 && viewportWidth < 768;
	const { content, isLoaded, isOffline, isSyncing, setContent, clear } = useQuickNote(userId);
	const {
		state: { aiPanelWidth, isAiPanelOpen },
	} = useWorkspace();
	const stableContent = useMemo(() => normalizeContent(content), [content]);

	useEffect(() => {
		const updateViewportWidth = () => {
			setViewportWidth(window.innerWidth);
		};

		updateViewportWidth();
		window.addEventListener("resize", updateViewportWidth);

		return () => {
			window.removeEventListener("resize", updateViewportWidth);
		};
	}, []);

	useEffect(() => {
		const handlePointerMove = (event: PointerEvent) => {
			const resizeState = resizeStateRef.current;
			if (!resizeState) {
				return;
			}

			const maxSize = getQuickNoteMaxSize();
			const deltaX = resizeState.startX - event.clientX;
			const deltaY = resizeState.startY - event.clientY;

			setSize({
				width:
					resizeState.mode === "left" || resizeState.mode === "corner"
						? clamp(resizeState.width + deltaX, QUICK_NOTE_MIN_WIDTH, maxSize.width)
						: resizeState.width,
				height:
					resizeState.mode === "top" || resizeState.mode === "corner"
						? clamp(resizeState.height + deltaY, QUICK_NOTE_MIN_HEIGHT, maxSize.height)
						: resizeState.height,
			});
		};

		const handlePointerUp = () => {
			resizeStateRef.current = null;
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);

		return () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
		};
	}, []);

	useEffect(() => {
		const clampSizeToViewport = () => {
			const maxSize = getQuickNoteMaxSize();
			setSize((previous) => ({
				width: clamp(previous.width, QUICK_NOTE_MIN_WIDTH, maxSize.width),
				height: clamp(previous.height, QUICK_NOTE_MIN_HEIGHT, maxSize.height),
			}));
		};

		clampSizeToViewport();
		window.addEventListener("resize", clampSizeToViewport);

		return () => {
			window.removeEventListener("resize", clampSizeToViewport);
		};
	}, []);

	const desiredRightOffset = isAiPanelOpen ? aiPanelWidth + QUICK_NOTE_RIGHT_MARGIN + QUICK_NOTE_PANEL_GAP : QUICK_NOTE_RIGHT_MARGIN;
	const maxRightOffset = viewportWidth > 0 ? Math.max(QUICK_NOTE_RIGHT_MARGIN, viewportWidth - size.width - QUICK_NOTE_RIGHT_MARGIN) : desiredRightOffset;
	const rightOffset = Math.min(desiredRightOffset, maxRightOffset);

	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!isExpanded) return;

		const handleClickOutside = (event: MouseEvent) => {
			if (resizeStateRef.current) return;
			if (document.querySelector(".mantine-Menu-dropdown")?.contains(event.target as Node)) return;
			if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
				setIsExpanded(false);
			}
		};

		const timer = setTimeout(() => {
			window.addEventListener("mousedown", handleClickOutside);
		}, 100);

		return () => {
			clearTimeout(timer);
			window.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isExpanded]);

	const startResize = (mode: ResizeMode, event: React.PointerEvent<HTMLDivElement>) => {
		event.preventDefault();

		resizeStateRef.current = {
			mode,
			startX: event.clientX,
			startY: event.clientY,
			width: size.width,
			height: size.height,
		};
	};

	return (
		<div
			ref={containerRef}
			className="fixed bottom-6 z-[40]"
			style={{
				right: rightOffset,
				width: Math.max(size.width, QUICK_NOTE_COLLAPSED_WIDTH),
				transition: "right 180ms cubic-bezier(0.22, 1, 0.36, 1), width 180ms cubic-bezier(0.22, 1, 0.36, 1)",
				willChange: "right, width",
			}}>
			<div
				className="absolute bottom-0 right-0 transition-[opacity,transform]"
				style={{
					opacity: isExpanded ? 0 : 1,
					transform: isExpanded ? "translateY(8px) scale(0.98)" : "translateY(0) scale(1)",
					transition: `opacity ${QUICK_NOTE_TRANSITION}, transform ${QUICK_NOTE_TRANSITION}`,
					pointerEvents: isExpanded ? "none" : "auto",
				}}>
				<button
					type="button"
					onClick={() => setIsExpanded(true)}
					className={`flex h-11 items-center rounded-full border text-sm shadow-[0_12px_30px_rgba(0,0,0,0.35)] transition-[transform,colors] duration-200 hover:-translate-y-0.5 ${isCompactMobile ? "w-11 justify-center px-0" : "w-[160px] justify-between px-4"}`}
					style={{
						backgroundColor: "rgba(10, 10, 10, 0.92)",
						backdropFilter: "blur(8px)",
						borderColor: "rgba(255, 255, 255, 0.1)",
					}}>
					<span className={`inline-flex items-center font-medium ${isCompactMobile ? "gap-0" : "gap-2"}`} style={{ color: "var(--text-primary)" }}>
						<FilePenLine className="h-4 w-4" style={{ color: "var(--sn-accent)" }} />
						{!isCompactMobile && "Quick note"}
					</span>
					{!isCompactMobile && <span style={{ color: "var(--text-tertiary)" }}>↑</span>}
				</button>
			</div>

			<div
				className="absolute bottom-0 right-0 overflow-visible transition-[opacity,transform,max-height]"
				style={{
					opacity: isExpanded ? 1 : 0,
					transform: isExpanded ? "translateY(0) scale(1)" : "translateY(12px) scale(0.985)",
					maxHeight: isExpanded ? 920 : 0,
					transition: `opacity ${QUICK_NOTE_TRANSITION}, transform ${QUICK_NOTE_TRANSITION}, max-height ${QUICK_NOTE_TRANSITION}`,
					pointerEvents: isExpanded ? "auto" : "none",
				}}>
				<div
					className="relative overflow-hidden rounded-[24px] border shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
					style={{
						width: size.width,
						height: size.height,
						backgroundColor: "rgba(10, 10, 10, 0.94)",
						borderColor: "var(--border-default)",
						backdropFilter: "blur(14px)",
					}}>
					<div
						className="flex h-11 items-center justify-between border-b pl-12 pr-4"
						style={{ borderColor: "rgba(255,255,255,0.06)", borderBottom: "none" }}>
						<div className="flex items-center gap-2">
							<span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
								Quick note
							</span>
							{isOffline ? (
								<span
									className="inline-flex h-2.5 w-2.5 rounded-full"
									style={{ backgroundColor: "#f59e0b" }}
									title="Changes saved locally — will sync when online"
								/>
							) : null}
							{isSyncing ? (
								<span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
									Syncing…
								</span>
							) : null}
						</div>
						<div className="flex items-center gap-1">
							<button
								type="button"
								onClick={() => setIsExpanded(false)}
								className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-[rgba(255,255,255,0.08)]"
								aria-label="Close quick note">
								<ArrowDown className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
							</button>
							<button
								type="button"
								onClick={() => {
									clear();
									setResetToken((token) => token + 1);
								}}
								className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-[rgba(255,255,255,0.08)]"
								aria-label="Clear quick note">
								<Trash2 className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
							</button>
						</div>
					</div>

					<div className="h-[calc(100%-44px)] overflow-hidden" style={{ backgroundColor: "transparent" }}>
						{isLoaded ? (
							<QuickNoteEditor key={resetToken} initialContent={stableContent} onChange={setContent} />
						) : (
							<div className="flex h-full items-center justify-center text-sm" style={{ color: "var(--text-secondary)" }}>
								Loading quick note…
							</div>
						)}
					</div>

					<div onPointerDown={(event) => startResize("top", event)} className="absolute left-11 right-4 top-0 h-2 cursor-ns-resize touch-none" />
					<div onPointerDown={(event) => startResize("left", event)} className="absolute bottom-4 left-0 top-11 w-2 cursor-ew-resize touch-none" />
					<div
						onPointerDown={(event) => startResize("corner", event)}
						className="absolute left-0 top-0 flex h-8 w-9 cursor-nwse-resize items-center justify-center rounded-br-2xl rounded-tl-[24px] border-b border-r touch-none transition-colors hover:bg-[rgba(255,255,255,0.06)]"
						style={{
							borderColor: "rgba(255,255,255,0.06)",
							color: "var(--text-secondary)",
						}}
						title="Resize from top-left corner">
						<MoveDiagonal2 className="pointer-events-none h-4 w-4 opacity-75" />
					</div>
				</div>
			</div>
		</div>
	);
}
