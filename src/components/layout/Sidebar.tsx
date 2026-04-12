"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	DndContext,
	MouseSensor,
	TouchSensor,
	closestCenter,
	useDroppable,
	useSensor,
	useSensors,
	type DragEndEvent,
	type DragMoveEvent,
	type DragOverEvent,
	type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FilePlus, FolderPlus, Search, Home, ChevronDown, LogOut, PanelLeftClose, CalendarDays, Settings, Trash2 } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";
import { toast } from "sonner";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SidebarItem } from "./SidebarItem";
import { NoteIconPickerDialog } from "./NoteIconPickerDialog";
import { signOutAction } from "@/app/actions";
import { fetchJson } from "@/lib/api-client";
import { fetchNote } from "@/lib/note-client";
import { buildFolderDepthMap, canCreateFolderUnderParent } from "@/lib/folder-depth";
import { queryKeys } from "@/lib/query-keys";
import { updateNoteInTree } from "@/lib/tree-helpers";
import {
	applyWorkspaceTreeReorder,
	collectWorkspaceTreeEntries,
	flattenWorkspaceFolders,
	sortWorkspaceRootNotes,
	type WorkspaceDraggableItem,
	type WorkspaceDropTarget,
	type WorkspaceReorderPayload,
} from "@/lib/workspace-tree-view";
import type { FolderTreeItem, NoteTreeItem, WorkspaceTree } from "@/types";
import type { TrashListResponse } from "@/types/trash";

type OptimisticResult = Promise<{ id: string } | null | void>;
type AsyncResult = Promise<void | null>;

interface SidebarProps {
	workspaceId: string;
	workspaceName: string;
	userEmail: string;
	userName: string;
	isGoogleUser: boolean;
	isGuestUser: boolean;
	tree: WorkspaceTree;
	onRefresh: () => void;
	onSearchOpen: () => void;
	onSettingsOpen: () => void;
	onTrashOpen: () => void;
	onCreateNote?: (folderId?: string) => OptimisticResult;
	onCreateFolder?: (parentId?: string) => OptimisticResult;
	onDeleteNote?: (noteId: string) => AsyncResult;
	onDeleteFolder?: (folderId: string) => AsyncResult;
	onRenameNote?: (noteId: string, title: string) => AsyncResult;
	onRenameFolder?: (folderId: string, name: string) => AsyncResult;
	onMoveNote?: (noteId: string, folderId: string | null) => AsyncResult;
	onMoveFolder?: (folderId: string, parentId: string | null) => AsyncResult;
	onReorderTree?: (nextTree: WorkspaceTree, payload: WorkspaceReorderPayload) => AsyncResult;
	onFolderVisited?: (folderId: string | null) => void;
	isSettingsOpen?: boolean;
	isTrashOpen?: boolean;
}

const ROOT_DROP_ID = "sidebar-root-drop-zone";
const DRAG_SCROLL_EDGE_PX = 48;
const DRAG_SCROLL_STEP_PX = 24;
const TREE_INDENT_PX = 12;
const ROW_BASE_PADDING_PX = 8;
const TRASH_LAST_SEEN_STORAGE_PREFIX = "stacknote:trash-last-seen:";

function getGuideOffset(depth: number) {
	return ROW_BASE_PADDING_PX + depth * TREE_INDENT_PX - 10;
}

function SortableSidebarRow({
	id,
	children,
}: {
	id: string;
	children: (props: {
		attributes: ReturnType<typeof useSortable>["attributes"];
		listeners: ReturnType<typeof useSortable>["listeners"];
		isDragging: boolean;
	}) => ReactNode;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
	const style: CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div ref={setNodeRef} style={style}>
			{children({ attributes, listeners, isDragging })}
		</div>
	);
}

function RootDropZone({ active }: { active: boolean }) {
	const { isOver, setNodeRef } = useDroppable({ id: ROOT_DROP_ID, data: { kind: "root" } });

	return (
		<div
			ref={setNodeRef}
			className={`rounded-[var(--sn-radius-sm)] border border-dashed px-3 py-2 text-center text-xs transition-colors ${
				active || isOver ? "border-[#7c6aff]/80 bg-[#7c6aff]/10 text-violet-300" : "border-white/10 bg-transparent text-[#666666]"
			}`}>
			Drop here to move this item to the root level.
		</div>
	);
}

function TreeGuides({ depth, extraPadding = 0 }: { depth: number; extraPadding?: number }) {
	if (depth <= 0) {
		return null;
	}

	return (
		<div aria-hidden="true" className="pointer-events-none absolute inset-y-1 left-0">
			{Array.from({ length: depth }).map((_, index) => (
				<span key={index} className="absolute inset-y-0 w-px rounded-full bg-white/8" style={{ left: getGuideOffset(index + 1) + extraPadding }} />
			))}
			<span
				className="absolute top-1/2 h-px -translate-y-1/2 rounded-full bg-white/12"
				style={{
					left: getGuideOffset(depth) + extraPadding,
					width: 10,
				}}
			/>
		</div>
	);
}

function findNoteInTree(tree: WorkspaceTree, noteId: string): NoteTreeItem | null {
	const visitFolders = (folders: FolderTreeItem[]): NoteTreeItem | null => {
		for (const folder of folders) {
			const note = folder.notes.find((item) => item.id === noteId);
			if (note) {
				return note;
			}

			const nested = visitFolders(folder.children);
			if (nested) {
				return nested;
			}
		}

		return null;
	};

	return tree.rootNotes.find((note) => note.id === noteId) ?? visitFolders(tree.folders);
}

export function Sidebar({
	workspaceId,
	workspaceName,
	userEmail,
	userName,
	isGoogleUser,
	isGuestUser,
	tree,
	onRefresh,
	onSearchOpen,
	onSettingsOpen,
	onTrashOpen,
	isSettingsOpen = false,
	isTrashOpen = false,
	onCreateNote: onCreateNoteOptimistic,
	onCreateFolder: onCreateFolderOptimistic,
	onDeleteNote: onDeleteNoteOptimistic,
	onDeleteFolder: onDeleteFolderOptimistic,
	onRenameNote: onRenameNoteOptimistic,
	onRenameFolder: onRenameFolderOptimistic,
	onReorderTree,
	onFolderVisited,
}: SidebarProps): ReactElement {
	const queryClient = useQueryClient();
	const router = useRouter();
	const pathname = usePathname();
	const { state, setActiveNote, setSidebarOpen, toggleFolder, toggleSidebar } = useWorkspace();
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [noteIconPickerId, setNoteIconPickerId] = useState<string | null>(null);
	const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
	const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
	const [dropTarget, setDropTarget] = useState<WorkspaceDropTarget | null>(null);
	const [activeDragId, setActiveDragId] = useState<string | null>(null);
	const workspaceMenuRef = useRef<HTMLDivElement | null>(null);
	const createMenuRef = useRef<HTMLDivElement | null>(null);
	const dragItemRef = useRef<WorkspaceDraggableItem | null>(null);
	const scrollContainerRef = useRef<HTMLDivElement | null>(null);
	const shouldHighlightActiveNote = pathname.startsWith("/note/");
	const isPlannerRoute = pathname === "/planner";
	const isHomeRoute = pathname === "/";
	const sensors = useSensors(
		useSensor(MouseSensor, {
			activationConstraint: {
				distance: 6,
			},
		}),
		useSensor(TouchSensor, {
			activationConstraint: {
				delay: 450,
				tolerance: 12,
			},
		}),
	);
	const closeSidebarOnMobile = useCallback(() => {
		if (typeof window !== "undefined" && window.innerWidth < 768) {
			setSidebarOpen(false);
		}
	}, [setSidebarOpen]);

	const visibleTree = useMemo(
		() => ({
			folders: tree.folders,
			rootNotes: sortWorkspaceRootNotes(tree.rootNotes),
		}),
		[tree],
	);
	const hasVisibleItems = visibleTree.folders.length > 0 || visibleTree.rootNotes.length > 0;
	const treeEntries = useMemo(() => collectWorkspaceTreeEntries(tree), [tree]);
	const treeEntryMap = useMemo(() => new Map(treeEntries.map((entry) => [entry.id, entry])), [treeEntries]);
	const folderDepthById = useMemo(
		() =>
			buildFolderDepthMap(
				flattenWorkspaceFolders(tree.folders).map((folder) => ({
					id: folder.id,
					parentId: folder.parentId ?? null,
				})),
			),
		[tree.folders],
	);
	const canCreateFolderAtParent = useCallback((parentId: string | null) => canCreateFolderUnderParent(parentId, folderDepthById), [folderDepthById]);
	const noteIconPickerNote = useMemo(() => (noteIconPickerId ? findNoteInTree(tree, noteIconPickerId) : null), [noteIconPickerId, tree]);
	const trashStatusQuery = useQuery({
		queryKey: queryKeys.trashStatus,
		queryFn: () => fetchJson<TrashListResponse>("/api/trash?limit=1"),
		staleTime: 30_000,
	});
	const hasTrashItems = (trashStatusQuery.data?.items.length ?? 0) > 0;
	const latestTrashDeletedAt = trashStatusQuery.data?.items[0]?.deletedAt ?? null;
	const [lastSeenTrashDeletedAt, setLastSeenTrashDeletedAt] = useState<string | null>(null);
	const hasUnreadTrashItems = useMemo(() => {
		if (!hasTrashItems || !latestTrashDeletedAt) {
			return false;
		}

		if (!lastSeenTrashDeletedAt) {
			return true;
		}

		const latestMs = Date.parse(latestTrashDeletedAt);
		const seenMs = Date.parse(lastSeenTrashDeletedAt);
		if (!Number.isFinite(latestMs) || !Number.isFinite(seenMs)) {
			return latestTrashDeletedAt !== lastSeenTrashDeletedAt;
		}

		return latestMs > seenMs;
	}, [hasTrashItems, lastSeenTrashDeletedAt, latestTrashDeletedAt]);

	useEffect(() => {
		if (typeof window === "undefined" || !workspaceId) {
			return;
		}

		const stored = window.localStorage.getItem(`${TRASH_LAST_SEEN_STORAGE_PREFIX}${workspaceId}`);
		setLastSeenTrashDeletedAt(stored);
	}, [workspaceId]);

	const markTrashAsSeen = useCallback(() => {
		if (typeof window === "undefined" || !workspaceId) {
			return;
		}

		const nextSeenValue = latestTrashDeletedAt ?? new Date().toISOString();
		window.localStorage.setItem(`${TRASH_LAST_SEEN_STORAGE_PREFIX}${workspaceId}`, nextSeenValue);
		setLastSeenTrashDeletedAt(nextSeenValue);
	}, [latestTrashDeletedAt, workspaceId]);

	const handleTrashOpen = useCallback(() => {
		markTrashAsSeen();
		onTrashOpen();
	}, [markTrashAsSeen, onTrashOpen]);

	const getFolderLabel = useCallback(
		(folderId: string | null) => {
			if (!folderId) {
				return "Workspace";
			}

			return treeEntryMap.get(folderId)?.name ?? "Workspace";
		},
		[treeEntryMap],
	);

	const openNoteInWorkspace = useCallback(
		(noteId: string, folderId: string | null) => {
			setActiveNote(noteId);
			onFolderVisited?.(folderId);
			router.push(`/note/${encodeURIComponent(noteId)}`);
			closeSidebarOnMobile();
		},
		[closeSidebarOnMobile, onFolderVisited, router, setActiveNote],
	);

	const handleCreateNote = useCallback(
		async (folderId?: string) => {
			if (onCreateNoteOptimistic) {
				const newNote = await onCreateNoteOptimistic(folderId);
				if (newNote) {
					openNoteInWorkspace(newNote.id, folderId ?? null);
				}
			} else {
				const res = await fetch("/api/notes", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ workspaceId, folderId }),
				});
				if (res.ok) {
					const note = await res.json();
					onRefresh();
					openNoteInWorkspace(note.id, folderId ?? null);
				}
			}
		},
		[onCreateNoteOptimistic, onRefresh, openNoteInWorkspace, workspaceId],
	);

	const prefetchNote = useDebouncedCallback((noteId: string) => {
		if (typeof navigator !== "undefined" && !navigator.onLine) {
			return;
		}

		void queryClient.prefetchQuery({
			queryKey: queryKeys.note(noteId),
			queryFn: () => fetchNote(noteId),
			staleTime: 30_000,
		});
	}, 200);

	const handleCreateFolder = useCallback(
		async (parentId?: string) => {
			if (!canCreateFolderAtParent(parentId ?? null)) {
				return;
			}

			if (onCreateFolderOptimistic) {
				const folder = await onCreateFolderOptimistic(parentId);
				if (folder) {
					setRenamingId(folder.id);
				}
			} else {
				const res = await fetch("/api/folders", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ workspaceId, parentId, name: "New Folder" }),
				});
				if (res.ok) {
					const folder = await res.json();
					onRefresh();
					setRenamingId(folder.id);
				}
			}
		},
		[canCreateFolderAtParent, onCreateFolderOptimistic, onRefresh, workspaceId],
	);

	const handleGoHome = useCallback(() => {
		setActiveNote(null);
		onFolderVisited?.(null);
		router.push("/");
		closeSidebarOnMobile();
	}, [closeSidebarOnMobile, onFolderVisited, router, setActiveNote]);

	const handleGoPlanner = useCallback(() => {
		router.push("/planner");
		closeSidebarOnMobile();
	}, [closeSidebarOnMobile, router]);

	const handleRename = useCallback(
		async (id: string, type: "folder" | "note", newName: string) => {
			if (type === "folder" && onRenameFolderOptimistic) {
				await onRenameFolderOptimistic(id, newName);
			} else if (type === "note" && onRenameNoteOptimistic) {
				await onRenameNoteOptimistic(id, newName);
			} else {
				const endpoint = type === "folder" ? `/api/folders/${id}` : `/api/notes/${id}`;
				const body = type === "folder" ? { name: newName } : { title: newName };
				await fetch(endpoint, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				});
				onRefresh();
			}
			setRenamingId(null);
		},
		[onRefresh, onRenameFolderOptimistic, onRenameNoteOptimistic],
	);

	const handleDelete = useCallback(
		async (id: string, type: "folder" | "note") => {
			if (type === "folder" && onDeleteFolderOptimistic) {
				await onDeleteFolderOptimistic(id);
			} else if (type === "note" && onDeleteNoteOptimistic) {
				await onDeleteNoteOptimistic(id);
				await queryClient.invalidateQueries({ queryKey: queryKeys.trashStatus });
				if (state.activeNoteId === id) {
					setActiveNote(null);
					router.push("/");
				}
			} else {
				const endpoint = type === "folder" ? `/api/folders/${id}` : `/api/notes/${id}`;
				await fetch(endpoint, { method: "DELETE" });
				await queryClient.invalidateQueries({ queryKey: queryKeys.trashStatus });
				if (state.activeNoteId === id) {
					setActiveNote(null);
					router.push("/");
				}
				onRefresh();
			}
		},
		[onDeleteFolderOptimistic, onDeleteNoteOptimistic, onRefresh, router, setActiveNote, state.activeNoteId],
	);

	const handleDuplicate = useCallback(
		async (noteId: string) => {
			try {
				const res = await fetch(`/api/notes/${noteId}`);
				if (!res.ok) {
					throw new Error("Failed to load note");
				}

				const note = await res.json();
				const createRes = await fetch("/api/notes", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ workspaceId, folderId: note.folderId }),
				});
				if (!createRes.ok) {
					throw new Error("Failed to create note copy");
				}

				const newNote = await createRes.json();
				const patchRes = await fetch(`/api/notes/${newNote.id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						title: `${note.title} (copy)`,
						content: note.content,
					}),
				});

				if (!patchRes.ok) {
					throw new Error("Failed to finish duplication");
				}

				onRefresh();
				toast.success("Note duplicated");
			} catch (error) {
				console.error("Failed to duplicate note", error);
				toast.error("Failed to duplicate");
			}
		},
		[onRefresh, workspaceId],
	);

	const handleChangeNoteIcon = useCallback(
		async (noteId: string, emoji: string | null) => {
			const treeKey = queryKeys.workspaceTree(workspaceId);
			const previousTree = queryClient.getQueryData<WorkspaceTree>(treeKey) ?? tree;

			queryClient.setQueryData<WorkspaceTree>(treeKey, (currentTree) => updateNoteInTree(currentTree ?? previousTree, noteId, { emoji }));

			try {
				await fetchJson(`/api/notes/${noteId}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ emoji }),
				});

				onRefresh();
				toast.success("Icon updated");
			} catch (error) {
				console.error("Failed to update note icon", error);
				queryClient.setQueryData(treeKey, previousTree);
				toast.error("Failed to update icon");
			}
		},
		[onRefresh, queryClient, tree, workspaceId],
	);

	const handleContextMenu = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
	}, []);

	useEffect(() => {
		return () => {
			prefetchNote.cancel();
		};
	}, [prefetchNote]);

	useEffect(() => {
		if (!isWorkspaceMenuOpen) {
			return;
		}

		const handlePointerDown = (event: MouseEvent) => {
			if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(event.target as Node)) {
				setIsWorkspaceMenuOpen(false);
			}
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setIsWorkspaceMenuOpen(false);
			}
		};

		window.addEventListener("mousedown", handlePointerDown);
		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("mousedown", handlePointerDown);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [isWorkspaceMenuOpen]);

	useEffect(() => {
		if (!isCreateMenuOpen) {
			return;
		}

		const handlePointerDown = (event: MouseEvent) => {
			if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
				setIsCreateMenuOpen(false);
			}
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setIsCreateMenuOpen(false);
			}
		};

		window.addEventListener("mousedown", handlePointerDown);
		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("mousedown", handlePointerDown);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [isCreateMenuOpen]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "n") {
				e.preventDefault();
				void handleCreateNote();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [handleCreateNote]);

	const clearDragState = useCallback(() => {
		dragItemRef.current = null;
		setActiveDragId(null);
		setDropTarget(null);
	}, []);

	const getActiveDragItem = useCallback(
		() =>
			dragItemRef.current ??
			(activeDragId
				? ({
						id: activeDragId,
						type: treeEntryMap.get(activeDragId)?.type ?? "note",
						parentId: treeEntryMap.get(activeDragId)?.parentId ?? null,
					} satisfies WorkspaceDraggableItem)
				: null),
		[activeDragId, treeEntryMap],
	);

	const getFolderDropTarget = useCallback(
		(activeDragItem: WorkspaceDraggableItem | null, folder: FolderTreeItem, relativeY: number): WorkspaceDropTarget | null => {
			if (!activeDragItem || activeDragItem.id === folder.id) {
				return null;
			}

			const inCenterBand = relativeY >= 0.28 && relativeY <= 0.72;

			if (activeDragItem.type === "note") {
				if (!inCenterBand) {
					return null;
				}

				return { kind: "folder", folderId: folder.id, parentId: folder.parentId ?? null, mode: "inside" };
			}

			return {
				kind: "folder",
				folderId: folder.id,
				parentId: folder.parentId ?? null,
				mode: relativeY < 0.5 ? "before" : "after",
			};
		},
		[],
	);

	const getNoteDropTarget = useCallback(
		(activeDragItem: WorkspaceDraggableItem | null, note: NoteTreeItem, relativeY: number): WorkspaceDropTarget | null => {
			if (!activeDragItem || activeDragItem.type !== "note" || activeDragItem.id === note.id) {
				return null;
			}

			return {
				kind: "note",
				noteId: note.id,
				parentId: note.folderId ?? null,
				mode: relativeY < 0.5 ? "before" : "after",
			};
		},
		[],
	);

	const getRelativeYForOverItem = useCallback((event: DragOverEvent | DragEndEvent) => {
		if (!event.over?.rect || !event.active.rect.current.translated) {
			return 0.5;
		}

		const translated = event.active.rect.current.translated;
		const centerY = translated.top + translated.height / 2;
		return Math.min(1, Math.max(0, (centerY - event.over.rect.top) / Math.max(1, event.over.rect.height)));
	}, []);

	const resolveDropTarget = useCallback(
		(event: DragOverEvent | DragEndEvent): WorkspaceDropTarget | null => {
			const activeDragItem = getActiveDragItem();
			if (!activeDragItem || !event.over) {
				return null;
			}

			if (event.over.id === ROOT_DROP_ID) {
				return { kind: "root" };
			}

			const overItem = treeEntryMap.get(String(event.over.id));
			if (!overItem) {
				return null;
			}

			const relativeY = getRelativeYForOverItem(event);
			if (overItem.type === "folder") {
				return getFolderDropTarget(
					activeDragItem,
					{
						id: overItem.id,
						name: overItem.name,
						parentId: overItem.parentId,
						type: "folder",
						children: [],
						notes: [],
					},
					relativeY,
				);
			}

			return getNoteDropTarget(
				activeDragItem,
				{
					id: overItem.id,
					title: overItem.name,
					folderId: overItem.parentId,
					files: [],
					type: "note",
				},
				relativeY,
			);
		},
		[getActiveDragItem, getFolderDropTarget, getNoteDropTarget, getRelativeYForOverItem, treeEntryMap],
	);

	const applyDrop = useCallback(
		async (target: WorkspaceDropTarget) => {
			const activeDragItem = getActiveDragItem();
			if (!activeDragItem) {
				return;
			}

			const reordered = applyWorkspaceTreeReorder(tree, activeDragItem, target);
			clearDragState();
			if (!reordered) {
				return;
			}

			const destinationLabel =
				target.kind === "root"
					? "Workspace"
					: target.kind === "folder" && target.mode === "inside"
						? (treeEntryMap.get(target.folderId)?.name ?? "Workspace")
						: getFolderLabel(target.kind === "note" ? target.parentId : (target.parentId ?? null));

			try {
				if (onReorderTree) {
					await onReorderTree(reordered.tree, reordered.payload);
				} else {
					await fetch(`/api/workspace/${workspaceId}/reorder`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(reordered.payload),
					});
					onRefresh();
				}
				toast.success(`Moved to ${destinationLabel}`);
			} catch (error) {
				console.error("Failed to persist sidebar tree reorder", error);
				toast.error("Failed to move item");
				await onRefresh();
			}
		},
		[clearDragState, getActiveDragItem, getFolderLabel, onRefresh, onReorderTree, tree, treeEntryMap, workspaceId],
	);

	const isDropTargetActive = useCallback(
		(target: WorkspaceDropTarget) => {
			if (!dropTarget || target.kind !== dropTarget.kind) {
				return false;
			}

			if (target.kind === "root") {
				return true;
			}

			if (target.kind === "folder" && dropTarget.kind === "folder") {
				return target.folderId === dropTarget.folderId && target.mode === dropTarget.mode;
			}

			if (target.kind === "note" && dropTarget.kind === "note") {
				return target.noteId === dropTarget.noteId && target.mode === dropTarget.mode;
			}

			return false;
		},
		[dropTarget],
	);

	const handleDragStart = useCallback(
		(event: DragStartEvent) => {
			const activeId = String(event.active.id);
			const activeItem = treeEntryMap.get(activeId);
			if (!activeItem) {
				return;
			}

			dragItemRef.current = { id: activeItem.id, type: activeItem.type, parentId: activeItem.parentId };
			setActiveDragId(activeItem.id);
		},
		[treeEntryMap],
	);

	const handleDragOver = useCallback(
		(event: DragOverEvent) => {
			setDropTarget(resolveDropTarget(event));
		},
		[resolveDropTarget],
	);

	const handleDragMove = useCallback((event: DragMoveEvent) => {
		const container = scrollContainerRef.current;
		const translated = event.active.rect.current.translated;
		if (!container || !translated) {
			return;
		}

		const containerRect = container.getBoundingClientRect();
		const pointerY = translated.top + translated.height / 2;

		if (pointerY < containerRect.top + DRAG_SCROLL_EDGE_PX) {
			container.scrollTop = Math.max(0, container.scrollTop - DRAG_SCROLL_STEP_PX);
			return;
		}

		if (pointerY > containerRect.bottom - DRAG_SCROLL_EDGE_PX) {
			const maxScrollTop = container.scrollHeight - container.clientHeight;
			container.scrollTop = Math.min(maxScrollTop, container.scrollTop + DRAG_SCROLL_STEP_PX);
		}
	}, []);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const target = resolveDropTarget(event) ?? dropTarget;
			if (!target) {
				clearDragState();
				return;
			}

			void applyDrop(target);
		},
		[applyDrop, clearDragState, dropTarget, resolveDropTarget],
	);

	const renderNotes = useCallback(
		(notes: NoteTreeItem[], depth: number, parentFolderId: string | null) => {
			const sortedNotes = sortWorkspaceRootNotes(notes);
			return sortedNotes.map((note) => {
				const beforeTarget: WorkspaceDropTarget = { kind: "note", noteId: note.id, parentId: note.folderId ?? parentFolderId, mode: "before" };
				const afterTarget: WorkspaceDropTarget = { kind: "note", noteId: note.id, parentId: note.folderId ?? parentFolderId, mode: "after" };
				const isBeforeActive = isDropTargetActive(beforeTarget);
				const isAfterActive = isDropTargetActive(afterTarget);

				return (
					<SortableSidebarRow key={note.id} id={note.id}>
						{({ attributes, listeners, isDragging }) => (
							<div className="relative">
								<TreeGuides depth={depth} />
								<div
									className={`pointer-events-none absolute inset-x-2 top-0 h-0.5 bg-[#7c6aff] transition-opacity ${isBeforeActive ? "opacity-100" : "opacity-0"}`}
								/>
								<div
									className={`pointer-events-none absolute inset-x-2 bottom-0 h-0.5 bg-[#7c6aff] transition-opacity ${isAfterActive ? "opacity-100" : "opacity-0"}`}
								/>
								<div {...attributes} {...listeners} className={isDragging ? "opacity-50" : undefined} style={{ touchAction: "pan-y" }}>
									<SidebarItem
										id={note.id}
										name={note.title}
										type="note"
										emoji={note.emoji}
										depth={depth}
										isActive={shouldHighlightActiveNote && state.activeNoteId === note.id}
										isRenaming={renamingId === note.id}
										onMouseEnter={() => prefetchNote(note.id)}
										onClick={() => openNoteInWorkspace(note.id, parentFolderId)}
										onContextMenu={handleContextMenu}
										onRename={(name) => void handleRename(note.id, "note", name)}
										onCancelRename={() => setRenamingId(null)}
										onDoubleClick={() => setRenamingId(note.id)}
										menuActions={{
											onChangeIcon: () => setNoteIconPickerId(note.id),
											onRename: () => setRenamingId(note.id),
											onDuplicate: () => void handleDuplicate(note.id),
											onDelete: () => void handleDelete(note.id, "note"),
										}}
									/>
								</div>
							</div>
						)}
					</SortableSidebarRow>
				);
			});
		},
		[
			handleContextMenu,
			handleDelete,
			handleDuplicate,
			handleRename,
			isDropTargetActive,
			openNoteInWorkspace,
			prefetchNote,
			renamingId,
			shouldHighlightActiveNote,
			state.activeNoteId,
		],
	);

	const renderFolderList = useCallback(
		(folders: FolderTreeItem[], depth: number): ReactNode => {
			const sortedFolders = [...folders].sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.name.localeCompare(right.name));
			return (
				<SortableContext items={sortedFolders.map((folder) => folder.id)} strategy={verticalListSortingStrategy}>
					{sortedFolders.map((folder) => {
						const isExpanded = state.expandedFolders.has(folder.id);
						const beforeTarget: WorkspaceDropTarget = { kind: "folder", folderId: folder.id, parentId: folder.parentId ?? null, mode: "before" };
						const insideTarget: WorkspaceDropTarget = { kind: "folder", folderId: folder.id, parentId: folder.parentId ?? null, mode: "inside" };
						const afterTarget: WorkspaceDropTarget = { kind: "folder", folderId: folder.id, parentId: folder.parentId ?? null, mode: "after" };
						const isBeforeActive = isDropTargetActive(beforeTarget);
						const isInsideActive = isDropTargetActive(insideTarget);
						const isAfterActive = isDropTargetActive(afterTarget);
						const canCreateSubfolder = canCreateFolderAtParent(folder.id);
						const handleFolderVisit = () => {
							toggleFolder(folder.id);
							onFolderVisited?.(folder.id);
						};

						return (
							<SortableSidebarRow key={folder.id} id={folder.id}>
								{({ attributes, listeners, isDragging }) => (
									<div className="relative">
										<TreeGuides depth={depth} />
										<div
											className={`pointer-events-none absolute inset-x-2 top-0 h-0.5 bg-[#7c6aff] transition-opacity ${isBeforeActive ? "opacity-100" : "opacity-0"}`}
										/>
										<div
											className={`pointer-events-none absolute inset-x-2 bottom-0 h-0.5 bg-[#7c6aff] transition-opacity ${isAfterActive ? "opacity-100" : "opacity-0"}`}
										/>
										<div
											{...attributes}
											{...listeners}
											className={`${isDragging ? "opacity-50" : ""} ${isInsideActive ? "rounded-[var(--sn-radius-sm)] ring-1 ring-[#7c6aff]" : ""}`}
											style={{ touchAction: "pan-y" }}>
											<SidebarItem
												id={folder.id}
												name={folder.name}
												type="folder"
												depth={depth}
												isExpanded={isExpanded}
												isActive={false}
												isRenaming={renamingId === folder.id}
												onToggle={handleFolderVisit}
												onClick={handleFolderVisit}
												onContextMenu={handleContextMenu}
												onRename={(name) => void handleRename(folder.id, "folder", name)}
												onCancelRename={() => setRenamingId(null)}
												menuActions={{
													onRename: () => setRenamingId(folder.id),
													onDelete: () => void handleDelete(folder.id, "folder"),
													onNewNote: () => void handleCreateNote(folder.id),
													onNewFolder: () => void handleCreateFolder(folder.id),
														newFolderDisabled: !canCreateSubfolder,
												}}
											/>
										</div>
										<div
											className="folder-content overflow-hidden transition-all duration-250 ease-in-out"
											style={{
												maxHeight: isExpanded ? "2000px" : "0",
												opacity: isExpanded ? 1 : 0,
											}}>
											{renderFolderList(folder.children, depth + 1)}
											<SortableContext items={folder.notes.map((note) => note.id)} strategy={verticalListSortingStrategy}>
												{renderNotes(folder.notes, depth + 1, folder.id)}
											</SortableContext>
											{folder.children.length === 0 && folder.notes.length === 0 ? (
												<div
													className="relative overflow-hidden px-3 py-2 text-xs text-zinc-600"
													style={{ paddingLeft: `${getGuideOffset(depth + 1) + 24}px` }}>
													<TreeGuides depth={depth + 1} extraPadding={8} />
													Empty folder
												</div>
											) : null}
										</div>
									</div>
								)}
							</SortableSidebarRow>
						);
					})}
				</SortableContext>
			);
		},
		[
			canCreateFolderAtParent,
			handleContextMenu,
			handleCreateFolder,
			handleCreateNote,
			handleDelete,
			handleRename,
			isDropTargetActive,
			onFolderVisited,
			renderNotes,
			renamingId,
			state.expandedFolders,
			toggleFolder,
		],
	);

	const baseDisplayName = userName || (isGuestUser ? "Guest" : userEmail || "User");
	const providerSuffix = isGuestUser ? " (Guest)" : isGoogleUser ? " (Google)" : "";
	const displayName = `${baseDisplayName}${providerSuffix}`;
	const displayEmail = isGuestUser ? "Temporary session" : userEmail;
	const initials = displayName
		.split(" ")
		.map((w) => w[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

	return (
		<div
			className="flex h-full min-h-[100dvh] flex-col transition-all duration-300 ease-in-out"
			style={{
				width: state.sidebarWidth,
				minWidth: state.sidebarWidth,
				height: "100dvh",
				maxHeight: "100dvh",
				backgroundColor: "var(--bg-sidebar)",
				borderRight: "1px solid var(--border-default)",
			}}>
			<div className="flex h-12 items-center gap-2 px-3" style={{ borderBottom: "1px solid var(--border-default)" }}>
				<div ref={workspaceMenuRef} className="relative min-w-0 flex-1">
					<button
						id={`workspace-menu-trigger-${workspaceId}`}
						type="button"
						aria-haspopup="menu"
						aria-expanded={isWorkspaceMenuOpen}
						onClick={() => setIsWorkspaceMenuOpen((value) => !value)}
						className="flex w-full min-w-0 items-center gap-2 rounded-[var(--sn-radius-sm)] px-1 py-1 text-left transition-colors duration-150 hover:bg-[#1a1a1a]">
						<div
							className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-semibold"
							style={{ backgroundColor: "var(--accent-muted)", color: "var(--sn-accent)" }}>
							{workspaceName.slice(0, 2).toUpperCase()}
						</div>
						<span className="flex-1 truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
							{workspaceName}
						</span>
						<ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-tertiary)" }} />
					</button>

					{isWorkspaceMenuOpen && (
						<div
							role="menu"
							className="absolute left-0 top-[calc(100%+0.375rem)] z-50 min-w-[200px] rounded-lg p-1 shadow-md ring-1 ring-foreground/10 fade-in"
							style={{ backgroundColor: "var(--bg-hover)", border: "1px solid var(--border-strong)" }}>
							<div className="px-1.5 py-1">
								<div className="flex items-center gap-2">
									<div
										className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
										style={{ backgroundColor: "var(--accent-muted)", color: "var(--sn-accent)" }}>
										{initials}
									</div>
									<div className="min-w-0">
										<p className="truncate text-xs font-medium" style={{ color: "var(--text-primary)" }}>
											{displayName}
										</p>
										<p className="truncate text-xs" style={{ color: "var(--text-tertiary)" }}>
											{displayEmail}
										</p>
									</div>
								</div>
							</div>
							<div className="-mx-1 my-1 h-px bg-border" />
							<button
								type="button"
								role="menuitem"
								onClick={() => {
									setIsWorkspaceMenuOpen(false);
									// Open Account dialog via global event handled in AppShell
									if (typeof window !== "undefined") {
										window.dispatchEvent(new CustomEvent("stacknote:open-account-dialog"));
									}
									closeSidebarOnMobile();
								}}
								className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm transition-colors focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground"
								style={{ color: "var(--text-primary)" }}>
								<Settings className="h-3.5 w-3.5" />
								Account
							</button>
							<div className="-mx-1 my-1 h-px bg-border" />
							<button
								type="button"
								role="menuitem"
								onClick={async () => {
									setIsWorkspaceMenuOpen(false);
									await signOutAction();
								}}
								className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-destructive/10"
								style={{ color: "var(--text-primary)" }}>
								<LogOut className="h-3.5 w-3.5" />
								Sign out
							</button>
						</div>
					)}
				</div>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={toggleSidebar}
							className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 hover:bg-[#1a1a1a]"
							aria-label="Collapse sidebar">
							<PanelLeftClose className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
						</button>
					</TooltipTrigger>
					<TooltipContent>Collapse sidebar</TooltipContent>
				</Tooltip>
			</div>

			<div className="space-y-1 p-2">
				<button
					type="button"
					onClick={handleGoHome}
					aria-current={isHomeRoute ? "page" : undefined}
					className={`inline-flex h-8 w-full items-center justify-start gap-2 rounded-lg px-2 text-sm transition-colors duration-150 hover:bg-[#1a1a1a] hover:text-[#e8e8e8] ${isHomeRoute ? "bg-[rgba(255,255,255,0.08)] text-[#e8e8e8]" : "text-[#888888]"}`}>
					<Home className="h-4 w-4" />
					Home
				</button>
				<button
					type="button"
					className="inline-flex h-8 w-full items-center justify-start gap-2 rounded-lg px-2 text-sm text-[#888888] transition-colors duration-150 hover:bg-[#1a1a1a] hover:text-[#e8e8e8]"
					onClick={onSearchOpen}>
					<Search className="h-4 w-4" />
					Search
					<span className="ml-auto text-xs text-[#555555]">Ctrl+K</span>
				</button>
				<button
					type="button"
					onClick={handleGoPlanner}
					aria-current={isPlannerRoute ? "page" : undefined}
					className={`inline-flex h-8 w-full items-center justify-start gap-2 rounded-lg px-2 text-sm transition-colors duration-150 hover:bg-[#1a1a1a] hover:text-[#e8e8e8] ${isPlannerRoute ? "bg-[rgba(255,255,255,0.08)] text-[#e8e8e8]" : "text-[#888888]"}`}>
					<CalendarDays className="h-4 w-4" />
					Planner
				</button>
				<div ref={createMenuRef} className="relative w-full">
					<div className="flex w-full items-center gap-1">
						<button
							type="button"
							onClick={() => void handleCreateNote()}
							className="inline-flex h-8 flex-1 items-center justify-start gap-2 rounded-lg px-2 text-sm text-[#888888] transition-colors duration-150 hover:bg-[#1a1a1a] hover:text-[#e8e8e8]">
							<FilePlus className="h-4 w-4" />
							New Note
						</button>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-haspopup="menu"
									aria-expanded={isCreateMenuOpen}
									onClick={() => setIsCreateMenuOpen((value) => !value)}
									aria-label="More options"
									className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#888888] transition-colors duration-150 hover:bg-[#1a1a1a] hover:text-[#e8e8e8]">
									<ChevronDown className="h-3.5 w-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent>More options</TooltipContent>
						</Tooltip>
					</div>
					{isCreateMenuOpen ? (
						<div
							role="menu"
							className="absolute left-0 top-[calc(100%+0.375rem)] z-50 w-full rounded-lg p-1 shadow-sm ring-1 ring-white/5 fade-in"
							style={{ backgroundColor: "rgba(20,20,20,0.96)", border: "1px solid rgba(255,255,255,0.06)" }}>
							<button
								type="button"
								role="menuitem"
								disabled={!canCreateFolderAtParent(null)}
								onClick={() => {
									setIsCreateMenuOpen(false);
									void handleCreateFolder();
								}}
								className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
								style={{ color: "var(--text-primary)" }}>
								<FolderPlus className="h-4 w-4" />
								New Folder
							</button>
						</div>
					) : null}
				</div>
			</div>

			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				autoScroll={false}
				onDragStart={handleDragStart}
				onDragMove={handleDragMove}
				onDragOver={handleDragOver}
				onDragEnd={handleDragEnd}
				onDragCancel={clearDragState}>
				<div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-1 py-1 pb-[50px]">
					{hasVisibleItems ? (
						<>
							{renderFolderList(visibleTree.folders, 0)}
							{visibleTree.folders.length > 0 && visibleTree.rootNotes.length > 0 ? <div style={{ height: "8px" }} /> : null}
							<SortableContext items={visibleTree.rootNotes.map((note) => note.id)} strategy={verticalListSortingStrategy}>
								{renderNotes(visibleTree.rootNotes, 0, null)}
							</SortableContext>
						</>
					) : (
						<div className="px-3 py-6 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
							No notes yet.
						</div>
					)}
					{activeDragId ? (
						<div className="mx-1 mt-3">
							<RootDropZone active={isDropTargetActive({ kind: "root" })} />
						</div>
					) : null}
				</div>
			</DndContext>

			<div className="space-y-1 p-2" style={{ borderTop: "1px solid var(--border-default)" }}>
				<button
					type="button"
					onClick={handleTrashOpen}
					data-dock-toggle="true"
					aria-pressed={isTrashOpen}
					className={`inline-flex h-8 w-full items-center justify-start gap-2 rounded-lg px-2 text-xs transition-colors duration-150 hover:bg-[#1a1a1a] ${isTrashOpen ? "bg-[rgba(255,255,255,0.08)] text-[#e8e8e8]" : ""}`}
					style={{ color: "var(--text-secondary)" }}>
					<span className="relative inline-flex h-3.5 w-3.5 items-center justify-center">
						<Trash2 className="h-3.5 w-3.5" />
						{hasUnreadTrashItems ? <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-[#7c6aff]" aria-hidden="true" /> : null}
					</span>
					Trash
				</button>
				<button
					type="button"
					onClick={onSettingsOpen}
					data-dock-toggle="true"
					aria-pressed={isSettingsOpen}
					className={`inline-flex h-8 w-full items-center justify-start gap-2 rounded-lg px-2 text-xs transition-colors duration-150 hover:bg-[#1a1a1a] ${isSettingsOpen ? "bg-[rgba(255,255,255,0.08)] text-[#e8e8e8]" : ""}`}
					style={{ color: "var(--text-secondary)" }}>
					<Settings className="h-3.5 w-3.5" />
					Settings
				</button>
			</div>

			<NoteIconPickerDialog
				open={noteIconPickerNote !== null}
				noteTitle={noteIconPickerNote?.title ?? "Untitled"}
				emoji={noteIconPickerNote?.emoji ?? null}
				onOpenChange={(open) => {
					if (!open) {
						setNoteIconPickerId(null);
					}
				}}
				onEmojiSelect={async (emoji) => {
					if (!noteIconPickerNote) {
						return;
					}

					await handleChangeNoteIcon(noteIconPickerNote.id, emoji);
					setNoteIconPickerId(null);
				}}
			/>
		</div>
	);
}



