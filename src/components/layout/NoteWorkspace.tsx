"use client";

import dynamic from "next/dynamic";
import { lazy, Suspense, useState, useEffect, useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { FileText, PanelLeftOpen, Undo2, Redo2, CalendarClock, Clock3, History, Sparkles, Brain } from "lucide-react";
import { toast } from "sonner";
import { AIPanelSkeleton } from "@/components/ai/AIPanelSkeleton";
import { LazyNoteEditor } from "@/components/editor/LazyNoteEditor";
import type { NoteEditorRef } from "@/components/editor/NoteEditor";
import { NoteTitle } from "@/components/editor/NoteTitle";
import { SaveIndicator } from "@/components/editor/SaveIndicator";
import { EditorSkeleton, EmojiPickerSkeleton, LoadingContentSkeleton } from "@/components/layout/AppShellSkeleton";
import { Breadcrumb, type BreadcrumbSegment } from "@/components/layout/Breadcrumb";
import { NoteCoverPanel } from "@/components/layout/NoteCoverPanel";
import { ScrollRevealBar } from "@/components/layout/ScrollRevealBar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { NoteActionsMenu } from "@/components/layout/NoteActionsMenu";
import { normalizeBlockNoteContent } from "@/lib/blocknote-normalize";
import { resolveNoteCoverMeta } from "@/lib/note-cover";
import { useNoteCache, type CachedNote, type CachedNoteMetadata } from "@/hooks/useNoteCache";
import { useDebouncedSave } from "@/hooks/useDebouncedSave";
import { localNotes, syncQueue } from "@/lib/db/local";
import { noteDataToLocalRecord, fetchNoteWithLocalFallback } from "@/lib/db/noteSync";
import { readPendingAiPrompt } from "@/lib/pending-ai-prompt";
import {
	NOTE_VERSION_IDLE_THRESHOLD_MS,
	NOTE_VERSION_MAX_INTERVAL_MS,
	NOTE_VERSION_LIMIT,
	type NoteVersionDetail,
	type NoteVersionSummary,
} from "@/lib/note-versioning";
import { fetchNote, type NoteData } from "@/lib/note-client";
import { queryKeys } from "@/lib/query-keys";
import type { NoteTreeItem, WorkspaceTree } from "@/types";

type EmojiSelection = { emoji: string };

const EmojiPickerClient = dynamic(
	async () => {
		const emojiPicker = await import("emoji-picker-react");

		return function EmojiPickerWithTheme(props: { onEmojiClick: (emojiData: EmojiSelection) => void }) {
			return (
				<emojiPicker.default
					onEmojiClick={props.onEmojiClick}
					theme={emojiPicker.Theme.DARK}
					emojiStyle={emojiPicker.EmojiStyle.APPLE}
					autoFocusSearch
					lazyLoadEmojis
					searchPlaceholder="Search emojis"
					previewConfig={{ showPreview: false }}
					width="100%"
					height={320}
					style={{ width: "100%", border: 0, boxShadow: "none" }}
				/>
			);
		};
	},
	{
		ssr: false,
		loading: () => <EmojiPickerSkeleton />,
	},
);
const NoteVersionsDialogClient = dynamic(
	() => import("@/components/layout/NoteVersionsDialog").then((noteVersionsDialog) => noteVersionsDialog.NoteVersionsDialog),
	{
		ssr: false,
	},
);

function loadAISidePanelModule() {
	return import("@/components/ai/AISidePanel");
}

const AISidePanelClient = lazy(async () => {
	const aiSidePanel = await loadAISidePanelModule();
	return { default: aiSidePanel.AISidePanel };
});

interface NoteWorkspaceProps {
	activeNoteId: string;
	workspaceId: string;
	workspaceName: string;
	onNoteCreated: () => void;
	onOpenNote: (noteId: string | null) => void;
	onRefresh: () => void;
	isSidebarOpen: boolean;
	onToggleSidebar: () => void;
	tree: WorkspaceTree;
}

type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline" | "syncing" | "synced";

type MarqueeSelection = {
	startX: number;
	startY: number;
	currentX: number;
	currentY: number;
};

const DEFAULT_EDITOR_WIDTH = 720;
const MIN_EDITOR_WIDTH = 560;
const MAX_EDITOR_WIDTH = 1200;
const DEFAULT_AI_PANEL_WIDTH = 360;
const MIN_AI_PANEL_WIDTH = 320;
const MAX_AI_PANEL_WIDTH = 760;

function getMaxAllowedEditorWidth(): number {
	if (typeof window === "undefined") {
		return DEFAULT_EDITOR_WIDTH;
	}

	return Math.max(MIN_EDITOR_WIDTH, Math.min(MAX_EDITOR_WIDTH, Math.floor((window.innerWidth - 96) * 0.95)));
}

function getResolvedEditorWidth(note: NoteData): number {
	const persistedWidth = getStoredNoteWidth(note.id);
	const widthFromServer = typeof note.editorWidth === "number" ? note.editorWidth : null;
	const viewportMax = getMaxAllowedEditorWidth();

	return persistedWidth ?? (widthFromServer !== null ? Math.max(MIN_EDITOR_WIDTH, Math.min(MAX_EDITOR_WIDTH, widthFromServer)) : viewportMax);
}

function getRectFromMarquee(selection: MarqueeSelection): DOMRect {
	const left = Math.min(selection.startX, selection.currentX);
	const right = Math.max(selection.startX, selection.currentX);
	const top = Math.min(selection.startY, selection.currentY);
	const bottom = Math.max(selection.startY, selection.currentY);

	return new DOMRect(left, top, right - left, bottom - top);
}

function shouldStartCanvasMarquee(event: ReactPointerEvent<HTMLDivElement>): boolean {
	if (event.button !== 0) {
		return false;
	}

	const target = event.target;
	return target instanceof HTMLElement && target === event.currentTarget;
}

function getStoredNoteWidth(noteId: string): number | null {
	if (typeof window === "undefined") return null;
	const raw = window.localStorage.getItem(`note-width:${noteId}`);
	if (!raw) return null;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) return null;
	return Math.max(MIN_EDITOR_WIDTH, Math.min(MAX_EDITOR_WIDTH, parsed));
}

function setStoredNoteWidth(noteId: string, width: number) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(`note-width:${noteId}`, String(Math.round(width)));
}

function getStoredAiPanelWidth(): number | null {
	if (typeof window === "undefined") return null;
	const raw = window.localStorage.getItem("ai-panel-width");
	if (!raw) return null;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) return null;
	return Math.max(MIN_AI_PANEL_WIDTH, Math.min(MAX_AI_PANEL_WIDTH, parsed));
}

function setStoredAiPanelWidth(width: number) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem("ai-panel-width", String(Math.round(width)));
}

function isTextEntryElement(target: EventTarget | null): boolean {
	return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select"));
}

function buildCachedMetadata(note: NoteData): CachedNoteMetadata {
	return {
		emoji: note.emoji ?? null,
		coverImage: note.coverImage,
		coverImageMeta: note.coverImageMeta,
		createdAt: note.createdAt,
		workspace: note.workspace,
		folder: note.folder,
		folderPath: note.folderPath ?? [],
		editorWidth: note.editorWidth ?? null,
	};
}

function hydrateCachedNote(cachedNote: CachedNote, workspaceName: string): NoteData {
	return {
		id: cachedNote.id,
		title: cachedNote.title,
		emoji: cachedNote.metadata?.emoji ?? null,
		coverImage: cachedNote.metadata?.coverImage ?? null,
		coverImageMeta: cachedNote.metadata?.coverImageMeta,
		content: cachedNote.content,
		createdAt: cachedNote.metadata?.createdAt ?? cachedNote.updatedAt,
		updatedAt: cachedNote.updatedAt,
		editorWidth: cachedNote.metadata?.editorWidth ?? null,
		workspace: cachedNote.metadata?.workspace ?? { name: workspaceName },
		folder: cachedNote.metadata?.folder ?? null,
		folderPath: cachedNote.metadata?.folderPath ?? [],
	};
}

function findNoteInTree(tree: WorkspaceTree, noteId: string): NoteTreeItem | null {
	for (const note of tree.rootNotes) {
		if (note.id === noteId) {
			return note;
		}
	}

	const visitFolders = (folders: WorkspaceTree["folders"]): NoteTreeItem | null => {
		for (const folder of folders) {
			const folderNote = folder.notes.find((note) => note.id === noteId);
			if (folderNote) {
				return folderNote;
			}

			const nested = visitFolders(folder.children);
			if (nested) {
				return nested;
			}
		}

		return null;
	};

	return visitFolders(tree.folders);
}

function buildPlaceholderNote(note: NoteTreeItem, workspaceName: string): NoteData {
	const now = new Date().toISOString();
	return {
		id: note.id,
		title: note.title,
		emoji: note.emoji ?? null,
		coverImage: null,
		coverImageMeta: null,
		content: [],
		createdAt: now,
		updatedAt: now,
		workspace: { name: workspaceName },
		folder: null,
		folderPath: [],
	};
}

function extractChangedBlocksFromContent(content: unknown, changedBlockIds: string[]) {
	const wanted = new Set(changedBlockIds);
	const changed: Array<{ id: string; block: unknown }> = [];

	const visit = (value: unknown) => {
		if (!Array.isArray(value)) {
			return;
		}

		for (const item of value) {
			if (!item || typeof item !== "object") {
				continue;
			}

			const record = item as { id?: unknown; children?: unknown };
			if (typeof record.id === "string" && wanted.has(record.id)) {
				changed.push({ id: record.id, block: item });
			}

			visit(record.children);
		}
	};

	visit(normalizeBlockNoteContent(content));
	return changed;
}

function buildBreadcrumbSegments(note: NoteData): BreadcrumbSegment[] {
	const segments: BreadcrumbSegment[] = [
		{
			label: note.workspace.name,
			href: "/",
		},
	];

	for (const folder of note.folderPath ?? []) {
		segments.push({
			label: folder.name,
			href: `/?folder=${encodeURIComponent(folder.id)}`,
		});
	}

	segments.push({
		label: note.title || "Untitled",
		href: `/note/${encodeURIComponent(note.id)}`,
		isCurrent: true,
	});

	return segments;
}

export function NoteWorkspace({
	activeNoteId,
	workspaceId,
	workspaceName,
	onNoteCreated,
	onOpenNote,
	onRefresh,
	isSidebarOpen,
	onToggleSidebar,
	tree,
}: NoteWorkspaceProps) {
	const { state, toggleFocusMode } = useWorkspace();
	const queryClient = useQueryClient();
	const noteCache = useNoteCache();
	const [note, setNote] = useState<NoteData | null>(null);
	const noteRef = useRef<NoteData | null>(null);
	const focusModeRootRef = useRef<HTMLDivElement | null>(null);
	const [loading, setLoading] = useState(false);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
	const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
	const [isDesktopScreen, setIsDesktopScreen] = useState(() => (typeof window === "undefined" ? true : window.innerWidth >= 1024));
	const [isMobileScreen, setIsMobileScreen] = useState(() => (typeof window === "undefined" ? false : window.innerWidth < 768));
	const [isNewNote, setIsNewNote] = useState(false);
	const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
	const [editorWidth, setEditorWidth] = useState(DEFAULT_EDITOR_WIDTH);
	const [isResizing, setIsResizing] = useState(false);
	const editorShellRef = useRef<HTMLDivElement | null>(null);
	const mainScrollRef = useRef<HTMLDivElement | null>(null);
	const marqueeSelectionRef = useRef<MarqueeSelection | null>(null);
	const editorWidthDraftRef = useRef(DEFAULT_EDITOR_WIDTH);
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const emojiWrapperRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<NoteEditorRef>(null);
	const resizeStartXRef = useRef(0);
	const resizeStartWidthRef = useRef(DEFAULT_EDITOR_WIDTH);
	const animationFrameRef = useRef<number | null>(null);
	const currentContentRef = useRef<unknown>(null);
	const lastEditAtRef = useRef<number | null>(null);
	const firstEditSinceVersionAtRef = useRef<number | null>(null);
	const lastVersionCreatedAtRef = useRef<number | null>(null);
	const hasEditsSinceVersionRef = useRef(false);
	const versionRequestInFlightRef = useRef(false);
	const syncInFlightRef = useRef(false);
	const pendingChangedBlockIdsRef = useRef<Set<string>>(new Set());
	const [canUndo, setCanUndo] = useState(false);
	const [canRedo, setCanRedo] = useState(false);
	const [versionsOpen, setVersionsOpen] = useState(false);
	const [versionsLoading, setVersionsLoading] = useState(false);
	const [versions, setVersions] = useState<NoteVersionSummary[]>([]);
	const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
	const [previewVersion, setPreviewVersion] = useState<NoteVersionDetail | null>(null);
	const [previewLoading, setPreviewLoading] = useState(false);
	const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
	const [isCreatingManualVersion, setIsCreatingManualVersion] = useState(false);
	const [editorResetToken, setEditorResetToken] = useState(0);
	const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
	const [isAiPanelMounted, setIsAiPanelMounted] = useState(false);
	const [aiPanelWidth, setAiPanelWidth] = useState(() => getStoredAiPanelWidth() ?? DEFAULT_AI_PANEL_WIDTH);
	const [isAiPanelResizing, setIsAiPanelResizing] = useState(false);
	const [marqueeSelection, setMarqueeSelection] = useState<MarqueeSelection | null>(null);
	const [isMarqueeActive, setIsMarqueeActive] = useState(false);
	const { setAiPanelOpen, setWorkspaceAiPanelWidth } = useWorkspace();
	const aiPanelRef = useRef<HTMLDivElement | null>(null);
	const aiPanelWidthDraftRef = useRef(getStoredAiPanelWidth() ?? DEFAULT_AI_PANEL_WIDTH);
	const aiPanelResizeStartXRef = useRef(0);
	const aiPanelResizeStartWidthRef = useRef(DEFAULT_AI_PANEL_WIDTH);
	const aiPanelAnimationFrameRef = useRef<number | null>(null);
	const marqueeSelectionFrameRef = useRef<number | null>(null);
	const marqueeAutoScrollFrameRef = useRef<number | null>(null);
	const marqueeSelectionKeyRef = useRef("");
	const marqueePointerRef = useRef<{ clientX: number; clientY: number } | null>(null);

	const activeNoteQuery = useQuery({
		queryKey: activeNoteId ? queryKeys.note(activeNoteId) : (["note", "inactive"] as const),
		queryFn: () => fetchNoteWithLocalFallback(activeNoteId ?? "", fetchNote),
		enabled: Boolean(activeNoteId),
		staleTime: 30_000,
		retry: 1,
	});

	useEffect(() => {
		if (!activeNoteId) {
			return;
		}

		if (!readPendingAiPrompt(activeNoteId)) {
			return;
		}

		setIsAiPanelMounted(true);
		setIsAIPanelOpen(true);
	}, [activeNoteId]);

	useEffect(() => {
		setAiPanelOpen(isAIPanelOpen);
		setWorkspaceAiPanelWidth(aiPanelWidth);
	}, [aiPanelWidth, isAIPanelOpen, setAiPanelOpen, setWorkspaceAiPanelWidth]);

	const applyEditorWidth = useCallback((width: number) => {
		editorWidthDraftRef.current = width;
		if (editorShellRef.current) {
			editorShellRef.current.style.width = `${width}px`;
		}
	}, []);

	const applyAiPanelWidth = useCallback((width: number) => {
		aiPanelWidthDraftRef.current = width;
		if (aiPanelRef.current) {
			if (typeof window !== "undefined" && window.innerWidth < 768) {
				aiPanelRef.current.style.width = "100%";
				return;
			}
			aiPanelRef.current.style.width = `${width}px`;
		}
	}, []);

	const setCurrentNoteState = useCallback((nextNote: NoteData | null) => {
		noteRef.current = nextNote;
		setNote(nextNote);
		if (nextNote) {
			currentContentRef.current = normalizeBlockNoteContent(nextNote.content);
			return;
		}

		currentContentRef.current = null;
	}, []);

	const updateCurrentNoteState = useCallback((updater: (current: NoteData) => NoteData) => {
		const current = noteRef.current;
		if (!current) {
			return null;
		}

		const next = updater(current);
		noteRef.current = next;
		setNote(next);
		currentContentRef.current = normalizeBlockNoteContent(next.content);
		return next;
	}, []);

	const syncNoteQueryCache = useCallback(
		(nextNote: NoteData) => {
			queryClient.setQueryData(queryKeys.note(nextNote.id), nextNote);
			void localNotes.upsert(noteDataToLocalRecord(nextNote));
		},
		[queryClient],
	);

	const applyLoadedNoteState = useCallback(
		(nextNote: NoteData) => {
			setCurrentNoteState(nextNote);
			setEditorResetToken((token) => token + 1);
			setIsNewNote(nextNote.title === "Untitled" && !nextNote.content);

			const resolvedWidth = getResolvedEditorWidth(nextNote);
			setEditorWidth(resolvedWidth);
			applyEditorWidth(resolvedWidth);
		},
		[applyEditorWidth, setCurrentNoteState],
	);

	const cacheNoteSnapshot = useCallback(
		(sourceNote: NoteData, content: unknown = currentContentRef.current ?? sourceNote.content, dirty?: boolean) => {
			const existingEntry = noteCache.getCachedNote(sourceNote.id);
			noteCache.upsertCachedNote({
				id: sourceNote.id,
				title: sourceNote.title,
				content,
				updatedAt: sourceNote.updatedAt,
				dirty: dirty ?? existingEntry?.dirty ?? false,
				metadata: buildCachedMetadata(sourceNote),
			});
		},
		[noteCache],
	);

	const queueOfflineContent = useCallback(
		(noteId: string, content: unknown) => {
			const current = noteRef.current;
			const existingEntry = noteCache.getCachedNote(noteId);
			const isCurrent = current?.id === noteId;

			noteCache.upsertCachedNote({
				id: noteId,
				title: (isCurrent ? current.title : existingEntry?.title) ?? "Untitled",
				content,
				updatedAt: (isCurrent ? current.updatedAt : existingEntry?.updatedAt) ?? new Date().toISOString(),
				dirty: true,
				metadata: isCurrent && current ? buildCachedMetadata(current) : existingEntry?.metadata,
			});
		},
		[noteCache],
	);

	const showTransientSaveStatus = useCallback((status: Extract<SaveStatus, "saved" | "synced">) => {
		setSaveStatus(status);
		if (saveTimeoutRef.current) {
			clearTimeout(saveTimeoutRef.current);
		}

		saveTimeoutRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
	}, []);

	const markSaveSuccess = useCallback(() => {
		showTransientSaveStatus("saved");
	}, [showTransientSaveStatus]);

	const markSyncSuccess = useCallback(() => {
		showTransientSaveStatus("synced");
	}, [showTransientSaveStatus]);

	const markSaveFailure = useCallback(() => {
		setSaveStatus(isOnline ? "error" : "offline");
	}, [isOnline]);

	const patchNote = useCallback(
		async (noteId: string, payload: Record<string, unknown>): Promise<{ updatedAt: string } | false> => {
			if (!isOnline) {
				setSaveStatus("offline");
				return false;
			}

			const response = await fetch(`/api/notes/${noteId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				throw new Error("Failed to save note");
			}

			const updated = (await response.json()) as { updatedAt: string };
			return updated;
		},
		[isOnline],
	);

	const persistNoteBlocks = useCallback(async (noteId: string, content: unknown, changedBlockIds: string[]) => {
		const response = await fetch(`/api/notes/${noteId}/blocks`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ content, changedBlockIds }),
		});

		if (!response.ok) {
			throw new Error("Failed to persist note blocks");
		}

		return (await response.json()) as {
			id: string;
			content: unknown;
			updatedAt: string;
		};
	}, []);

	const serializeContentSnapshot = useCallback((content: unknown): string => {
		try {
			return JSON.stringify(normalizeBlockNoteContent(content)) ?? "null";
		} catch {
			return "null";
		}
	}, []);

	const getPersistedSnapshot = useCallback(
		(noteId: string): { content: unknown; updatedAt: string } | null => {
			if (noteRef.current?.id === noteId) {
				return {
					content: noteRef.current.content,
					updatedAt: noteRef.current.updatedAt,
				};
			}

			const queryNote = queryClient.getQueryData<NoteData>(queryKeys.note(noteId));
			if (queryNote) {
				return {
					content: queryNote.content,
					updatedAt: queryNote.updatedAt,
				};
			}

			const cachedNote = noteCache.getCachedNote(noteId);
			if (cachedNote && !cachedNote.dirty) {
				return {
					content: cachedNote.content,
					updatedAt: cachedNote.updatedAt,
				};
			}

			return null;
		},
		[noteCache, queryClient],
	);

	const createVersionRequest = useCallback(async (noteId: string, payload: { manual: boolean; label?: string; content?: unknown }) => {
		const response = await fetch(`/api/notes/${noteId}/versions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		const data = await response.json();
		if (!response.ok) {
			throw new Error(typeof data?.error === "string" ? data.error : "Failed to create version");
		}

		return data as {
			note: {
				id: string;
				content: unknown;
				updatedAt: string;
			};
			version: NoteVersionSummary | null;
			skipped: boolean;
		};
	}, []);

	const persistSessionBoundaryVersion = useCallback(
		async (noteId: string, content: unknown) => {
			if (!isOnline) {
				return;
			}

			try {
				await persistNoteBlocks(noteId, content, []);
				await createVersionRequest(noteId, {
					manual: false,
					content,
				});
			} catch {
				// Session-boundary checkpointing is best-effort.
			}
		},
		[createVersionRequest, isOnline, persistNoteBlocks],
	);

	const saveContentNow = useCallback(
		async (noteId: string, content: unknown, changedBlockIds: string[]) => {
			const normalizedContent = normalizeBlockNoteContent(content);
			const mergedChangedBlockIds = changedBlockIds.length > 0 ? changedBlockIds : Array.from(pendingChangedBlockIdsRef.current);
			const isTargetActiveAtStart = noteRef.current?.id === noteId;
			if (isTargetActiveAtStart) {
				currentContentRef.current = normalizedContent;
			}

			const persistedSnapshot = getPersistedSnapshot(noteId);
			if (persistedSnapshot && serializeContentSnapshot(normalizedContent) === serializeContentSnapshot(persistedSnapshot.content)) {
				noteCache.markClean(noteId, persistedSnapshot.updatedAt);
				return;
			}

			queueOfflineContent(noteId, normalizedContent);

			if (!isOnline) {
				await localNotes.update(noteId, { content: normalizedContent });
				await syncQueue.enqueue({
					operation: "UPDATE",
					entity: "block",
					entityId: noteId,
					payload: {
						content: normalizedContent,
						changedBlockIds: mergedChangedBlockIds,
					},
				});
				pendingChangedBlockIdsRef.current.clear();

				if (isTargetActiveAtStart) {
					setSaveStatus("offline");
				}
				return;
			}

			if (isTargetActiveAtStart) {
				setSaveStatus("saving");
			}

			try {
				const updated = await persistNoteBlocks(noteId, normalizedContent, mergedChangedBlockIds);
				let nextNote: NoteData | null = null;

				if (noteRef.current?.id === noteId) {
					nextNote = updateCurrentNoteState((current) => ({
						...current,
						content: updated.content,
						updatedAt: updated.updatedAt ?? current.updatedAt,
					}));
				}

				if (nextNote) {
					cacheNoteSnapshot(nextNote, updated.content, false);
					syncNoteQueryCache(nextNote);
				} else {
					noteCache.markClean(noteId, updated.updatedAt);
					queryClient.setQueryData<NoteData | undefined>(queryKeys.note(noteId), (existing) => {
						if (!existing) {
							return existing;
						}

						return {
							...existing,
							content: updated.content,
							updatedAt: updated.updatedAt ?? existing.updatedAt,
						};
					});
				}

				if (noteRef.current?.id === noteId) {
					markSaveSuccess();
				}
				pendingChangedBlockIdsRef.current.clear();
			} catch {
				await localNotes.update(noteId, { content: normalizedContent });
				await syncQueue.enqueue({
					operation: "UPDATE",
					entity: "block",
					entityId: noteId,
					payload: {
						content: normalizedContent,
						changedBlockIds: mergedChangedBlockIds,
					},
				});
				pendingChangedBlockIdsRef.current.clear();

				if (noteRef.current?.id === noteId) {
					markSaveFailure();
					toast.error("Auto-save failed. Check your connection.", { id: "note-autosave-error" });
				}
			}
		},
		[
			cacheNoteSnapshot,
			getPersistedSnapshot,
			isOnline,
			markSaveFailure,
			markSaveSuccess,
			noteCache,
			persistNoteBlocks,
			queryClient,
			queueOfflineContent,
			serializeContentSnapshot,
			syncNoteQueryCache,
			updateCurrentNoteState,
		],
	);

	const debouncedContentSave = useDebouncedSave(saveContentNow, 800);

	useEffect(() => {
		if (typeof navigator === "undefined") return;

		const onOffline = () => {
			setIsOnline(false);
			setSaveStatus("offline");
		};
		const onOnline = () => {
			setIsOnline(true);
			setSaveStatus((prev) => (prev === "offline" ? "idle" : prev));
		};

		window.addEventListener("offline", onOffline);
		window.addEventListener("online", onOnline);

		return () => {
			window.removeEventListener("offline", onOffline);
			window.removeEventListener("online", onOnline);
		};
	}, []);

	useEffect(() => {
		return () => {
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}
		};
	}, []);

	useEffect(() => {
		const previousNote = noteRef.current;
		if (previousNote && previousNote.id !== activeNoteId && hasEditsSinceVersionRef.current) {
			void persistSessionBoundaryVersion(previousNote.id, currentContentRef.current);
		}

		hasEditsSinceVersionRef.current = false;
		lastEditAtRef.current = null;
		firstEditSinceVersionAtRef.current = null;
		lastVersionCreatedAtRef.current = null;
		setVersionsOpen(false);
		setVersions([]);
		setPreviewVersion(null);
		setPreviewVersionId(null);
		setPreviewLoading(false);

		if (!activeNoteId) {
			setCurrentNoteState(null);
			setLoading(false);
			return;
		}

		const cachedNote = noteCache.getCachedNote(activeNoteId);
		const prefetchedNote = queryClient.getQueryData<NoteData>(queryKeys.note(activeNoteId));
		const treeNote = findNoteInTree(tree, activeNoteId);
		const placeholderNote = treeNote ? buildPlaceholderNote(treeNote, workspaceName) : null;

		if (cachedNote?.dirty) {
			noteCache.touchCachedNote(activeNoteId);
			applyLoadedNoteState(hydrateCachedNote(cachedNote, workspaceName));
			setLoading(false);
			return;
		}

		if (prefetchedNote) {
			cacheNoteSnapshot(prefetchedNote, prefetchedNote.content, false);
			applyLoadedNoteState(prefetchedNote);
			setLoading(false);
			return;
		}

		if (cachedNote) {
			noteCache.touchCachedNote(activeNoteId);
			applyLoadedNoteState(hydrateCachedNote(cachedNote, workspaceName));
			setLoading(false);
			return;
		}

		if (placeholderNote) {
			applyLoadedNoteState(placeholderNote);
			setLoading(false);
			return;
		}

		setCurrentNoteState(null);
		setLoading(isOnline);
	}, [
		activeNoteId,
		applyLoadedNoteState,
		cacheNoteSnapshot,
		isOnline,
		noteCache,
		persistSessionBoundaryVersion,
		queryClient,
		setCurrentNoteState,
		tree,
		workspaceName,
	]);

	useEffect(() => {
		const remoteNote = activeNoteQuery.data;
		if (!activeNoteId || !remoteNote || remoteNote.id !== activeNoteId) {
			return;
		}

		const cachedEntry = noteCache.getCachedNote(remoteNote.id);
		if (cachedEntry?.dirty) {
			setLoading(false);
			return;
		}

		cacheNoteSnapshot(remoteNote, remoteNote.content, false);
		syncNoteQueryCache(remoteNote);

		const current = noteRef.current;
		if (!current || current.id !== remoteNote.id) {
			applyLoadedNoteState(remoteNote);
			setLoading(false);
			return;
		}

		const currentUpdatedAt = Date.parse(current.updatedAt);
		const remoteUpdatedAt = Date.parse(remoteNote.updatedAt);
		const hasComparableTimestamps = Number.isFinite(currentUpdatedAt) && Number.isFinite(remoteUpdatedAt);
		if (hasComparableTimestamps && remoteUpdatedAt < currentUpdatedAt) {
			setLoading(false);
			return;
		}

		const shouldApplyRemoteContent =
			hasEditsSinceVersionRef.current === false &&
			((hasComparableTimestamps && remoteUpdatedAt > currentUpdatedAt) ||
				((!Number.isFinite(currentUpdatedAt) || !Number.isFinite(remoteUpdatedAt)) && remoteNote.updatedAt !== current.updatedAt));

		if (shouldApplyRemoteContent) {
			applyLoadedNoteState(remoteNote);
			setLoading(false);
			return;
		}

		const mergedNote: NoteData = {
			...current,
			title: remoteNote.title,
			emoji: remoteNote.emoji ?? null,
			coverImage: remoteNote.coverImage,
			coverImageMeta: remoteNote.coverImageMeta,
			createdAt: remoteNote.createdAt,
			updatedAt: remoteNote.updatedAt,
			workspace: remoteNote.workspace,
			folder: remoteNote.folder,
		};

		noteRef.current = mergedNote;
		setNote(mergedNote);
		setLoading(false);
	}, [activeNoteId, activeNoteQuery.data, applyLoadedNoteState, cacheNoteSnapshot, noteCache, syncNoteQueryCache]);

	useEffect(() => {
		if (!activeNoteId || !activeNoteQuery.isError) {
			return;
		}

		setLoading(false);
	}, [activeNoteId, activeNoteQuery.isError]);

	// Listen for emoji picker trigger from sidebar context menu
	useEffect(() => {
		const handler = (e: Event) => {
			const custom = e as CustomEvent<{ noteId: string }>;
			if (custom.detail.noteId === activeNoteId) {
				setEmojiPickerOpen(true);
			}
		};
		window.addEventListener("open-emoji-picker", handler);
		return () => window.removeEventListener("open-emoji-picker", handler);
	}, [activeNoteId]);

	// Close emoji picker on outside click
	useEffect(() => {
		if (!emojiPickerOpen) return;
		const handler = (e: MouseEvent) => {
			if (emojiWrapperRef.current && !emojiWrapperRef.current.contains(e.target as Node)) {
				setEmojiPickerOpen(false);
			}
		};
		window.addEventListener("mousedown", handler);
		return () => window.removeEventListener("mousedown", handler);
	}, [emojiPickerOpen]);

	const handleSaveContent = useCallback(
		async (noteId: string, content: unknown, changedBlockIds: string[]) => {
			for (const blockId of changedBlockIds) {
				pendingChangedBlockIdsRef.current.add(blockId);
			}

			debouncedContentSave.push(noteId, content, Array.from(pendingChangedBlockIdsRef.current));
		},
		[debouncedContentSave],
	);

	const handleContentChange = useCallback(
		(noteId: string, content: unknown) => {
			const normalizedContent = normalizeBlockNoteContent(content);
			const isActiveTarget = noteRef.current?.id === noteId;
			const persistedSnapshot = getPersistedSnapshot(noteId);

			if (persistedSnapshot && serializeContentSnapshot(normalizedContent) === serializeContentSnapshot(persistedSnapshot.content)) {
				noteCache.markClean(noteId, persistedSnapshot.updatedAt);
				if (isActiveTarget) {
					hasEditsSinceVersionRef.current = false;
					lastEditAtRef.current = null;
					firstEditSinceVersionAtRef.current = null;
				}
				return;
			}

			if (isActiveTarget) {
				currentContentRef.current = normalizedContent;

				const now = Date.now();
				lastEditAtRef.current = now;
				if (!hasEditsSinceVersionRef.current) {
					hasEditsSinceVersionRef.current = true;
					firstEditSinceVersionAtRef.current = now;
				}
			}

			queueOfflineContent(noteId, normalizedContent);
			if (!isOnline && isActiveTarget) {
				setSaveStatus("offline");
			}
		},
		[getPersistedSnapshot, isOnline, noteCache, queueOfflineContent, serializeContentSnapshot],
	);

	const handleSaveTitle = useCallback(
		async (title: string) => {
			const currentNoteId = noteRef.current?.id;
			if (!currentNoteId) {
				return;
			}

			setSaveStatus("saving");
			try {
				const updated = await patchNote(currentNoteId, { title });
				if (!updated) return;

				if (noteRef.current?.id !== currentNoteId) {
					return;
				}

				const nextNote = updateCurrentNoteState((current) => ({
					...current,
					title,
					updatedAt: updated.updatedAt ?? current.updatedAt,
				}));
				if (nextNote) {
					cacheNoteSnapshot(nextNote);
					syncNoteQueryCache(nextNote);
				}
				markSaveSuccess();
				onNoteCreated();
			} catch {
				markSaveFailure();
			}
		},
		[cacheNoteSnapshot, markSaveFailure, markSaveSuccess, onNoteCreated, patchNote, syncNoteQueryCache, updateCurrentNoteState],
	);

	const handleEmojiChange = useCallback(
		async (emoji: string | null) => {
			const currentNoteId = noteRef.current?.id;
			if (!currentNoteId) {
				return;
			}

			setEmojiPickerOpen(false);
			try {
				const updated = await patchNote(currentNoteId, { emoji });
				if (updated && noteRef.current?.id === currentNoteId) {
					const nextNote = updateCurrentNoteState((current) => ({
						...current,
						emoji,
						updatedAt: updated.updatedAt ?? current.updatedAt,
					}));
					if (nextNote) {
						cacheNoteSnapshot(nextNote);
						syncNoteQueryCache(nextNote);
					}
					toast.success("Icon updated");
				}
			} catch {
				markSaveFailure();
				toast.error("Failed to update icon");
			}
			onRefresh();
		},
		[cacheNoteSnapshot, markSaveFailure, onRefresh, patchNote, syncNoteQueryCache, updateCurrentNoteState],
	);

	const handleEmojiPickerClick = useCallback(
		(emojiData: EmojiSelection) => {
			void handleEmojiChange(emojiData.emoji);
		},
		[handleEmojiChange],
	);

	const handleDuplicate = useCallback(async () => {
		if (!note) return;
		try {
			const res = await fetch(`/api/notes/${note.id}`);
			if (!res.ok) {
				throw new Error("Failed to load note");
			}
			const noteData = await res.json();
			const createRes = await fetch("/api/notes", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId, folderId: noteData.folderId }),
			});
			if (!createRes.ok) {
				throw new Error("Failed to create duplicate");
			}

			const newNote = await createRes.json();
			const patchRes = await fetch(`/api/notes/${newNote.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					title: `${noteData.title} (copy)`,
					content: noteData.content,
					emoji: noteData.emoji,
				}),
			});

			if (!patchRes.ok) {
				throw new Error("Failed to finish duplicate");
			}

			const duplicatedCoverMeta = resolveNoteCoverMeta(noteData.coverImage, noteData.coverImageMeta);
			if (noteData.coverImage && duplicatedCoverMeta && duplicatedCoverMeta.source !== "upload") {
				const coverRes = await fetch(`/api/notes/${newNote.id}/cover`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						coverImage: noteData.coverImage,
						coverImageMeta: duplicatedCoverMeta,
					}),
				});

				if (!coverRes.ok) {
					throw new Error("Failed to copy cover");
				}
			}

			onNoteCreated();
			onRefresh();
			onOpenNote(newNote.id);
			toast.success("Note duplicated");
		} catch (error) {
			console.error("Failed to duplicate note", error);
			toast.error("Failed to duplicate");
		}
	}, [note, onNoteCreated, onOpenNote, onRefresh, workspaceId]);

	const handleDelete = useCallback(async () => {
		if (!note) return;
		try {
			const response = await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
			if (!response.ok) {
				throw new Error("Failed to delete note");
			}
			await queryClient.invalidateQueries({ queryKey: queryKeys.trashStatus });
			onOpenNote(null);
			onRefresh();
			toast.success("Moved to Trash");
		} catch (error) {
			console.error("Failed to delete note", error);
			toast.error("Failed to move note to Trash");
		}
	}, [note, onOpenNote, onRefresh, queryClient]);

	const fetchVersions = useCallback(
		async (noteId: string, showLoading = true): Promise<NoteVersionSummary[]> => {
			if (!noteId) return [];
			if (!isOnline) {
				if (noteRef.current?.id === noteId) {
					setVersions([]);
					lastVersionCreatedAtRef.current = null;
				}
				return [];
			}

			if (showLoading) {
				setVersionsLoading(true);
			}

			try {
				const response = await fetch(`/api/notes/${noteId}/versions`);
				if (!response.ok) {
					throw new Error("Failed to load versions");
				}

				const data = (await response.json()) as { versions?: NoteVersionSummary[] };
				if (noteRef.current?.id === noteId) {
					const nextVersions = data.versions ?? [];
					setVersions(nextVersions);
					lastVersionCreatedAtRef.current = nextVersions[0] ? new Date(nextVersions[0].createdAt).getTime() : null;
					return nextVersions;
				}

				return data.versions ?? [];
			} catch {
				if (noteRef.current?.id === noteId) {
					setVersions([]);
					lastVersionCreatedAtRef.current = null;
				}

				return [];
			} finally {
				if (showLoading) {
					setVersionsLoading(false);
				}
			}
		},
		[isOnline],
	);

	useEffect(() => {
		if (!isOnline) {
			return;
		}

		void fetchVersions(activeNoteId, false);
	}, [activeNoteId, fetchVersions, isOnline]);

	const handlePreviewVersion = useCallback(
		async (versionId: string) => {
			const current = noteRef.current;
			if (!current) {
				return;
			}

			if (previewVersionId === versionId && previewVersion && !previewLoading) {
				return;
			}

			setPreviewVersionId(versionId);
			setPreviewLoading(true);
			try {
				const response = await fetch(`/api/notes/${current.id}/versions/${versionId}`);
				if (!response.ok) {
					throw new Error("Failed to load version preview");
				}

				const data = (await response.json()) as NoteVersionDetail;
				if (noteRef.current?.id === current.id) {
					setPreviewVersion(data);
				}
			} catch {
				if (noteRef.current?.id === current.id) {
					setPreviewVersion(null);
				}
			} finally {
				if (noteRef.current?.id === current.id) {
					setPreviewLoading(false);
				}
			}
		},
		[previewLoading, previewVersion, previewVersionId],
	);

	const openVersionsDialog = useCallback(async () => {
		const current = noteRef.current;
		if (!current) {
			return;
		}

		setVersionsOpen(true);
		const nextVersions = await fetchVersions(current.id);

		if (nextVersions.length === 0) {
			setPreviewVersionId(null);
			setPreviewVersion(null);
			setPreviewLoading(false);
			return;
		}

		if (previewVersionId && previewVersion && nextVersions.some((version) => version.id === previewVersionId)) {
			return;
		}

		await handlePreviewVersion(nextVersions[0].id);
	}, [fetchVersions, handlePreviewVersion, previewVersion, previewVersionId]);

	const createVersion = useCallback(
		async (options: { manual: boolean; label?: string; content?: unknown }) => {
			const current = noteRef.current;
			if (!current || versionRequestInFlightRef.current) {
				return null;
			}

			const snapshotContent = normalizeBlockNoteContent(options.content ?? currentContentRef.current ?? current.content);
			if (!isOnline) {
				queueOfflineContent(current.id, snapshotContent);
				setSaveStatus("offline");
				return null;
			}

			versionRequestInFlightRef.current = true;
			try {
				const result = await createVersionRequest(current.id, {
					manual: options.manual,
					label: options.label,
					content: snapshotContent,
				});

				const nextNote = updateCurrentNoteState((existing) => ({
					...existing,
					content: result.note.content,
					updatedAt: result.note.updatedAt ?? existing.updatedAt,
				}));

				if (nextNote) {
					cacheNoteSnapshot(nextNote, result.note.content, false);
					syncNoteQueryCache(nextNote);
				} else {
					noteCache.markClean(current.id, result.note.updatedAt);
				}

				if (result.version) {
					const createdVersion = result.version;
					hasEditsSinceVersionRef.current = false;
					firstEditSinceVersionAtRef.current = null;
					lastVersionCreatedAtRef.current = new Date(createdVersion.createdAt).getTime();
					setVersions((previousVersions) =>
						[createdVersion, ...previousVersions.filter((version) => version.id !== createdVersion.id)].slice(0, NOTE_VERSION_LIMIT),
					);
				}

				return result;
			} catch {
				return null;
			} finally {
				versionRequestInFlightRef.current = false;
			}
		},
		[cacheNoteSnapshot, createVersionRequest, isOnline, noteCache, queueOfflineContent, syncNoteQueryCache, updateCurrentNoteState],
	);

	const handleManualVersion = useCallback(async () => {
		const current = noteRef.current;
		if (!current) {
			return;
		}

		setIsCreatingManualVersion(true);
		setSaveStatus("saving");
		try {
			const result = await createVersion({
				manual: true,
				content: currentContentRef.current ?? current.content,
			});

			if (!result) {
				markSaveFailure();
				return;
			}

			markSaveSuccess();
			if (result.version) {
				setPreviewVersionId(result.version.id);
			}

			if (versionsOpen) {
				await fetchVersions(current.id, false);
			}
		} finally {
			setIsCreatingManualVersion(false);
		}
	}, [createVersion, fetchVersions, markSaveFailure, markSaveSuccess, versionsOpen]);

	const handleRestoreVersion = useCallback(
		async (versionId: string) => {
			const current = noteRef.current;
			if (!current) return;

			setRestoringVersionId(versionId);
			setSaveStatus("saving");
			try {
				const response = await fetch(`/api/notes/${current.id}/versions/${versionId}`);
				if (!response.ok) {
					throw new Error("Failed to load version");
				}

				const version = (await response.json()) as NoteVersionDetail;
				const result = await createVersion({
					manual: true,
					label: `Restored from ${format(new Date(version.createdAt), "PPP 'at' p")}`,
					content: version.content,
				});

				if (!result) {
					markSaveFailure();
					return;
				}

				setPreviewVersion(version);
				setPreviewVersionId(version.id);
				setEditorResetToken((token) => token + 1);
				markSaveSuccess();
				setVersionsOpen(false);
				await fetchVersions(current.id, false);
				onRefresh();
				toast.success("Version restored");
			} catch {
				markSaveFailure();
				toast.error("Failed to restore version");
			} finally {
				setRestoringVersionId(null);
			}
		},
		[createVersion, fetchVersions, markSaveFailure, markSaveSuccess, onRefresh],
	);

	const handleCoverUpdated = useCallback(
		(updated: { coverImage: string | null; coverImageMeta: unknown; updatedAt: string }) => {
			const nextNote = updateCurrentNoteState((current) => ({
				...current,
				coverImage: updated.coverImage,
				coverImageMeta: updated.coverImageMeta,
				updatedAt: updated.updatedAt ?? current.updatedAt,
			}));

			if (nextNote) {
				cacheNoteSnapshot(nextNote);
				syncNoteQueryCache(nextNote);
			}

			markSaveSuccess();
			onRefresh();
		},
		[cacheNoteSnapshot, markSaveSuccess, onRefresh, syncNoteQueryCache, updateCurrentNoteState],
	);

	const flushDirtyNotes = useCallback(async () => {
		if (!isOnline || syncInFlightRef.current) {
			return;
		}

		const dirtyNotes = noteCache.getDirtyNotes();
		if (dirtyNotes.length === 0) {
			return;
		}

		const activeNoteIsDirty = dirtyNotes.some((dirtyNote) => dirtyNote.id === noteRef.current?.id);

		syncInFlightRef.current = true;
		if (activeNoteIsDirty) {
			setSaveStatus("syncing");
		}
		try {
			for (const dirtyNote of dirtyNotes) {
				const persistedSnapshot = getPersistedSnapshot(dirtyNote.id);
				if (persistedSnapshot && serializeContentSnapshot(dirtyNote.content) === serializeContentSnapshot(persistedSnapshot.content)) {
					noteCache.markClean(dirtyNote.id, persistedSnapshot.updatedAt);
					continue;
				}

				const updated = await persistNoteBlocks(dirtyNote.id, dirtyNote.content, []);
				noteCache.markClean(dirtyNote.id, updated.updatedAt);

				if (noteRef.current?.id === dirtyNote.id) {
					const nextNote = updateCurrentNoteState((current) => ({
						...current,
						content: updated.content,
						updatedAt: updated.updatedAt ?? current.updatedAt,
					}));
					if (nextNote) {
						cacheNoteSnapshot(nextNote, updated.content, false);
						syncNoteQueryCache(nextNote);
					}
				} else {
					queryClient.setQueryData<NoteData | undefined>(queryKeys.note(dirtyNote.id), (existing) => {
						if (!existing) {
							return existing;
						}

						return {
							...existing,
							content: updated.content,
							updatedAt: updated.updatedAt ?? existing.updatedAt,
						};
					});
				}
			}

			if (activeNoteIsDirty) {
				markSyncSuccess();
			}
		} catch {
			if (activeNoteIsDirty) {
				markSaveFailure();
			}
		} finally {
			syncInFlightRef.current = false;
		}
	}, [
		cacheNoteSnapshot,
		getPersistedSnapshot,
		isOnline,
		markSaveFailure,
		markSyncSuccess,
		noteCache,
		persistNoteBlocks,
		queryClient,
		serializeContentSnapshot,
		syncNoteQueryCache,
		updateCurrentNoteState,
	]);

	useEffect(() => {
		void flushDirtyNotes();
	}, [flushDirtyNotes]);

	useEffect(() => {
		if (!isOnline) {
			return;
		}

		const interval = window.setInterval(() => {
			void flushDirtyNotes();
		}, 12_000);

		return () => {
			window.clearInterval(interval);
		};
	}, [flushDirtyNotes, isOnline]);

	useEffect(() => {
		if (!isOnline) {
			return;
		}

		const handleFocus = () => {
			void flushDirtyNotes();
		};

		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				void flushDirtyNotes();
			}
		};

		window.addEventListener("focus", handleFocus);
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			window.removeEventListener("focus", handleFocus);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [flushDirtyNotes, isOnline]);

	useEffect(() => {
		const interval = window.setInterval(() => {
			if (!isOnline || !hasEditsSinceVersionRef.current || versionRequestInFlightRef.current) {
				return;
			}

			const now = Date.now();
			const lastEditAt = lastEditAtRef.current;
			const idleExpired = typeof lastEditAt === "number" && now - lastEditAt >= NOTE_VERSION_IDLE_THRESHOLD_MS;
			const versionAnchor = lastVersionCreatedAtRef.current ?? firstEditSinceVersionAtRef.current;
			const intervalExpired = typeof versionAnchor === "number" && now - versionAnchor >= NOTE_VERSION_MAX_INTERVAL_MS;

			if (!idleExpired && !intervalExpired) {
				return;
			}

			void createVersion({
				manual: false,
				content: currentContentRef.current,
			});
		}, 30_000);

		return () => {
			window.clearInterval(interval);
		};
	}, [createVersion, isOnline]);

	useEffect(() => {
		void debouncedContentSave.flush();
		pendingChangedBlockIdsRef.current.clear();
	}, [activeNoteId, debouncedContentSave]);

	useEffect(() => {
		const handleBeforeUnload = () => {
			const current = noteRef.current;
			if (!current || !isOnline || !hasEditsSinceVersionRef.current) {
				return;
			}

			const snapshotContent = normalizeBlockNoteContent(currentContentRef.current ?? current.content);
			const autosavePayload = new Blob([JSON.stringify({ content: snapshotContent })], { type: "application/json" });
			const versionPayload = new Blob([JSON.stringify({ manual: false, content: snapshotContent })], { type: "application/json" });

			navigator.sendBeacon?.(`/api/notes/${current.id}/autosave`, autosavePayload);
			navigator.sendBeacon?.(`/api/notes/${current.id}/versions`, versionPayload);
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, [isOnline]);

	// Update undo/redo state periodically (editor can mount after async note load).
	useEffect(() => {
		const updateHistoryState = () => {
			if (!editorRef.current) {
				setCanUndo(false);
				setCanRedo(false);
				return;
			}

			try {
				setCanUndo(editorRef.current.canUndo());
				setCanRedo(editorRef.current.canRedo());
			} catch {
				setCanUndo(false);
				setCanRedo(false);
			}
		};

		updateHistoryState();
		const interval = setInterval(updateHistoryState, 100);
		return () => clearInterval(interval);
	}, [activeNoteId, note?.id]);

	const persistCurrentWidth = useCallback(
		async (nextWidth?: number) => {
			const width = Math.round(nextWidth ?? editorWidthDraftRef.current);
			setStoredNoteWidth(activeNoteId, width);
			const nextNote = updateCurrentNoteState((current) => ({
				...current,
				editorWidth: width,
			}));
			if (nextNote) {
				cacheNoteSnapshot(nextNote);
				syncNoteQueryCache(nextNote);
			}
		},
		[activeNoteId, cacheNoteSnapshot, syncNoteQueryCache, updateCurrentNoteState],
	);

	useEffect(() => {
		if (!isResizing) {
			applyEditorWidth(editorWidth);
		}
	}, [applyEditorWidth, editorWidth, isResizing]);

	useEffect(() => {
		if (!isAiPanelResizing) {
			applyAiPanelWidth(aiPanelWidth);
		}
	}, [aiPanelWidth, applyAiPanelWidth, isAiPanelResizing]);

	useEffect(() => {
		if (!isResizing) return;

		const maxAllowedByViewport = Math.max(MIN_EDITOR_WIDTH, Math.min(MAX_EDITOR_WIDTH, Math.floor((window.innerWidth - 96) * 0.95)));

		const onMouseMove = (event: MouseEvent) => {
			const dx = event.clientX - resizeStartXRef.current;
			const nextWidth = Math.max(MIN_EDITOR_WIDTH, Math.min(maxAllowedByViewport, resizeStartWidthRef.current + dx * 2));

			if (animationFrameRef.current !== null) {
				cancelAnimationFrame(animationFrameRef.current);
			}
			animationFrameRef.current = window.requestAnimationFrame(() => {
				applyEditorWidth(nextWidth);
			});
		};

		const onMouseUp = () => {
			const committedWidth = editorWidthDraftRef.current;
			setIsResizing(false);
			setEditorWidth(committedWidth);
			void persistCurrentWidth(committedWidth);
		};

		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);

		return () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
			if (animationFrameRef.current !== null) {
				cancelAnimationFrame(animationFrameRef.current);
			}
		};
	}, [applyEditorWidth, isResizing, persistCurrentWidth]);

	useEffect(() => {
		if (!isAiPanelResizing) {
			return;
		}

		const maxAllowedByViewport = Math.max(MIN_AI_PANEL_WIDTH, Math.min(MAX_AI_PANEL_WIDTH, Math.floor(window.innerWidth * 0.6)));

		const onMouseMove = (event: MouseEvent) => {
			const dx = event.clientX - aiPanelResizeStartXRef.current;
			const nextWidth = Math.max(MIN_AI_PANEL_WIDTH, Math.min(maxAllowedByViewport, aiPanelResizeStartWidthRef.current - dx));

			if (aiPanelAnimationFrameRef.current !== null) {
				cancelAnimationFrame(aiPanelAnimationFrameRef.current);
			}

			aiPanelAnimationFrameRef.current = window.requestAnimationFrame(() => {
				applyAiPanelWidth(nextWidth);
			});
		};

		const onMouseUp = () => {
			const committedWidth = aiPanelWidthDraftRef.current;
			setAiPanelWidth(committedWidth);
			setIsAiPanelResizing(false);
			setStoredAiPanelWidth(committedWidth);
		};

		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);

		return () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
			if (aiPanelAnimationFrameRef.current !== null) {
				cancelAnimationFrame(aiPanelAnimationFrameRef.current);
			}
		};
	}, [applyAiPanelWidth, isAiPanelResizing]);

	const startResize = (event: React.MouseEvent<HTMLDivElement>) => {
		if (state.isFocusMode) {
			return;
		}

		event.preventDefault();
		resizeStartXRef.current = event.clientX;
		resizeStartWidthRef.current = editorWidthDraftRef.current;
		setIsResizing(true);
	};

	const startAiPanelResize = (event: React.MouseEvent<HTMLDivElement>) => {
		event.preventDefault();
		aiPanelResizeStartXRef.current = event.clientX;
		aiPanelResizeStartWidthRef.current = aiPanelWidthDraftRef.current;
		setIsAiPanelResizing(true);
	};

	const handleAppendAiContent = useCallback((markdown: string) => {
		return editorRef.current?.appendMarkdownToEnd(markdown) ?? false;
	}, []);

	const handleToggleAIPanel = useCallback(() => {
		setIsAiPanelMounted(true);
		setIsAIPanelOpen((previous) => !previous);
	}, []);

	const handleToggleFocusMode = useCallback(() => {
		if (!isDesktopScreen) {
			return;
		}

		toggleFocusMode();
	}, [isDesktopScreen, toggleFocusMode]);

	const handleCloseAIPanel = useCallback(() => {
		setIsAIPanelOpen(false);
	}, []);

	useEffect(() => {
		if (!state.isFocusMode) {
			if (typeof document !== "undefined" && document.fullscreenElement) {
				void document.exitFullscreen().catch((error) => {
					console.error("Failed to exit fullscreen after leaving focus mode", error);
				});
			}

			return;
		}

		setIsAIPanelOpen(false);

		if (focusModeRootRef.current && typeof document !== "undefined" && !document.fullscreenElement) {
			void focusModeRootRef.current.requestFullscreen().catch((error) => {
				console.error("Failed to enter fullscreen for focus mode", error);
			});
		}
	}, [state.isFocusMode]);

	useEffect(() => {
		const updateDesktopScreenState = () => {
			setIsDesktopScreen(window.innerWidth >= 1024);
			setIsMobileScreen(window.innerWidth < 768);
		};

		updateDesktopScreenState();
		window.addEventListener("resize", updateDesktopScreenState);
		return () => window.removeEventListener("resize", updateDesktopScreenState);
	}, []);

	useEffect(() => {
		const handleGlobalUndoRedo = (event: KeyboardEvent) => {
			if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) {
				return;
			}

			const key = event.key.toLowerCase();
			const isUndoShortcut = key === "z" && !event.shiftKey;
			const isRedoShortcut = (key === "z" && event.shiftKey) || key === "y";
			if (!isUndoShortcut && !isRedoShortcut) {
				return;
			}

			if (isTextEntryElement(event.target)) {
				return;
			}

			const editor = editorRef.current;
			if (!editor) {
				return;
			}

			if (isUndoShortcut && !editor.canUndo()) {
				return;
			}

			if (isRedoShortcut && !editor.canRedo()) {
				return;
			}

			event.preventDefault();
			event.stopImmediatePropagation();

			if (isUndoShortcut) {
				editor.undo();
				return;
			}

			editor.redo();
		};

		window.addEventListener("keydown", handleGlobalUndoRedo, true);
		return () => {
			window.removeEventListener("keydown", handleGlobalUndoRedo, true);
		};
	}, []);

	const handleCanvasPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
		if (!shouldStartCanvasMarquee(event)) {
			return;
		}

		event.preventDefault();
		marqueeSelectionKeyRef.current = "";
		marqueePointerRef.current = { clientX: event.clientX, clientY: event.clientY };
		editorRef.current?.beginBlockSelection(event.clientX, event.clientY);
		const initial = {
			startX: event.clientX,
			startY: event.clientY,
			currentX: event.clientX,
			currentY: event.clientY,
		};
		marqueeSelectionRef.current = initial;
		setMarqueeSelection(initial);
		setIsMarqueeActive(true);
	}, []);

	useEffect(() => {
		if (!isMarqueeActive) {
			return;
		}

		const edgeThreshold = 72;
		const maxScrollStep = 28;

		const commitSelection = (selection: MarqueeSelection) => {
			marqueeSelectionRef.current = selection;
			const nextSelectionKey = `${selection.startX}:${selection.startY}:${selection.currentX}:${selection.currentY}`;
			if (marqueeSelectionKeyRef.current !== nextSelectionKey) {
				marqueeSelectionKeyRef.current = nextSelectionKey;
				setMarqueeSelection(selection);
			}
			editorRef.current?.updateBlockSelection(selection.currentX, selection.currentY);
		};

		const scheduleSelectionCommit = (selection: MarqueeSelection) => {
			if (marqueeSelectionFrameRef.current !== null) {
				cancelAnimationFrame(marqueeSelectionFrameRef.current);
			}

			marqueeSelectionFrameRef.current = window.requestAnimationFrame(() => {
				marqueeSelectionFrameRef.current = null;
				commitSelection(selection);
			});
		};

		const handlePointerMove = (event: PointerEvent) => {
			marqueePointerRef.current = { clientX: event.clientX, clientY: event.clientY };
			const current = marqueeSelectionRef.current;
			if (!current) return;

			scheduleSelectionCommit({
				...current,
				currentX: event.clientX,
				currentY: event.clientY,
			});
		};

		const handlePointerEnd = () => {
			marqueeSelectionRef.current = null;
			marqueePointerRef.current = null;
			marqueeSelectionKeyRef.current = "";
			if (marqueeSelectionFrameRef.current !== null) {
				cancelAnimationFrame(marqueeSelectionFrameRef.current);
				marqueeSelectionFrameRef.current = null;
			}
			if (marqueeAutoScrollFrameRef.current !== null) {
				cancelAnimationFrame(marqueeAutoScrollFrameRef.current);
				marqueeAutoScrollFrameRef.current = null;
			}
			setMarqueeSelection(null);
			setIsMarqueeActive(false);
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerEnd, { once: true });
		window.addEventListener("pointercancel", handlePointerEnd, { once: true });

		const handleScroll = () => {
			const sel = marqueeSelectionRef.current;
			if (sel) {
				editorRef.current?.updateBlockSelection(sel.currentX, sel.currentY, "scroll");
			}
		};

		const autoScrollSelection = () => {
			const selection = marqueeSelectionRef.current;
			const pointer = marqueePointerRef.current;
			const scrollContainer = mainScrollRef.current;

			if (selection && pointer && scrollContainer) {
				const containerRect = scrollContainer.getBoundingClientRect();
				let scrollDelta = 0;

				if (pointer.clientY < containerRect.top + edgeThreshold) {
					const distance = Math.max(0, containerRect.top + edgeThreshold - pointer.clientY);
					scrollDelta = -Math.max(4, Math.round((distance / edgeThreshold) * maxScrollStep));
				} else if (pointer.clientY > containerRect.bottom - edgeThreshold) {
					const distance = Math.max(0, pointer.clientY - (containerRect.bottom - edgeThreshold));
					scrollDelta = Math.max(4, Math.round((distance / edgeThreshold) * maxScrollStep));
				}

				if (scrollDelta !== 0) {
					scrollContainer.scrollBy({ top: scrollDelta, behavior: "auto" });
					editorRef.current?.updateBlockSelection(pointer.clientX, pointer.clientY, "scroll");
				}
			}

			marqueeAutoScrollFrameRef.current = window.requestAnimationFrame(autoScrollSelection);
		};

		const scrollContainer = mainScrollRef.current;
		scrollContainer?.addEventListener("scroll", handleScroll, { passive: true });
		marqueeAutoScrollFrameRef.current = window.requestAnimationFrame(autoScrollSelection);

		return () => {
			if (marqueeSelectionFrameRef.current !== null) {
				cancelAnimationFrame(marqueeSelectionFrameRef.current);
				marqueeSelectionFrameRef.current = null;
			}
			if (marqueeAutoScrollFrameRef.current !== null) {
				cancelAnimationFrame(marqueeAutoScrollFrameRef.current);
				marqueeAutoScrollFrameRef.current = null;
			}
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerEnd);
			window.removeEventListener("pointercancel", handlePointerEnd);
			scrollContainer?.removeEventListener("scroll", handleScroll);
		};
	}, [isMarqueeActive]);

	if (!note) {
		return <LoadingContentSkeleton workspaceName={workspaceName} />;
	}

	const isNoteHydrating = loading && Boolean(note);
	const marqueeRect = marqueeSelection ? getRectFromMarquee(marqueeSelection) : null;
	const breadcrumbSegments = buildBreadcrumbSegments(note);

	return (
		<div
			ref={focusModeRootRef}
			className={`flex flex-1 overflow-hidden fade-in ${state.isFocusMode ? "stacknote-focus-mode" : ""}`}
			style={{
				backgroundColor: "var(--bg-app)",
				transform: "none",
				transition: "none",
				willChange: "auto",
			}}>
			{/* Main editor area */}
			<div ref={mainScrollRef} className="stacknote-mobile-bottom-space flex flex-1 flex-col overflow-y-auto" style={{}}>
				{/* Note header bar */}
				<ScrollRevealBar
					revealOnScroll={false}
					className="flex h-9 shrink-0 items-center justify-between bg-[var(--bg-app)] px-4"
					style={{ borderBottom: "1px solid var(--border-default)" }}>
					<div className="flex items-center gap-2">
						{!isSidebarOpen && (
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										onClick={onToggleSidebar}
										className="flex h-6 w-6 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 hover:bg-[#1a1a1a]"
										aria-label="Open sidebar">
										<PanelLeftOpen className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
									</button>
								</TooltipTrigger>
								<TooltipContent>Open sidebar</TooltipContent>
							</Tooltip>
						)}
						<div className="flex items-center gap-1 text-xs min-w-0" style={{ color: "var(--text-tertiary)" }}>
							<div
								className="min-w-0"
								style={{
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
									display: "inline-block",
									maxWidth: "calc(100vw - 280px)",
								}}>
								<Breadcrumb segments={breadcrumbSegments} />
							</div>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<SaveIndicator status={saveStatus} />
						{!isMobileScreen && (
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										onClick={openVersionsDialog}
										disabled={state.isFocusMode}
										className={`flex h-6 items-center gap-1 rounded-[var(--sn-radius-sm)] px-2 text-xs transition-colors duration-150 ${state.isFocusMode ? "cursor-not-allowed opacity-40" : "hover:bg-[#1a1a1a]"}`}
										aria-label={state.isFocusMode ? "History is disabled in focus mode" : "View note history"}>
										<History className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />
										<span style={{ color: "var(--text-tertiary)" }}>History</span>
									</button>
								</TooltipTrigger>
								<TooltipContent>{state.isFocusMode ? "History is disabled in focus mode" : "View note history"}</TooltipContent>
							</Tooltip>
						)}
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => editorRef.current?.undo()}
									disabled={!canUndo}
									aria-label="Undo"
									className="flex h-6 w-6 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 hover:bg-[#1a1a1a] disabled:opacity-30">
									<Undo2 className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />
								</button>
							</TooltipTrigger>
							<TooltipContent>Undo</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => editorRef.current?.redo()}
									disabled={!canRedo}
									aria-label="Redo"
									className="flex h-6 w-6 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 hover:bg-[#1a1a1a] disabled:opacity-30">
									<Redo2 className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />
								</button>
							</TooltipTrigger>
							<TooltipContent>Redo</TooltipContent>
						</Tooltip>
						{isDesktopScreen ? (
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										onClick={handleToggleFocusMode}
										className={`flex h-6 w-6 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 ${state.isFocusMode ? "bg-[#1a1a1a]" : "hover:bg-[#1a1a1a]"}`}
										aria-label={state.isFocusMode ? "Exit focus mode" : "Focus mode"}
										aria-pressed={state.isFocusMode}>
										<Brain className="h-3.5 w-3.5" style={{ color: state.isFocusMode ? "var(--sn-accent)" : "var(--text-tertiary)" }} />
									</button>
								</TooltipTrigger>
								<TooltipContent>{state.isFocusMode ? "Exit focus mode" : "Focus mode"}</TooltipContent>
							</Tooltip>
						) : null}
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={handleToggleAIPanel}
									disabled={state.isFocusMode}
									className={`flex h-6 items-center gap-1 rounded-[var(--sn-radius-sm)] px-2 text-xs transition-colors duration-150 ${state.isFocusMode ? "cursor-not-allowed opacity-40" : isAIPanelOpen ? "bg-[#1a1a1a]" : "hover:bg-[#1a1a1a]"}`}
									aria-label={state.isFocusMode ? "AI Assistant is disabled in focus mode" : "AI Assistant"}>
									<Sparkles
										className="h-3.5 w-3.5"
										style={{
											color: state.isFocusMode ? "var(--text-tertiary)" : isAIPanelOpen ? "var(--sn-accent)" : "var(--text-tertiary)",
										}}
									/>
									<span
										style={{
											color: state.isFocusMode ? "var(--text-tertiary)" : isAIPanelOpen ? "var(--sn-accent)" : "var(--text-tertiary)",
										}}>
										AI
									</span>
								</button>
							</TooltipTrigger>
							<TooltipContent>{state.isFocusMode ? "AI Assistant is disabled in focus mode" : "AI Assistant"}</TooltipContent>
						</Tooltip>
						<NoteActionsMenu
							type="note"
							align="end"
							disabled={state.isFocusMode}
							onChangeIcon={() => setEmojiPickerOpen(true)}
							onViewHistory={isMobileScreen ? openVersionsDialog : undefined}
							onDuplicate={handleDuplicate}
							onSaveVersion={() => void handleManualVersion()}
							saveVersionDisabled={isCreatingManualVersion || !isOnline}
							saveVersionLabel={isCreatingManualVersion ? "Saving..." : "Save version"}
							onDelete={handleDelete}
						/>
					</div>
				</ScrollRevealBar>

				{/* Note content */}
				<div
					className="mx-auto w-full flex-1 px-6 py-8"
					style={{ maxWidth: "100%", userSelect: marqueeSelection ? "none" : undefined }}
					onPointerDown={handleCanvasPointerDown}>
					<NoteCoverPanel
						noteId={note.id}
						coverImage={note.coverImage}
						coverImageMeta={note.coverImageMeta}
						onCoverUpdated={handleCoverUpdated}
						disabled={state.isFocusMode}
					/>

					{/* Emoji icon & title row */}
					<div className="mb-2 flex items-start gap-3" style={{ pointerEvents: state.isFocusMode ? "none" : undefined }}>
						{/* Emoji selector button */}
						<div ref={emojiWrapperRef} className="relative mt-1 shrink-0">
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										onClick={() => setEmojiPickerOpen((v) => !v)}
										className="flex h-10 w-10 items-center justify-center rounded-[var(--sn-radius-md)] text-xl transition-colors duration-150 hover:bg-[#1a1a1a]"
										aria-label="Change icon">
										{note.emoji ? <span>{note.emoji}</span> : <FileText className="h-5 w-5" style={{ color: "var(--text-tertiary)" }} />}
									</button>
								</TooltipTrigger>
								<TooltipContent>Change icon</TooltipContent>
							</Tooltip>

							{/* Emoji picker popup */}
							{emojiPickerOpen && (
								<div
									className="absolute left-0 top-12 z-50 w-[390px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[var(--sn-radius-lg)] dropdown-enter"
									style={{
										backgroundColor: "var(--bg-hover)",
										border: "1px solid var(--border-strong)",
										boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
									}}>
									<div className="border-b px-3 py-2" style={{ borderColor: "var(--border-strong)" }}>
										<div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--text-tertiary)" }}>
											Search emojis
										</div>
									</div>
									<div className="p-2">
										<EmojiPickerClient onEmojiClick={handleEmojiPickerClick} />
									</div>
									{note.emoji && (
										<div className="border-t px-2 py-1" style={{ borderColor: "var(--border-strong)" }}>
											<button
												onClick={() => handleEmojiChange(null)}
												className="w-full rounded py-1 text-xs transition-colors duration-100 hover:bg-[#1f1f1f]"
												style={{ color: "var(--text-tertiary)" }}>
												Remove icon
											</button>
										</div>
									)}
								</div>
							)}
						</div>

						<div className="min-w-0 flex-1">
							<NoteTitle initialTitle={note.title} onSave={handleSaveTitle} autoFocus={isNewNote} />
							<div className="mt-1 flex flex-wrap items-center gap-3 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
								<div className="flex items-center gap-1">
									<CalendarClock className="h-3 w-3" />
									<span>Created {new Date(note.createdAt).toLocaleString()}</span>
								</div>
								<div className="flex items-center gap-1">
									<Clock3 className="h-3 w-3" />
									<span>Last edited {new Date(note.updatedAt).toLocaleString()}</span>
								</div>
							</div>
						</div>
					</div>

					<div
						ref={editorShellRef}
						className="group relative mt-6 mx-auto stacknote-editor-shell"
						style={{
							width: `${editorWidth}px`,
							maxWidth: "100%",
							transition: "width 220ms cubic-bezier(0.22, 1, 0.36, 1), transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
							willChange: "width",
							transform: state.isFocusMode ? "translateY(-2px)" : "translateY(0)",
						}}>
						{isNoteHydrating ? (
							<EditorSkeleton />
						) : (
							<LazyNoteEditor
								key={`${note.id}:${editorResetToken}`}
								ref={editorRef}
								workspaceId={workspaceId}
								noteId={note.id}
								initialContent={note.content}
								onContentChange={handleContentChange}
								onSave={handleSaveContent}
							/>
						)}
						<div
							onMouseDown={state.isFocusMode ? undefined : startResize}
							className="absolute bottom-0 right-[-3px] top-0 z-20 w-3 cursor-ew-resize rounded duration-150"
							style={{
								backgroundColor: isResizing ? "rgba(124, 106, 255, 0.2)" : "transparent",
								opacity: state.isFocusMode ? 0 : isResizing ? 1 : undefined,
								pointerEvents: state.isFocusMode ? "none" : undefined,
							}}
							onMouseEnter={(e) => {
								if (!isResizing && !state.isFocusMode) {
									(e.currentTarget as HTMLElement).style.backgroundColor = "rgba(124, 106, 255, 0.16)";
								}
							}}
							onMouseLeave={(e) => {
								if (!isResizing && !state.isFocusMode) {
									(e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
								}
							}}
						/>
					</div>
				</div>

				<NoteVersionsDialogClient
					open={versionsOpen}
					currentContent={currentContentRef.current ?? note.content}
					currentTitle={note.title}
					currentEmoji={note.emoji ?? null}
					currentCoverImage={note.coverImage}
					currentCoverImageMeta={note.coverImageMeta}
					currentVersionId={null}
					versions={versions}
					loading={versionsLoading}
					previewVersionId={previewVersionId}
					previewVersion={previewVersion}
					previewLoading={previewLoading}
					restoringVersionId={restoringVersionId}
					onClose={() => setVersionsOpen(false)}
					onRefresh={() => {
						if (note.id) {
							void fetchVersions(note.id);
						}
					}}
					onPreview={handlePreviewVersion}
					onRestore={handleRestoreVersion}
				/>
			</div>

			{/* AI Side Panel */}
			{isAiPanelMounted ? (
				<div
					ref={aiPanelRef}
					aria-hidden={!isAIPanelOpen}
					className="relative h-full shrink-0 overflow-hidden"
					style={{
						pointerEvents: isAIPanelOpen ? undefined : "none",
						backgroundColor: "var(--bg-sidebar)",
						width:
							typeof window !== "undefined" && window.innerWidth < 768 ? (isAIPanelOpen ? "100%" : 0) : isAIPanelOpen ? `${aiPanelWidth}px` : 0,
						opacity: isAIPanelOpen ? 1 : 0,
						transform: "none",
						transition: isAiPanelResizing ? "none" : "width 220ms ease, opacity 160ms linear",
					}}>
					<div
						onMouseDown={startAiPanelResize}
						className={`${isAIPanelOpen ? "md:block" : "hidden"} absolute bottom-0 left-[-3px] top-0 z-30 w-3 cursor-ew-resize rounded duration-150`}
						style={{
							backgroundColor: isAiPanelResizing ? "rgba(124, 106, 255, 0.2)" : "transparent",
						}}
						onMouseEnter={(e) => {
							if (!isAiPanelResizing) {
								(e.currentTarget as HTMLElement).style.backgroundColor = "rgba(124, 106, 255, 0.16)";
							}
						}}
						onMouseLeave={(e) => {
							if (!isAiPanelResizing) {
								(e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
							}
						}}
					/>
					<Suspense fallback={<AIPanelSkeleton />}>
						<AISidePanelClient
							workspaceId={workspaceId}
							noteId={note.id}
							noteTitle={note.title}
							noteContent={currentContentRef.current ?? note.content}
							onAppendToNote={handleAppendAiContent}
							isOpen={isAIPanelOpen}
							onClose={handleCloseAIPanel}
						/>
					</Suspense>
				</div>
			) : null}

			{marqueeRect && (
				<div
					className="pointer-events-none fixed z-40 stacknote-editor-selection-marquee"
					style={{
						left: marqueeRect.left,
						top: marqueeRect.top,
						width: marqueeRect.width,
						height: marqueeRect.height,
					}}
				/>
			)}
		</div>
	);
}
