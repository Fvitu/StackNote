"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import { Eye, History, RotateCcw } from "lucide-react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { customBlockSpecs } from "@/components/editor/blocks";
import { customInlineContentSpecs } from "@/components/editor/inline";
import { PreviewModeProvider } from "@/components/editor/blocks/PreviewModeContext";
import { normalizeBlockNoteContent } from "@/lib/blocknote-normalize";
import { resolveNoteCoverMeta } from "@/lib/note-cover";
import type { NoteVersionDetail, NoteVersionSummary } from "@/lib/note-versioning";
import "@blocknote/mantine/style.css";

interface NoteVersionsDialogProps {
	open: boolean;
	currentContent: unknown;
	currentTitle: string;
	currentEmoji: string | null;
	currentCoverImage: string | null;
	currentCoverImageMeta: unknown;
	currentVersionId: string | null;
	versions: NoteVersionSummary[];
	loading: boolean;
	previewVersionId: string | null;
	previewVersion: NoteVersionDetail | null;
	previewLoading: boolean;
	restoringVersionId: string | null;
	onClose: () => void;
	onRefresh: () => void;
	onPreview: (versionId: string) => Promise<void>;
	onRestore: (versionId: string) => Promise<void>;
}

function CoverPreview({
	coverImage,
	coverImageMeta,
	showMissingLabel,
}: {
	coverImage: string | null | undefined;
	coverImageMeta: unknown;
	showMissingLabel?: boolean;
}) {
	const coverMeta = resolveNoteCoverMeta(coverImage, coverImageMeta);

	const positionX = coverMeta?.positionX ?? 50;
	const positionY = coverMeta?.positionY ?? 50;

	return (
		<div className="mb-3 overflow-hidden rounded-[var(--sn-radius-md)] border" style={{ borderColor: "var(--border-default)" }}>
			<div className="flex h-32 items-center justify-center" style={{ backgroundColor: "#121212" }}>
				{coverImage ? (
					<img
						src={coverImage}
						alt="Cover preview"
						className="h-full w-full object-cover select-none"
						draggable={false}
						style={{ objectPosition: `${positionX}% ${positionY}%` }}
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center px-3 text-center">
						{showMissingLabel ? (
							<div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
								This version does not contain a cover.
							</div>
						) : null}
					</div>
				)}
			</div>
		</div>
	);
}

function formatVersionTimestamp(value: string) {
	const date = new Date(value);

	if (isToday(date)) {
		return formatDistanceToNowStrict(date, { addSuffix: true });
	}

	if (isYesterday(date)) {
		return `Yesterday at ${format(date, "p")}`;
	}

	return format(date, "MMM d, yyyy 'at' p");
}

function countDifferences(a: unknown, b: unknown): number {
	if (Object.is(a, b)) {
		return 0;
	}

	if (typeof a !== typeof b) {
		return 1;
	}

	if (Array.isArray(a) && Array.isArray(b)) {
		const maxLength = Math.max(a.length, b.length);
		let total = 0;

		for (let index = 0; index < maxLength; index += 1) {
			total += countDifferences(a[index], b[index]);
		}

		return total;
	}

	if (a && b && typeof a === "object" && typeof b === "object") {
		const keys = new Set([...Object.keys(a as Record<string, unknown>), ...Object.keys(b as Record<string, unknown>)]);

		let total = 0;
		for (const key of keys) {
			total += countDifferences((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]);
		}

		return total;
	}

	return 1;
}

function ReadOnlyPreview({ content }: { content: unknown }) {
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
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			initialContent: (Array.isArray(normalizeBlockNoteContent(content)) ? normalizeBlockNoteContent(content) : undefined) as any,
			schema: editorSchema,
		},
		[content],
	);

	return (
		<PreviewModeProvider value={true}>
			<div className="h-full min-h-0 pointer-events-none select-none">
				<BlockNoteView
					editor={editor}
					theme="dark"
					slashMenu={false}
					sideMenu={false}
					editable={false}
					formattingToolbar={false}
					filePanel={false}
					tableHandles={false}
					className="h-full"
				/>
			</div>
		</PreviewModeProvider>
	);
}

export function NoteVersionsDialog({
	open,
	currentContent,
	currentTitle,
	currentEmoji,
	currentCoverImage,
	currentCoverImageMeta,
	currentVersionId,
	versions,
	loading,
	previewVersionId,
	previewVersion,
	previewLoading,
	restoringVersionId,
	onClose,
	onRefresh,
	onPreview,
	onRestore,
}: NoteVersionsDialogProps) {
	const currentScrollRef = useRef<HTMLDivElement | null>(null);
	const selectedScrollRef = useRef<HTMLDivElement | null>(null);
	const scrollSyncRef = useRef<"current" | "selected" | null>(null);
	const [showVersionsPanel, setShowVersionsPanel] = useState(true);

	useEffect(() => {
		if (open) {
			setShowVersionsPanel(previewVersionId ? false : true);
		}
	}, [open, previewVersionId]);

	const selectedDiffCount = useMemo(() => {
		if (!previewVersion) {
			return 0;
		}

		return countDifferences(
			{
				content: currentContent,
				title: currentTitle ?? null,
				emoji: currentEmoji ?? null,
			},
			{
				content: previewVersion.content,
				title: previewVersion.title ?? null,
				emoji: previewVersion.emoji ?? null,
			},
		);
	}, [currentContent, currentEmoji, currentTitle, previewVersion]);

	const syncScroll = (source: "current" | "selected") => {
		const sourceElement = source === "current" ? currentScrollRef.current : selectedScrollRef.current;
		const targetElement = source === "current" ? selectedScrollRef.current : currentScrollRef.current;

		if (!sourceElement || !targetElement) {
			return;
		}

		scrollSyncRef.current = source;
		targetElement.scrollTop = sourceElement.scrollTop;
		targetElement.scrollLeft = sourceElement.scrollLeft;

		requestAnimationFrame(() => {
			if (scrollSyncRef.current === source) {
				scrollSyncRef.current = null;
			}
		});
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) {
					onClose();
				}
			}}>
			<DialogContent
				showCloseButton={false}
				className="!top-1/2 !left-1/2 !h-[min(92vh,860px)] !max-h-[92vh] !w-[calc(100vw-1.5rem)] !max-w-[min(1600px,96vw)] !-translate-x-1/2 !-translate-y-1/2 overflow-hidden p-0">
				<div className="flex h-full min-h-0 flex-col" style={{ backgroundColor: "var(--bg-surface)", borderRadius: "15px" }}>
					<DialogHeader className="border-b px-5 py-4" style={{ borderColor: "var(--border-default)" }}>
						<DialogTitle className="flex items-center gap-2 text-base">
							<History className="h-4 w-4" />
							Version History
						</DialogTitle>
						<DialogDescription>Review meaningful checkpoints, compare them with your current content, and restore any version.</DialogDescription>
					</DialogHeader>

					<div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[360px_minmax(0,1fr)]">
					<div
							className={`flex min-h-0 flex-col overflow-hidden border-b md:border-r md:border-b-0 ${showVersionsPanel ? "" : "hidden md:flex"}`}
							style={{ borderColor: "var(--border-default)" }}>
							<div
								className="flex items-center justify-between gap-2 border-b px-3 py-2 text-xs"
								style={{ borderColor: "var(--border-default)", color: "var(--text-tertiary)" }}>
								<span>{loading ? "Loading checkpoints..." : `${versions.length} checkpoints`}</span>
								<Button variant="outline" className="h-7 px-2 text-xs md:hidden" onClick={() => setShowVersionsPanel(false)}>
									View Preview
								</Button>
							</div>

							<div className="min-h-0 flex-1 overflow-y-auto p-2">
								{loading ? (
									<div className="px-2 py-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
										Loading version history...
									</div>
								) : versions.length === 0 ? (
									<div className="px-2 py-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
										No checkpoints yet.
									</div>
								) : (
									versions.map((version) => {
										const isActive = previewVersionId === version.id;
										const isCurrent = currentVersionId === version.id;
										const handlePreview = () => {
											void onPreview(version.id);
											setShowVersionsPanel(false);
										};

										return (
											<div
												key={version.id}
												role="button"
												tabIndex={0}
												aria-pressed={isActive}
												onClick={handlePreview}
												onKeyDown={(event) => {
													if (event.key === "Enter" || event.key === " ") {
														event.preventDefault();
														handlePreview();
													}
												}}
												className="group/version-item mb-2 cursor-pointer rounded-[var(--sn-radius-md)] border px-3 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_22px_rgba(0,0,0,0.25)]"
												style={{
													borderColor: isActive ? "var(--border-strong)" : "var(--border-default)",
													backgroundColor: isActive ? "var(--bg-active)" : "transparent",
												}}>
												<div className="flex flex-wrap items-center gap-2">
													<span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
														{formatVersionTimestamp(version.createdAt)}
													</span>
													{version.manual && (
														<span
															className="rounded-full px-2 py-0.5 text-[11px]"
															style={{
																backgroundColor: "var(--accent-muted)",
																color: "var(--sn-accent)",
															}}>
															Manual checkpoint
														</span>
													)}
													{isCurrent && (
														<span className="rounded-full border border-emerald-300/50 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-200">
															Current
														</span>
													)}
												</div>

												<div className="mt-1 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
													{format(new Date(version.createdAt), "PPP 'at' p")}
												</div>

												{version.label && (
													<div className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
														{version.label}
													</div>
												)}

												<div className="mt-3 flex flex-wrap items-center gap-2">
													<span
														className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-200"
														style={{
															borderColor: isActive ? "rgba(124, 106, 255, 0.55)" : "var(--border-default)",
															backgroundColor: isActive ? "rgba(124, 106, 255, 0.14)" : "rgba(255,255,255,0.04)",
															color: isActive ? "#d5cbff" : "var(--text-secondary)",
														}}>
														<Eye className="h-3.5 w-3.5" />
														{previewLoading && previewVersionId === version.id ? "Loading preview..." : "Click to preview"}
													</span>
													<Button
														className="h-7 gap-1 px-2 text-xs"
														style={{ backgroundColor: "var(--sn-accent)", color: "white" }}
														disabled={restoringVersionId === version.id}
														onClick={() => void onRestore(version.id)}>
														<RotateCcw className="h-3.5 w-3.5" />
														{restoringVersionId === version.id ? "Restoring..." : "Restore"}
													</Button>
												</div>
											</div>
										);
									})
								)}
							</div>
						</div>

						<div className={`flex h-full min-h-0 min-w-0 flex-col ${showVersionsPanel ? "hidden md:flex" : ""}`}>
							<div
								className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2"
								style={{ borderColor: "var(--border-default)" }}>
								<div className="min-w-0">
									<div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
										{previewLoading
											? "Loading preview..."
											: previewVersion
												? selectedDiffCount === 0
													? "No detected differences from current content"
													: `${selectedDiffCount} detected changes vs current content`
												: "Preview a checkpoint to compare it with your current note"}
									</div>
									{previewVersion && (previewVersion.manual || previewVersion.label) && (
										<div className="mt-1 flex flex-wrap items-center gap-2">
											{previewVersion.manual && (
												<span
													className="rounded-full px-2 py-0.5 text-[11px]"
													style={{
														backgroundColor: "rgba(124, 106, 255, 0.12)",
														color: "#c5b8ff",
													}}>
													Manual checkpoint
												</span>
											)}
											{previewVersion.label && (
												<span className="truncate text-xs" style={{ color: "var(--text-secondary)" }}>
													{previewVersion.label}
												</span>
											)}
										</div>
									)}
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<Button variant="outline" onClick={() => setShowVersionsPanel(true)} className="h-7 px-2 text-xs md:hidden">
										Checkpoints
									</Button>
									<Button variant="outline" onClick={onRefresh} className="h-7 px-2 text-xs">
										Refresh
									</Button>
									<Button variant="outline" onClick={onClose} className="h-7 px-2 text-xs">
										Close
									</Button>
								</div>
							</div>

							<div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
								<div
									className="flex min-h-0 min-w-0 flex-col border-b md:border-r md:border-b-0"
									style={{ borderColor: "var(--border-default)" }}>
									<div
										className="border-b px-3 py-1.5 text-xs"
										style={{ borderColor: "var(--border-default)", color: "var(--text-tertiary)" }}>
										Current content
									</div>
									<div
										ref={currentScrollRef}
										onScroll={() => {
											if (scrollSyncRef.current === "selected") {
												return;
											}

											syncScroll("current");
										}}
										className="min-h-0 flex-1 overflow-y-auto bg-[#0b0b0b] p-3"
										style={{ maxWidth: "100%" }}>
										<div
											className="mb-3 flex items-center gap-2 rounded-[var(--sn-radius-md)] border px-3 py-2"
											style={{ borderColor: "var(--border-default)", backgroundColor: "rgba(255,255,255,0.03)" }}>
											<span className="text-base leading-none">{currentEmoji ?? "📝"}</span>
											<span className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
												{currentTitle || "Untitled"}
											</span>
										</div>
										<CoverPreview coverImage={currentCoverImage} coverImageMeta={currentCoverImageMeta} showMissingLabel={true} />
										<ReadOnlyPreview content={currentContent} />
									</div>
								</div>

								<div className="flex min-h-0 min-w-0 flex-col">
									<div
										className="border-b px-3 py-1.5 text-xs"
										style={{ borderColor: "var(--border-default)", color: "var(--text-tertiary)" }}>
										{previewVersion ? formatVersionTimestamp(previewVersion.createdAt) : "Selected checkpoint"}
									</div>
									<div
										ref={selectedScrollRef}
										onScroll={() => {
											if (scrollSyncRef.current === "current") {
												return;
											}

											syncScroll("selected");
										}}
										className="min-h-0 flex-1 overflow-y-auto bg-[#0b0b0b] p-3"
										style={{ maxWidth: "100%" }}>
										{previewLoading ? (
											<div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
												Loading preview...
											</div>
										) : previewVersion ? (
											<>
												<div
													className="mb-3 flex items-center gap-2 rounded-[var(--sn-radius-md)] border px-3 py-2"
													style={{ borderColor: "var(--border-default)", backgroundColor: "rgba(255,255,255,0.03)" }}>
													<span className="text-base leading-none">{previewVersion.emoji ?? "📝"}</span>
													<span className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
														{previewVersion.title || "Untitled"}
													</span>
												</div>
												<CoverPreview
													coverImage={previewVersion.coverImage}
													coverImageMeta={previewVersion.coverImageMeta}
													showMissingLabel={true}
												/>
												<ReadOnlyPreview content={previewVersion.content} />
											</>
										) : (
											<div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
												Preview a checkpoint to inspect it here.
											</div>
										)}
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
