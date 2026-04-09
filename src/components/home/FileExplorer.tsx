"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import {
	DndContext,
	DragOverlay,
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
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Copy, FileAudio2, FileImage, FilePlus, FileText, Folder, FolderPlus, MoreHorizontal, Pencil, Smile, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchJson } from "@/lib/api-client";
import { buildFileAccessUrl } from "@/lib/file-url";
import { FOLDER_NAME_MAX_LENGTH, NAME_FORBIDDEN_CHARACTERS_REGEX, NOTE_TITLE_MAX_LENGTH } from "@/lib/item-name-validation";
import { queryKeys } from "@/lib/query-keys";
import { FilePreviewModal } from "@/components/home/FilePreviewModal";
import { NoteIconPickerDialog } from "@/components/layout/NoteIconPickerDialog";
import type { HomeFileItem, HomeFileMediaType, HomeFileTree, HomeFolderItem, HomeNoteItem } from "@/components/home/file-manager-types";
import type { WorkspaceTree } from "@/types";

const FILTERS = [
	{ id: "all", label: "All" },
	{ id: "note", label: "Notes" },
	{ id: "pdf", label: "PDFs" },
	{ id: "audio", label: "Audio" },
	{ id: "image", label: "Images" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];
type TreeItemType = "folder" | "note" | "file";
type SelectedItem = { id: string; type: TreeItemType } | null;
type EditingItem = { id: string; type: TreeItemType } | null;
type PendingDelete = { id: string; type: TreeItemType; name: string } | null;

type PreviewableFile = {
	name: string;
	url: string;
	type: "pdf" | "audio" | "image";
} | null;

type DraggableItem = {
	id: string;
	type: "folder" | "note";
	parentId: string | null;
};

type TreeEntry = {
	id: string;
	type: "folder" | "note";
	parentId: string | null;
	name: string;
	emoji: string | null;
};

type DropTarget =
	| {
			kind: "folder";
			folderId: string;
			parentId: string | null;
			mode: "inside" | "before" | "after";
	  }
	| {
			kind: "note";
			noteId: string;
			parentId: string | null;
			mode: "before" | "after";
	  }
	| {
			kind: "root";
	  };

type ReorderPayload = {
	folders: Array<{ id: string; parentId: string | null; order: number }>;
	notes: Array<{ id: string; folderId: string | null; order: number }>;
};

type FlatFolder = Omit<HomeFolderItem, "children" | "notes">;
type FlatNote = HomeNoteItem;

const ORDER_STEP = 1024;
const ROOT_DROP_ID = "root-drop-zone";
const TREE_INDENT_PX = 18;
const ROW_BASE_PADDING_PX = 12;
const FILE_EXTRA_PADDING_PX = 24;
const DRAG_SCROLL_EDGE_PX = 56;
const DRAG_SCROLL_STEP_PX = 24;
const NAME_RESTRICTED_CHARS_HINT = "Forbidden characters: \\ / : * ? \" < > | and control characters";

function getRowPaddingLeft(depth: number, extraPadding: number = 0) {
	return depth * TREE_INDENT_PX + ROW_BASE_PADDING_PX + extraPadding;
}

function getGuideOffset(depth: number) {
	return ROW_BASE_PADDING_PX + depth * TREE_INDENT_PX - 10;
}

function flattenFolders(folders: HomeFolderItem[]): FlatFolder[] {
	const result: FlatFolder[] = [];

	const visit = (items: HomeFolderItem[]) => {
		for (const folder of items) {
			result.push({
				id: folder.id,
				name: folder.name,
				parentId: folder.parentId,
				order: folder.order,
				updatedAt: folder.updatedAt,
			});
			visit(folder.children);
		}
	};

	visit(folders);
	return result;
}

function flattenNotes(tree: HomeFileTree): FlatNote[] {
	const result: FlatNote[] = [...tree.rootNotes];

	const visit = (folders: HomeFolderItem[]) => {
		for (const folder of folders) {
			result.push(...folder.notes);
			visit(folder.children);
		}
	};

	visit(tree.folders);
	return result;
}

function buildTreeFromFlatData(folders: FlatFolder[], notes: FlatNote[]): HomeFileTree {
	const sortedFolders = [...folders].sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
	const sortedNotes = [...notes].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title));

	const folderMap = new Map<string, HomeFolderItem>();
	for (const folder of sortedFolders) {
		folderMap.set(folder.id, {
			...folder,
			children: [],
			notes: [],
		});
	}

	const rootNotes: HomeNoteItem[] = [];
	for (const note of sortedNotes) {
		if (note.folderId && folderMap.has(note.folderId)) {
			folderMap.get(note.folderId)?.notes.push(note);
			continue;
		}

		rootNotes.push(note);
	}

	const rootFolders: HomeFolderItem[] = [];
	for (const folder of sortedFolders) {
		const currentFolder = folderMap.get(folder.id);
		if (!currentFolder) {
			continue;
		}

		if (folder.parentId && folderMap.has(folder.parentId)) {
			folderMap.get(folder.parentId)?.children.push(currentFolder);
			continue;
		}

		rootFolders.push(currentFolder);
	}

	return {
		folders: rootFolders,
		rootNotes,
	};
}

function toWorkspaceTree(tree: HomeFileTree): WorkspaceTree {
	const mapNotes = (notes: HomeNoteItem[]): WorkspaceTree["rootNotes"] =>
		notes.map((note) => ({
			id: note.id,
			title: note.title,
			emoji: note.emoji,
			folderId: note.folderId,
			order: note.order,
			files: note.files.map((file) => ({ id: file.id, mediaType: file.mediaType })),
			type: "note" as const,
		}));

	const mapFolders = (folders: HomeFolderItem[]): WorkspaceTree["folders"] =>
		folders.map((folder) => ({
			id: folder.id,
			name: folder.name,
			parentId: folder.parentId,
			order: folder.order,
			type: "folder" as const,
			children: mapFolders(folder.children),
			notes: mapNotes(folder.notes),
		}));

	return {
		folders: mapFolders(tree.folders),
		rootNotes: mapNotes(tree.rootNotes),
	};
}

function mergeHomeTreeWithWorkspaceTree(current: HomeFileTree, workspaceTree: WorkspaceTree): HomeFileTree {
	const now = new Date().toISOString();
	const folderById = new Map<string, HomeFolderItem>();
	const noteById = new Map<string, HomeNoteItem>();

	const collect = (folders: HomeFolderItem[]) => {
		for (const folder of folders) {
			folderById.set(folder.id, folder);
			for (const note of folder.notes) {
				noteById.set(note.id, note);
			}
			collect(folder.children);
		}
	};

	collect(current.folders);
	for (const note of current.rootNotes) {
		noteById.set(note.id, note);
	}

	const mapNotes = (notes: WorkspaceTree["rootNotes"], parentId: string | null): HomeNoteItem[] =>
		notes.map((note, index) => {
			const existing = noteById.get(note.id);
			const existingFiles = new Map((existing?.files ?? []).map((file) => [file.id, file]));
			const nextFiles = (note.files ?? []).map((file) => {
				const previousFile = existingFiles.get(file.id);
				if (previousFile) {
					return previousFile;
				}

				return {
					id: file.id,
					noteId: note.id,
					name: `Attachment ${index + 1}`,
					mediaType: file.mediaType,
					mimeType: "",
					createdAt: now,
				};
			});

			return {
				id: note.id,
				title: note.title,
				emoji: note.emoji ?? null,
				folderId: note.folderId ?? parentId,
				order: note.order ?? index * ORDER_STEP,
				updatedAt: existing?.updatedAt ?? now,
				files: nextFiles,
			};
		});

	const mapFolders = (folders: WorkspaceTree["folders"]): HomeFolderItem[] =>
		folders.map((folder, index) => {
			const existing = folderById.get(folder.id);
			return {
				id: folder.id,
				name: folder.name,
				parentId: folder.parentId ?? null,
				order: folder.order ?? index * ORDER_STEP,
				updatedAt: existing?.updatedAt ?? now,
				children: mapFolders(folder.children),
				notes: mapNotes(folder.notes, folder.id),
			};
		});

	return {
		folders: mapFolders(workspaceTree.folders),
		rootNotes: mapNotes(workspaceTree.rootNotes, null),
	};
}

function isFolderDescendant(candidateParentId: string | null, folderId: string, foldersById: Map<string, FlatFolder>) {
	let currentParentId = candidateParentId;

	while (currentParentId) {
		if (currentParentId === folderId) {
			return true;
		}

		currentParentId = foldersById.get(currentParentId)?.parentId ?? null;
	}

	return false;
}

function getDropInsertIndex(mode: "inside" | "before" | "after", targetIndex: number, listLength: number) {
	if (mode === "inside") {
		return listLength;
	}

	return mode === "before" ? targetIndex : targetIndex + 1;
}

function applyTreeReorder(tree: HomeFileTree, dragItem: DraggableItem, dropTarget: DropTarget): { tree: HomeFileTree; payload: ReorderPayload } | null {
	const folders = flattenFolders(tree.folders);
	const notes = flattenNotes(tree);
	const foldersById = new Map(folders.map((folder) => [folder.id, { ...folder }]));
	const notesById = new Map(notes.map((note) => [note.id, { ...note }]));
	const updates: ReorderPayload = {
		folders: [],
		notes: [],
	};

	const sortFolders = (items: FlatFolder[]) => [...items].sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
	const sortNotes = (items: FlatNote[]) => [...items].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title));

	if (dragItem.type === "folder") {
		const movingFolder = foldersById.get(dragItem.id);
		if (!movingFolder) {
			return null;
		}

		if (dropTarget.kind === "note") {
			return null;
		}

		const nextParentId =
			dropTarget.kind === "root"
				? null
				: dropTarget.mode === "inside"
					? dropTarget.folderId
					: dropTarget.parentId;

		if (nextParentId === movingFolder.id || isFolderDescendant(nextParentId, movingFolder.id, foldersById)) {
			return null;
		}

		const previousParentId = movingFolder.parentId;

		const destinationSiblings = sortFolders(
			Array.from(foldersById.values()).filter((folder) => folder.parentId === nextParentId && folder.id !== movingFolder.id),
		);

		let insertIndex = destinationSiblings.length;
		if (dropTarget.kind === "folder" && dropTarget.mode !== "inside") {
			const targetFolderId = dropTarget.folderId;
			const targetIndex = destinationSiblings.findIndex((folder) => folder.id === targetFolderId);
			if (targetIndex < 0) {
				return null;
			}
			insertIndex = getDropInsertIndex(dropTarget.mode, targetIndex, destinationSiblings.length);
		}

		movingFolder.parentId = nextParentId;
		destinationSiblings.splice(insertIndex, 0, movingFolder);
		destinationSiblings.forEach((folder, index) => {
			folder.order = index * ORDER_STEP;
			foldersById.set(folder.id, folder);
			updates.folders.push({
				id: folder.id,
				parentId: folder.parentId,
				order: folder.order,
			});
		});

		if (previousParentId !== nextParentId) {
			const sourceSiblings = sortFolders(
				Array.from(foldersById.values()).filter((folder) => folder.parentId === previousParentId && folder.id !== movingFolder.id),
			);
			sourceSiblings.forEach((folder, index) => {
				folder.order = index * ORDER_STEP;
				foldersById.set(folder.id, folder);
				updates.folders.push({
					id: folder.id,
					parentId: folder.parentId,
					order: folder.order,
				});
			});
		}
	}

	if (dragItem.type === "note") {
		const movingNote = notesById.get(dragItem.id);
		if (!movingNote) {
			return null;
		}

		const nextParentId =
			dropTarget.kind === "root"
				? null
				: dropTarget.kind === "folder"
					? dropTarget.folderId
					: dropTarget.parentId;

		const previousParentId = movingNote.folderId;
		const targetNoteId = dropTarget.kind === "note" ? dropTarget.noteId : null;

		const destinationSiblings = sortNotes(
			Array.from(notesById.values()).filter((note) => note.folderId === nextParentId && note.id !== movingNote.id),
		);

		let insertIndex = destinationSiblings.length;
		if (targetNoteId && dropTarget.kind === "note") {
			const targetIndex = destinationSiblings.findIndex((note) => note.id === targetNoteId);
			if (targetIndex < 0) {
				return null;
			}
			insertIndex = dropTarget.mode === "before" ? targetIndex : targetIndex + 1;
		}

		movingNote.folderId = nextParentId;
		destinationSiblings.splice(insertIndex, 0, movingNote);
		destinationSiblings.forEach((note, index) => {
			note.order = index * ORDER_STEP;
			notesById.set(note.id, note);
			updates.notes.push({
				id: note.id,
				folderId: note.folderId,
				order: note.order,
			});
		});

		if (previousParentId !== nextParentId) {
			const sourceSiblings = sortNotes(
				Array.from(notesById.values()).filter((note) => note.folderId === previousParentId && note.id !== movingNote.id),
			);
			sourceSiblings.forEach((note, index) => {
				note.order = index * ORDER_STEP;
				notesById.set(note.id, note);
				updates.notes.push({
					id: note.id,
					folderId: note.folderId,
					order: note.order,
				});
			});
		}
	}

	const dedupedFolders = Array.from(new Map(updates.folders.map((entry) => [entry.id, entry])).values());
	const dedupedNotes = Array.from(new Map(updates.notes.map((entry) => [entry.id, entry])).values());

	const nextTree = buildTreeFromFlatData(Array.from(foldersById.values()), Array.from(notesById.values()));
	return {
		tree: nextTree,
		payload: {
			folders: dedupedFolders,
			notes: dedupedNotes,
		},
	};
}

function findFolderPath(folders: HomeFolderItem[], folderId: string): string[] {
	for (const folder of folders) {
		if (folder.id === folderId) {
			return [folder.id];
		}

		const childPath = findFolderPath(folder.children, folderId);
		if (childPath.length > 0) {
			return [folder.id, ...childPath];
		}
	}

	return [];
}

function collectFolderIds(folders: HomeFolderItem[]): string[] {
	const ids: string[] = [];

	for (const folder of folders) {
		ids.push(folder.id);
		ids.push(...collectFolderIds(folder.children));
	}

	return ids;
}

function collectNoteIdsWithFiles(notes: HomeNoteItem[], filter: FilterId): string[] {
	return notes.filter((note) => getVisibleFiles(note, filter).length > 0).map((note) => note.id);
}

function collectNoteIdsWithFilesFromFolders(folders: HomeFolderItem[], filter: FilterId): string[] {
	const ids: string[] = [];

	for (const folder of folders) {
		ids.push(...collectNoteIdsWithFiles(folder.notes, filter));
		ids.push(...collectNoteIdsWithFilesFromFolders(folder.children, filter));
	}

	return ids;
}

function collectTreeEntries(tree: HomeFileTree): TreeEntry[] {
	const entries: TreeEntry[] = [];

	const visitFolders = (folders: HomeFolderItem[]) => {
		for (const folder of folders) {
			entries.push({
				id: folder.id,
				type: "folder",
				parentId: folder.parentId,
				name: folder.name,
				emoji: null,
			});
			visitFolders(folder.children);
			for (const note of folder.notes) {
				entries.push({
					id: note.id,
					type: "note",
					parentId: note.folderId,
					name: note.title || "Untitled",
					emoji: note.emoji,
				});
			}
		}
	};

	visitFolders(tree.folders);
	for (const note of tree.rootNotes) {
		entries.push({
			id: note.id,
			type: "note",
			parentId: note.folderId,
			name: note.title || "Untitled",
			emoji: note.emoji,
		});
	}

	return entries;
}

function insertFolder(items: HomeFolderItem[], folder: HomeFolderItem) {
	return [...items, folder].sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
}

function insertNote(items: HomeNoteItem[], note: HomeNoteItem) {
	return [...items, note].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title));
}

function addFolderToTree(tree: HomeFileTree, folder: HomeFolderItem, parentId: string | null): HomeFileTree {
	if (!parentId) {
		return {
			...tree,
			folders: insertFolder(tree.folders, folder),
		};
	}

	const addToFolders = (folders: HomeFolderItem[]): HomeFolderItem[] =>
		folders.map((item) =>
			item.id === parentId
				? {
						...item,
						children: insertFolder(item.children, folder),
				  }
				: {
						...item,
						children: addToFolders(item.children),
				  },
		);

	return {
		...tree,
		folders: addToFolders(tree.folders),
	};
}

function addNoteToTree(tree: HomeFileTree, note: HomeNoteItem, folderId: string | null): HomeFileTree {
	if (!folderId) {
		return {
			...tree,
			rootNotes: insertNote(tree.rootNotes, note),
		};
	}

	const addToFolders = (folders: HomeFolderItem[]): HomeFolderItem[] =>
		folders.map((item) =>
			item.id === folderId
				? {
						...item,
						notes: insertNote(item.notes, note),
				  }
				: {
						...item,
						children: addToFolders(item.children),
				  },
		);

	return {
		...tree,
		folders: addToFolders(tree.folders),
	};
}

function updateFolderInTree(tree: HomeFileTree, folderId: string, updater: (folder: HomeFolderItem) => HomeFolderItem): HomeFileTree {
	const updateFolders = (folders: HomeFolderItem[]): HomeFolderItem[] =>
		folders.map((folder) =>
			folder.id === folderId
				? updater(folder)
				: {
						...folder,
						children: updateFolders(folder.children),
				  },
		);

	return {
		...tree,
		folders: updateFolders(tree.folders),
	};
}

function updateNoteInTree(tree: HomeFileTree, noteId: string, updater: (note: HomeNoteItem) => HomeNoteItem): HomeFileTree {
	const updateNotes = (notes: HomeNoteItem[]) => notes.map((note) => (note.id === noteId ? updater(note) : note));
	const updateFolders = (folders: HomeFolderItem[]): HomeFolderItem[] =>
		folders.map((folder) => ({
			...folder,
			notes: updateNotes(folder.notes),
			children: updateFolders(folder.children),
		}));

	return {
		...tree,
		rootNotes: updateNotes(tree.rootNotes),
		folders: updateFolders(tree.folders),
	};
}

function updateFileInTree(tree: HomeFileTree, fileId: string, updater: (file: HomeFileItem) => HomeFileItem): HomeFileTree {
	const updateFiles = (notes: HomeNoteItem[]) =>
		notes.map((note) => ({
			...note,
			files: note.files.map((file) => (file.id === fileId ? updater(file) : file)),
		}));
	const updateFolders = (folders: HomeFolderItem[]): HomeFolderItem[] =>
		folders.map((folder) => ({
			...folder,
			notes: updateFiles(folder.notes),
			children: updateFolders(folder.children),
		}));

	return {
		...tree,
		rootNotes: updateFiles(tree.rootNotes),
		folders: updateFolders(tree.folders),
	};
}

function removeFolderFromTree(tree: HomeFileTree, folderId: string): HomeFileTree {
	const removeFromFolders = (folders: HomeFolderItem[]): HomeFolderItem[] =>
		folders
			.filter((folder) => folder.id !== folderId)
			.map((folder) => ({
				...folder,
				children: removeFromFolders(folder.children),
			}));

	return {
		...tree,
		folders: removeFromFolders(tree.folders),
	};
}

function removeNoteFromTree(tree: HomeFileTree, noteId: string): HomeFileTree {
	const removeFromNotes = (notes: HomeNoteItem[]) => notes.filter((note) => note.id !== noteId);
	const removeFromFolders = (folders: HomeFolderItem[]): HomeFolderItem[] =>
		folders.map((folder) => ({
			...folder,
			notes: removeFromNotes(folder.notes),
			children: removeFromFolders(folder.children),
		}));

	return {
		...tree,
		rootNotes: removeFromNotes(tree.rootNotes),
		folders: removeFromFolders(tree.folders),
	};
}

function removeFileFromTree(tree: HomeFileTree, fileId: string): HomeFileTree {
	const removeFromFiles = (notes: HomeNoteItem[]) =>
		notes.map((note) => ({
			...note,
			files: note.files.filter((file) => file.id !== fileId),
		}));
	const removeFromFolders = (folders: HomeFolderItem[]): HomeFolderItem[] =>
		folders.map((folder) => ({
			...folder,
			notes: removeFromFiles(folder.notes),
			children: removeFromFolders(folder.children),
		}));

	return {
		...tree,
		rootNotes: removeFromFiles(tree.rootNotes),
		folders: removeFromFolders(tree.folders),
	};
}

function noteMatchesFilter(note: HomeNoteItem, filter: FilterId) {
	if (filter === "all" || filter === "note") {
		return true;
	}

	return note.files.some((file) => file.mediaType === filter);
}

function getVisibleFiles(note: HomeNoteItem, filter: FilterId) {
	if (filter === "note") {
		return [];
	}
	if (filter === "all") {
		return note.files;
	}
	return note.files.filter((file) => file.mediaType === filter);
}

function pruneFolders(folders: HomeFolderItem[], filter: FilterId): HomeFolderItem[] {
	return folders
		.map((folder) => {
			const children = pruneFolders(folder.children, filter);
			const notes = folder.notes.filter((note) => noteMatchesFilter(note, filter));
			const shouldKeepEmptyFolder = filter === "all" || filter === "note";

			if (!shouldKeepEmptyFolder && children.length === 0 && notes.length === 0) {
				return null;
			}

			return {
				...folder,
				children,
				notes,
			};
		})
		.filter((folder): folder is HomeFolderItem => folder !== null);
}

function formatHoverLabel(value: string) {
	return formatDistanceToNow(new Date(value), { addSuffix: true });
}

function getFileIcon(mediaType: HomeFileMediaType) {
	switch (mediaType) {
		case "pdf":
			return <FileText className="h-4 w-4 shrink-0 text-red-500" />;
		case "audio":
			return <FileAudio2 className="h-4 w-4 shrink-0 text-purple-500" />;
		case "image":
			return <FileImage className="h-4 w-4 shrink-0 text-green-500" />;
		default:
			return <FileText className="h-4 w-4 shrink-0 text-zinc-500" />;
	}
}

function EditableLabel({
	initialValue,
	onSubmit,
	onCancel,
	className,
	maxLength,
	forbiddenCharsRegex,
	hint,
}: {
	initialValue: string;
	onSubmit: (value: string) => void;
	onCancel: () => void;
	className?: string;
	maxLength?: number;
	forbiddenCharsRegex?: RegExp;
	hint?: string;
}) {
	const [value, setValue] = useState(initialValue);
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);

	const commit = () => {
		const trimmed = value.trim();
		if (!trimmed || trimmed === initialValue) {
			onCancel();
			return;
		}
		onSubmit(trimmed);
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter") {
			event.preventDefault();
			commit();
		}
		if (event.key === "Escape") {
			event.preventDefault();
			onCancel();
		}
	};

	return (
		<input
			ref={inputRef}
			value={value}
			onChange={(event) => {
				const nextValue = maxLength ? event.target.value.slice(0, maxLength) : event.target.value;
				if (forbiddenCharsRegex?.test(nextValue)) {
					return;
				}

				setValue(nextValue);
			}}
			onBlur={commit}
			onKeyDown={handleKeyDown}
			onClick={(event) => event.stopPropagation()}
			maxLength={maxLength}
			title={hint}
			className={className ?? "h-8 w-full select-text rounded-md border border-white/10 bg-[#0f0f0f] px-2 text-sm text-white outline-none focus:border-[#7c6aff]"}
		/>
	);
}

function RowMenu({
	type,
	onRename,
	onDelete,
	onDuplicate,
	onChangeEmoji,
	onNewNote,
	onNewFolder,
}: {
	type: TreeItemType;
	onRename: () => void;
	onDelete: () => void;
	onDuplicate?: () => void;
	onChangeEmoji?: () => void;
	onNewNote?: () => void;
	onNewFolder?: () => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<button
						type="button"
						onClick={(event) => event.stopPropagation()}
						onKeyDown={(event) => event.stopPropagation()}
						className="flex h-7 w-7 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-white/5 group-hover:opacity-100"
					/>
				}>
				<MoreHorizontal className="h-4 w-4 text-zinc-500" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-40 border border-white/10 bg-[#181818] text-white">
				<DropdownMenuItem onClick={onRename} className="text-white">
					<Pencil className="h-4 w-4" />
					Rename
				</DropdownMenuItem>
				{type === "note" && onChangeEmoji ? (
					<DropdownMenuItem onClick={onChangeEmoji} className="text-white">
						<Smile className="h-4 w-4" />
						Change icon
					</DropdownMenuItem>
				) : null}
				{type === "note" && onDuplicate ? (
					<DropdownMenuItem onClick={onDuplicate} className="text-white">
						<Copy className="h-4 w-4" />
						Duplicate
					</DropdownMenuItem>
				) : null}
				{type === "folder" && onNewNote ? (
					<DropdownMenuItem onClick={onNewNote} className="text-white">
						<FilePlus className="h-4 w-4" />
						New note
					</DropdownMenuItem>
				) : null}
				{type === "folder" && onNewFolder ? (
					<DropdownMenuItem onClick={onNewFolder} className="text-white">
						<FolderPlus className="h-4 w-4" />
						New folder
					</DropdownMenuItem>
				) : null}
				<DropdownMenuSeparator className="bg-white/5" />
				<DropdownMenuItem onClick={onDelete} variant="destructive">
					<Trash2 className="h-4 w-4" />
					Delete
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function SortableTreeRow({
	id,
	className,
	style,
	children,
}: {
	id: string;
	className: string;
	style?: CSSProperties;
	children: (sortable: {
		attributes: ReturnType<typeof useSortable>["attributes"];
		listeners: ReturnType<typeof useSortable>["listeners"];
		isDragging: boolean;

	}) => ReactNode;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
	const verticalTransform = transform ? { ...transform, x: 0 } : null;

	return (
		<li
			ref={setNodeRef}
			style={{
				transform: CSS.Transform.toString(verticalTransform),
				transition: isDragging ? undefined : transition,
				opacity: isDragging ? 0.4 : 1,
				cursor: "pointer",
				position: "relative",
				zIndex: isDragging ? 20 : 1,
				touchAction: isDragging ? "none" : "pan-y",
				...style,
			}}
			className={className}>
			{children({ attributes, listeners, isDragging })}
		</li>
	);
}

function RootDropZone({ active }: { active: boolean }) {
	const { isOver, setNodeRef } = useDroppable({ id: ROOT_DROP_ID, data: { kind: "root" } });

	return (
		<div
			ref={setNodeRef}
			className={`rounded-xl border border-dashed px-3 py-2 text-xs transition-colors ${
				active || isOver ? "border-[#7c6aff]/80 bg-[#7c6aff]/10 text-violet-300" : "border-white/10 bg-[#111111]/96 text-zinc-500"
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
		<div aria-hidden="true" className="pointer-events-none absolute inset-y-2 left-0">
			{Array.from({ length: depth }).map((_, index) => (
				<span
					key={index}
					className="absolute inset-y-0 w-px rounded-full bg-white/8"
					style={{ left: getGuideOffset(index + 1) + extraPadding }}
				/>
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

export function FileExplorer({
	workspaceId,
	initialTree,
	folderId,
}: {
	workspaceId: string;
	initialTree: HomeFileTree;
	folderId?: string | null;
}) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const treeKey = useMemo(() => queryKeys.workspaceTree(workspaceId), [workspaceId]);
	const [tree, setTree] = useState(initialTree);
	const [selectedItem, setSelectedItem] = useState<SelectedItem>(folderId ? { id: folderId, type: "folder" } : null);
	const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
	const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
	const [activeFilter, setActiveFilter] = useState<FilterId>("note");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [editingItem, setEditingItem] = useState<EditingItem>(null);
	const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
	const [previewFile, setPreviewFile] = useState<PreviewableFile>(null);
	const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
	const [activeDragId, setActiveDragId] = useState<string | null>(null);
	const [emojiPickerNoteId, setEmojiPickerNoteId] = useState<string | null>(null);
	const [isCoarsePointerInput, setIsCoarsePointerInput] = useState(false);
	const dragItemRef = useRef<DraggableItem | null>(null);
	const suppressRowClickUntilRef = useRef(0);
	const scrollContainerRef = useRef<HTMLDivElement | null>(null);
	const treeRef = useRef(initialTree);
	const [isReordering, setIsReordering] = useState(false);
	const workspaceTreeQuery = useQuery({
		queryKey: treeKey,
		queryFn: () => fetchJson<WorkspaceTree>(`/api/workspace/${workspaceId}/tree`),
		enabled: workspaceId.length > 0,
		staleTime: 30_000,
	});

	const syncSidebarTree = useCallback(
		(nextTree: HomeFileTree) => {
			queryClient.setQueryData<WorkspaceTree>(treeKey, toWorkspaceTree(nextTree));
		},
		[queryClient, treeKey],
	);

	const applyLocalTreeUpdate = useCallback(
		(updater: (current: HomeFileTree) => HomeFileTree) => {
			const previousTree = treeRef.current;
			const nextTree = updater(previousTree);
			treeRef.current = nextTree;
			setTree(nextTree);
			syncSidebarTree(nextTree);
			return { previousTree, nextTree };
		},
		[syncSidebarTree],
	);

	const rollbackTree = useCallback(
		(previousTree: HomeFileTree) => {
			treeRef.current = previousTree;
			setTree(previousTree);
			syncSidebarTree(previousTree);
		},
		[syncSidebarTree],
	);

	useEffect(() => {
		treeRef.current = tree;
	}, [tree]);

	useEffect(() => {
		treeRef.current = initialTree;
		setTree(initialTree);
		syncSidebarTree(initialTree);
	}, [initialTree, syncSidebarTree]);

	useEffect(() => {
		if (!workspaceTreeQuery.data) {
			return;
		}

		const mergedTree = mergeHomeTreeWithWorkspaceTree(treeRef.current, workspaceTreeQuery.data);
		treeRef.current = mergedTree;
		setTree(mergedTree);
	}, [workspaceTreeQuery.data]);

	useEffect(() => {
		if (!folderId) {
			return;
		}

		const path = findFolderPath(initialTree.folders, folderId);
		if (path.length === 0) {
			return;
		}

		setExpandedFolders((current) => new Set([...current, ...path]));
		setSelectedItem({ id: folderId, type: "folder" });
	}, [folderId, initialTree.folders]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
		const updatePointerType = () => {
			setIsCoarsePointerInput(coarsePointerQuery.matches);
		};
		updatePointerType();

		if (typeof coarsePointerQuery.addEventListener === "function") {
			coarsePointerQuery.addEventListener("change", updatePointerType);
			return () => coarsePointerQuery.removeEventListener("change", updatePointerType);
		}

		coarsePointerQuery.addListener(updatePointerType);
		return () => coarsePointerQuery.removeListener(updatePointerType);
	}, []);

	const filteredTree = useMemo(
		() => ({
			folders: pruneFolders(tree.folders, activeFilter),
			rootNotes: tree.rootNotes.filter((note) => noteMatchesFilter(note, activeFilter)),
		}),
		[activeFilter, tree],
	);
	const visibleFolderIds = useMemo(() => collectFolderIds(filteredTree.folders), [filteredTree.folders]);
	const visibleNoteIdsWithFiles = useMemo(
		() => [...collectNoteIdsWithFilesFromFolders(filteredTree.folders, activeFilter), ...collectNoteIdsWithFiles(filteredTree.rootNotes, activeFilter)],
		[activeFilter, filteredTree.folders, filteredTree.rootNotes],
	);
	const canExpandAll = visibleFolderIds.some((id) => !expandedFolders.has(id)) || visibleNoteIdsWithFiles.some((id) => !expandedNotes.has(id));
	const treeEntries = useMemo(() => collectTreeEntries(tree), [tree]);
	const treeEntryMap = useMemo(() => new Map(treeEntries.map((entry) => [entry.id, entry])), [treeEntries]);
	const mouseSensor = useSensor(MouseSensor, {
		activationConstraint: {
			distance: 6,
		},
	});
	const touchSensor = useSensor(TouchSensor, {
		activationConstraint: {
			delay: 450,
			tolerance: isCoarsePointerInput ? 18 : 12,
		},
	});
	const sensors = useSensors(mouseSensor, touchSensor);

	const hasVisibleItems = filteredTree.folders.length > 0 || filteredTree.rootNotes.length > 0;
	const emojiPickerNote = useMemo(() => {
		if (!emojiPickerNoteId) {
			return null;
		}

		return flattenNotes(tree).find((note) => note.id === emojiPickerNoteId) ?? null;
	}, [emojiPickerNoteId, tree]);
	const activeDragEntry = useMemo(() => {
		if (!activeDragId) {
			return null;
		}

		return treeEntryMap.get(activeDragId) ?? null;
	}, [activeDragId, treeEntryMap]);

	const clearDragState = () => {
		dragItemRef.current = null;
		setActiveDragId(null);
		setDropTarget(null);
	};

	const getActiveDragItem = () => dragItemRef.current ?? (activeDragId ? ({
		id: activeDragId,
		type: treeEntryMap.get(activeDragId)?.type ?? "note",
		parentId: treeEntryMap.get(activeDragId)?.parentId ?? null,
	} satisfies DraggableItem) : null);

	const getFolderDropTarget = (activeDragItem: DraggableItem | null, folder: HomeFolderItem, relativeY: number): DropTarget | null => {
		if (!activeDragItem || activeDragItem.id === folder.id) {
			return null;
		}

		const inCenterBand = relativeY >= 0.2 && relativeY <= 0.8;

		if (activeDragItem.type === "note") {
			return {
				kind: "folder",
				folderId: folder.id,
				parentId: folder.parentId,
				mode: "inside",
			};
		}

		const foldersById = new Map(flattenFolders(tree.folders).map((item) => [item.id, item]));
		const canNest = inCenterBand && !isFolderDescendant(folder.id, activeDragItem.id, foldersById);

		if (canNest) {
			return {
				kind: "folder",
				folderId: folder.id,
				parentId: folder.parentId,
				mode: "inside",
			};
		}

		return {
			kind: "folder",
			folderId: folder.id,
			parentId: folder.parentId,
			mode: relativeY < 0.5 ? "before" : "after",
		};
	};

	const getNoteDropTarget = (activeDragItem: DraggableItem | null, note: HomeNoteItem, relativeY: number): DropTarget | null => {
		if (!activeDragItem || activeDragItem.type !== "note" || activeDragItem.id === note.id) {
			return null;
		}

		return {
			kind: "note",
			noteId: note.id,
			parentId: note.folderId,
			mode: relativeY < 0.5 ? "before" : "after",
		};
	};

	const getRelativeYForOverItem = (event: DragOverEvent | DragEndEvent) => {
		if (!event.over?.rect || !event.active.rect.current.translated) {
			return 0.5;
		}

		const translated = event.active.rect.current.translated;
		const centerY = translated.top + translated.height / 2;
		return Math.min(1, Math.max(0, (centerY - event.over.rect.top) / Math.max(1, event.over.rect.height)));
	};

	const resolveDropTarget = (event: DragOverEvent | DragEndEvent): DropTarget | null => {
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
					order: 0,
					updatedAt: "",
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
				emoji: null,
				folderId: overItem.parentId,
				order: 0,
				updatedAt: "",
				files: [],
			},
			relativeY,
		);
	};

	const applyDrop = async (target: DropTarget) => {
		const activeDragItem = getActiveDragItem();
		if (!activeDragItem) {
			return;
		}

		const reordered = applyTreeReorder(treeRef.current, activeDragItem, target);
		clearDragState();
		if (!reordered) {
			return;
		}

		const { previousTree } = applyLocalTreeUpdate(() => reordered.tree);
		setIsReordering(true);

		try {
			await fetchJson(`/api/workspace/${workspaceId}/reorder`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(reordered.payload),
			});

			startTransition(() => router.refresh());
		} catch (error) {
			console.error("Failed to persist tree reorder", error);
			rollbackTree(previousTree);
			startTransition(() => router.refresh());
		} finally {
			setIsReordering(false);
		}
	};

	const isDropTargetActive = (target: DropTarget) => {
		if (!dropTarget) {
			return false;
		}

		if (target.kind !== dropTarget.kind) {
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
	};

	const toggleFolder = (id: string) => {
		setExpandedFolders((current) => {
			const next = new Set(current);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
		setSelectedItem({ id, type: "folder" });
	};

	const activateRow = (item: DraggableItem) => {
		if (Date.now() < suppressRowClickUntilRef.current) {
			return;
		}

		if (activeDragId) {
			return;
		}

		if (item.type === "folder") {
			toggleFolder(item.id);
			return;
		}

		openNote(item.id);
	};

	const handleRowKeyDown = (event: KeyboardEvent<HTMLElement>, item: DraggableItem) => {
		switch (event.key) {
			case "Enter":
			case " ":
				event.preventDefault();
				activateRow(item);
				return;
			default:
				return;
		}
	};

	const handleDragStart = (event: DragStartEvent) => {
		const activeId = String(event.active.id);
		const activeItem = treeEntryMap.get(activeId);
		if (!activeItem) {
			return;
		}

		dragItemRef.current = {
			id: activeItem.id,
			type: activeItem.type,
			parentId: activeItem.parentId,
		};
		suppressRowClickUntilRef.current = Date.now() + 600;
		setActiveDragId(activeItem.id);

		if (isCoarsePointerInput && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
			navigator.vibrate(24);
		}
	};

	const handleDragOver = (event: DragOverEvent) => {
		setDropTarget(resolveDropTarget(event));
	};

	const handleDragMove = (event: DragMoveEvent) => {
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
	};

	const handleDragEnd = (event: DragEndEvent) => {
		suppressRowClickUntilRef.current = Date.now() + 250;
		const target = resolveDropTarget(event) ?? dropTarget;
		if (!target) {
			clearDragState();
			return;
		}

		void applyDrop(target);
	};

	const toggleNoteFiles = (id: string) => {
		setExpandedNotes((current) => {
			const next = new Set(current);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const openNote = (noteId: string) => {
		setSelectedItem({ id: noteId, type: "note" });
		router.push(`/note/${encodeURIComponent(noteId)}`);
	};

	const previewAsset = (file: HomeFileItem) => {
		if (file.mediaType === "video") {
			return;
		}

		setSelectedItem({ id: file.id, type: "file" });
		setPreviewFile({
			name: file.name,
			url: buildFileAccessUrl(file.id),
			type: file.mediaType,
		});
	};

	const createNote = async (targetFolderId: string | null) => {
		const tempId = `temp-note-${Date.now()}`;
		const optimisticNote: HomeNoteItem = {
			id: tempId,
			title: "Untitled",
			emoji: null,
			folderId: targetFolderId,
			order: Date.now(),
			updatedAt: new Date().toISOString(),
			files: [],
		};

		const { previousTree } = applyLocalTreeUpdate((current) => addNoteToTree(current, optimisticNote, targetFolderId));
		setSelectedItem({ id: tempId, type: "note" });
		setEditingItem({ id: tempId, type: "note" });

		try {
			const createdNote = await fetchJson<{ id: string; title: string; emoji?: string | null; folderId: string | null; order: number; updatedAt?: string }>("/api/notes", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId, folderId: targetFolderId }),
			});

			const confirmedNote: HomeNoteItem = {
				id: createdNote.id,
				title: createdNote.title ?? "Untitled",
				emoji: createdNote.emoji ?? null,
				folderId: createdNote.folderId ?? null,
				order: createdNote.order ?? Date.now(),
				updatedAt: createdNote.updatedAt ?? new Date().toISOString(),
				files: [],
			};

			applyLocalTreeUpdate((current) => updateNoteInTree(current, tempId, () => confirmedNote));
			setSelectedItem((current) => (current?.type === "note" && current.id === tempId ? { id: confirmedNote.id, type: "note" } : current));
			setEditingItem((current) => (current?.type === "note" && current.id === tempId ? { id: confirmedNote.id, type: "note" } : current));
			return confirmedNote;
		} catch (error) {
			rollbackTree(previousTree);
			setEditingItem((current) => (current?.type === "note" && current.id === tempId ? null : current));
			setSelectedItem((current) => (current?.type === "note" && current.id === tempId ? null : current));
			throw error;
		}
	};

	const createFolder = async (parentId: string | null) => {
		const tempId = `temp-folder-${Date.now()}`;
		const optimisticFolder: HomeFolderItem = {
			id: tempId,
			name: "New Folder",
			parentId,
			order: Date.now(),
			updatedAt: new Date().toISOString(),
			children: [],
			notes: [],
		};

		const { previousTree } = applyLocalTreeUpdate((current) => addFolderToTree(current, optimisticFolder, parentId));
		setExpandedFolders((current) => new Set([...current, tempId, ...(parentId ? [parentId] : [])]));
		setSelectedItem({ id: tempId, type: "folder" });
		setEditingItem({ id: tempId, type: "folder" });

		try {
			const createdFolder = await fetchJson<{ id: string; name: string; parentId: string | null; order: number; updatedAt?: string }>("/api/folders", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId, parentId, name: "New Folder" }),
			});

			const confirmedFolder: HomeFolderItem = {
				id: createdFolder.id,
				name: createdFolder.name,
				parentId: createdFolder.parentId ?? null,
				order: createdFolder.order ?? Date.now(),
				updatedAt: createdFolder.updatedAt ?? new Date().toISOString(),
				children: [],
				notes: [],
			};

			applyLocalTreeUpdate((current) => updateFolderInTree(current, tempId, () => confirmedFolder));
			setExpandedFolders((current) => {
				const next = new Set(current);
				next.delete(tempId);
				next.add(createdFolder.id);
				if (parentId) {
					next.add(parentId);
				}
				return next;
			});
			setSelectedItem((current) => (current?.type === "folder" && current.id === tempId ? { id: createdFolder.id, type: "folder" } : current));
			setEditingItem((current) => (current?.type === "folder" && current.id === tempId ? { id: createdFolder.id, type: "folder" } : current));
			return confirmedFolder;
		} catch (error) {
			rollbackTree(previousTree);
			setExpandedFolders((current) => {
				const next = new Set(current);
				next.delete(tempId);
				return next;
			});
			setEditingItem((current) => (current?.type === "folder" && current.id === tempId ? null : current));
			setSelectedItem((current) => (current?.type === "folder" && current.id === tempId ? null : current));
			throw error;
		}
	};

	const handleNewNote = async () => {
		try {
			setIsSubmitting(true);
			setActiveFilter("all");
			await createNote(null);
			startTransition(() => router.refresh());
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleNewFolder = async () => {
		try {
			setIsSubmitting(true);
			setActiveFilter("all");
			await createFolder(null);
			startTransition(() => router.refresh());
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleRename = async (item: EditingItem, value: string) => {
		if (!item) {
			return;
		}

		setEditingItem(null);
		const previousTree = treeRef.current;

		try {
			if (item.type === "folder") {
				applyLocalTreeUpdate((current) => updateFolderInTree(current, item.id, (folder) => ({ ...folder, name: value, updatedAt: new Date().toISOString() })));
				await fetchJson(`/api/folders/${item.id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: value }),
				});
			}

			if (item.type === "note") {
				applyLocalTreeUpdate((current) => updateNoteInTree(current, item.id, (note) => ({ ...note, title: value, updatedAt: new Date().toISOString() })));
				await fetchJson(`/api/notes/${item.id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ title: value }),
				});
			}

			if (item.type === "file") {
				applyLocalTreeUpdate((current) => updateFileInTree(current, item.id, (file) => ({ ...file, name: value })));
				await fetchJson(`/api/files/${item.id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: value }),
				});
			}

			startTransition(() => router.refresh());
		} catch (error) {
			rollbackTree(previousTree);
			throw error;
		}
	};

	const handleDeleteConfirmed = async () => {
		if (!pendingDelete) {
			return;
		}

		const target = pendingDelete;
		const previousTree = treeRef.current;
		setPendingDelete(null);

		try {
			if (target.type === "folder") {
				applyLocalTreeUpdate((current) => removeFolderFromTree(current, target.id));
				await fetchJson(`/api/folders/${target.id}`, { method: "DELETE" });
			}

			if (target.type === "note") {
				applyLocalTreeUpdate((current) => removeNoteFromTree(current, target.id));
				await fetchJson(`/api/notes/${target.id}`, { method: "DELETE" });
			}

			if (target.type === "file") {
				applyLocalTreeUpdate((current) => removeFileFromTree(current, target.id));
				await fetchJson(`/api/files/${target.id}`, { method: "DELETE" });
			}

			startTransition(() => router.refresh());
		} catch (error) {
			rollbackTree(previousTree);
			throw error;
		}
	};

	const handleNoteEmojiChange = async (noteId: string, emoji: string | null) => {
		const previousTree = treeRef.current;
		applyLocalTreeUpdate((current) => updateNoteInTree(current, noteId, (note) => ({ ...note, emoji, updatedAt: new Date().toISOString() })));
		try {
			await fetchJson(`/api/notes/${noteId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ emoji }),
			});
			startTransition(() => router.refresh());
		} catch (error) {
			rollbackTree(previousTree);
			throw error;
		}
	};

	const handleDuplicateNote = async (note: HomeNoteItem) => {
		const tempId = `temp-duplicate-note-${Date.now()}`;
		const previousTree = treeRef.current;
		const optimisticTitle = `Copy of ${note.title || "Untitled"}`;
		applyLocalTreeUpdate((current) =>
			addNoteToTree(
				current,
				{
					id: tempId,
					title: optimisticTitle,
					emoji: note.emoji,
					folderId: note.folderId,
					order: Date.now(),
					updatedAt: new Date().toISOString(),
					files: [],
				},
				note.folderId,
			),
		);

		try {
			const source = await fetchJson<{
				title: string;
				content: unknown;
				emoji: string | null;
				folderId: string | null;
			}>(`/api/notes/${note.id}`);

			const created = await fetchJson<{ id: string; folderId: string | null; order: number; updatedAt?: string }>("/api/notes", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId, folderId: source.folderId }),
			});

			await fetchJson(`/api/notes/${created.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					title: `Copy of ${source.title || "Untitled"}`,
					content: source.content,
					emoji: source.emoji,
				}),
			});

			applyLocalTreeUpdate((current) =>
				updateNoteInTree(current, tempId, () => ({
					id: created.id,
					title: `Copy of ${source.title || "Untitled"}`,
					emoji: source.emoji,
					folderId: source.folderId,
					order: created.order ?? Date.now(),
					updatedAt: created.updatedAt ?? new Date().toISOString(),
					files: [],
				})),
			);
			startTransition(() => router.refresh());
		} catch (error) {
			rollbackTree(previousTree);
			throw error;
		}
	};

	const renderFiles = (note: HomeNoteItem, depth: number) => {
		const visibleFiles = getVisibleFiles(note, activeFilter);
		if (visibleFiles.length === 0) {
			return null;
		}

		return (
			<div className="space-y-1">
				{visibleFiles.map((file) => {
					const isEditing = editingItem?.id === file.id && editingItem.type === "file";

					return (
						<div
							key={file.id}
							className={`group relative flex items-center justify-between gap-3 overflow-hidden rounded-xl px-3 py-2 transition-colors hover:bg-white/5 ${
								selectedItem?.id === file.id && selectedItem.type === "file" ? "bg-white/5" : ""
							}`}
							style={{ paddingLeft: `${getRowPaddingLeft(depth + 1, FILE_EXTRA_PADDING_PX)}px` }}
							title={`${file.name} • ${formatHoverLabel(file.createdAt)}`}>
							<TreeGuides depth={depth + 1} extraPadding={FILE_EXTRA_PADDING_PX - 8} />
							<div className="flex min-w-0 flex-1 items-center gap-3">
								{getFileIcon(file.mediaType)}
								{isEditing ? (
									<EditableLabel initialValue={file.name} onSubmit={(value) => void handleRename(editingItem, value)} onCancel={() => setEditingItem(null)} className="h-8 w-full rounded-md border border-white/10 bg-[#0f0f0f] px-2 text-sm text-white outline-none focus:border-[#7c6aff]" />
								) : (
									<button type="button" onClick={() => previewAsset(file)} className="min-w-0 flex-1 truncate text-left text-sm text-zinc-300">
										{file.name}
									</button>
								)}
							</div>
							<div className="hidden items-center gap-2 sm:flex">
								<span className="shrink-0 text-xs text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100">{formatHoverLabel(file.createdAt)}</span>
								<RowMenu
									type="file"
									onRename={() => setEditingItem({ id: file.id, type: "file" })}
									onDelete={() => setPendingDelete({ id: file.id, type: "file", name: file.name })}
								/>
							</div>
						</div>
					);
				})}
			</div>
		);
	};
	const renderNotes = (notes: HomeNoteItem[], depth: number) =>
		notes.map((note) => {
			const isEditing = editingItem?.id === note.id && editingItem.type === "note";
			const hasVisibleFiles = getVisibleFiles(note, activeFilter).length > 0;
			const areFilesExpanded = expandedNotes.has(note.id);
			const rowItem: DraggableItem = { id: note.id, type: "note", parentId: note.folderId };

			return (
				<SortableTreeRow key={note.id} id={note.id} className="space-y-1">
					{({ attributes, listeners, isDragging }) => (
						<>
							<div
								aria-label={note.title || "Untitled"}
								aria-level={depth + 1}
								aria-selected={selectedItem?.id === note.id && selectedItem.type === "note"}
								onClick={() => activateRow(rowItem)}
								onKeyDown={(event) => handleRowKeyDown(event, rowItem)}
								{...attributes}
								{...listeners}
								className={`group relative flex items-center justify-between gap-3 overflow-hidden rounded-xl px-3 py-2 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6aff] ${
									selectedItem?.id === note.id && selectedItem.type === "note" ? "bg-white/5" : ""
								} cursor-pointer select-none touch-pan-y ${isDragging ? "opacity-50" : ""}`}
								style={{
									paddingLeft: `${getRowPaddingLeft(depth)}px`,
									userSelect: isEditing ? "text" : "none",
									WebkitUserSelect: isEditing ? "text" : "none",
									WebkitTouchCallout: "none",
									touchAction: "pan-y",
								}}
								title={`${note.title || "Untitled"} • ${formatHoverLabel(note.updatedAt)}`}>
								<TreeGuides depth={depth} />
								<div className="flex min-w-0 flex-1 items-center gap-3">
									{hasVisibleFiles ? (
										<button
											type="button"
											onClick={(event) => {
												event.stopPropagation();
												toggleNoteFiles(note.id);
											}}
											onKeyDown={(event) => event.stopPropagation()}
											onPointerDown={(event) => event.stopPropagation()}
											className="flex h-4 w-4 shrink-0 items-center justify-center text-zinc-500">
											{areFilesExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
										</button>
									) : (
										<span className="w-4 shrink-0" />
									)}
									<button
										type="button"
										onClick={(event) => {
											event.stopPropagation();
											setEmojiPickerNoteId(note.id);
										}}
										onPointerDown={(event) => event.stopPropagation()}
										aria-label={`Change icon for ${note.title || "Untitled"}`}
										title="Change icon"
										className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300">
										{note.emoji ? <span className="text-base leading-none">{note.emoji}</span> : <FileText className="h-4 w-4" />}
									</button>
									{isEditing ? (
										<EditableLabel
											initialValue={note.title || "Untitled"}
											onSubmit={(value) => void handleRename(editingItem, value)}
											onCancel={() => setEditingItem(null)}
											maxLength={NOTE_TITLE_MAX_LENGTH}
											forbiddenCharsRegex={NAME_FORBIDDEN_CHARACTERS_REGEX}
											hint={`Max ${NOTE_TITLE_MAX_LENGTH} chars. ${NAME_RESTRICTED_CHARS_HINT}`}
											className="h-8 w-full rounded-md border border-white/10 bg-[#0f0f0f] px-2 text-sm text-white outline-none focus:border-[#7c6aff]"
										/>
									) : (
										<span className="min-w-0 flex-1 select-none line-clamp-1 text-left text-sm text-white" style={{ userSelect: "none", WebkitUserSelect: "none" }}>
											{note.title || "Untitled"}
										</span>
									)}
								</div>
								<div className="hidden items-center gap-2 sm:flex">
									<span className="shrink-0 text-xs text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100">{formatHoverLabel(note.updatedAt)}</span>
									<RowMenu
										type="note"
										onRename={() => setEditingItem({ id: note.id, type: "note" })}
										onChangeEmoji={() => setEmojiPickerNoteId(note.id)}
										onDuplicate={() => void handleDuplicateNote(note)}
										onDelete={() => setPendingDelete({ id: note.id, type: "note", name: note.title || "Untitled" })}
									/>
								</div>
							</div>
							{hasVisibleFiles && areFilesExpanded ? renderFiles(note, depth) : null}
						</>
					)}
				</SortableTreeRow>
			);
		});

	const renderFolderList = (folders: HomeFolderItem[], depth: number): ReactNode => (
		<SortableContext items={folders.map((folder) => folder.id)} strategy={verticalListSortingStrategy}>
			{folders.map((folder) => {
				const isExpanded = expandedFolders.has(folder.id);
				const visibleChildren = pruneFolders(folder.children, activeFilter);
				const visibleNotes = folder.notes.filter((note) => noteMatchesFilter(note, activeFilter));
				const hasChildren = visibleChildren.length > 0 || visibleNotes.length > 0;
				const isEmptyFolder = folder.children.length === 0 && folder.notes.length === 0;
				const isEditing = editingItem?.id === folder.id && editingItem.type === "folder";
				const insideTarget: DropTarget = { kind: "folder", folderId: folder.id, parentId: folder.parentId, mode: "inside" };
				const isInsideActive = isDropTargetActive(insideTarget);
				const rowItem: DraggableItem = { id: folder.id, type: "folder", parentId: folder.parentId };

				return (
					<SortableTreeRow key={folder.id} id={folder.id} className="space-y-1">
						{({ attributes, listeners, isDragging }) => (
							<>
								<div
									aria-expanded={isExpanded}
									aria-label={folder.name}
									aria-level={depth + 1}
									aria-selected={selectedItem?.id === folder.id && selectedItem.type === "folder"}
									onClick={() => activateRow(rowItem)}
									onKeyDown={(event) => handleRowKeyDown(event, rowItem)}
									{...attributes}
									{...listeners}
									className={`group relative flex items-center justify-between gap-3 overflow-hidden rounded-xl px-3 py-2 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6aff] ${
										selectedItem?.id === folder.id && selectedItem.type === "folder" ? "bg-white/5" : ""
									} cursor-pointer select-none touch-pan-y ${isDragging ? "opacity-50" : ""}`}
									style={{
										paddingLeft: `${getRowPaddingLeft(depth)}px`,
										userSelect: isEditing ? "text" : "none",
										WebkitUserSelect: isEditing ? "text" : "none",
										WebkitTouchCallout: "none",
										touchAction: "pan-y",
									}}
									title={`${folder.name} • ${formatHoverLabel(folder.updatedAt)}`}>
									<TreeGuides depth={depth} />
									{isInsideActive ? (
										<>
											<div className="pointer-events-none absolute inset-0 rounded-xl border border-[#7c6aff] bg-[#7c6aff]/12 shadow-[0_0_0_1px_rgba(124,106,255,0.35)]" />
											<div className="pointer-events-none absolute inset-y-1 left-0 w-1 rounded-r-full bg-[#7c6aff]" />
											<div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-[#7c6aff]/50 bg-[#1a1435]/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">
												Drop into folder
											</div>
										</>
									) : null}
									<div className="flex min-w-0 flex-1 items-center gap-3 text-left">
										<button
											type="button"
											onClick={(event) => {
												event.stopPropagation();
												toggleFolder(folder.id);
											}}
											onKeyDown={(event) => event.stopPropagation()}
											onPointerDown={(event) => event.stopPropagation()}
											className="flex h-4 w-4 shrink-0 items-center justify-center text-zinc-500">
											{isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />}
										</button>
										<Folder className="h-4 w-4 shrink-0 text-zinc-500" />
										{isEditing ? (
											<EditableLabel
												initialValue={folder.name}
												onSubmit={(value) => void handleRename(editingItem, value)}
												onCancel={() => setEditingItem(null)}
												maxLength={FOLDER_NAME_MAX_LENGTH}
												forbiddenCharsRegex={NAME_FORBIDDEN_CHARACTERS_REGEX}
												hint={`Max ${FOLDER_NAME_MAX_LENGTH} chars. ${NAME_RESTRICTED_CHARS_HINT}`}
												className="h-8 w-full rounded-md border border-white/10 bg-[#0f0f0f] px-2 text-sm text-white outline-none focus:border-[#7c6aff]"
											/>
										) : (
											<span className="truncate select-none text-left text-sm text-white" style={{ userSelect: "none", WebkitUserSelect: "none" }}>
												{folder.name}
											</span>
										)}
									</div>
									<div className="hidden items-center gap-2 sm:flex">
										<span className="shrink-0 text-xs text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100">{formatHoverLabel(folder.updatedAt)}</span>
										<RowMenu
											type="folder"
											onRename={() => setEditingItem({ id: folder.id, type: "folder" })}
											onDelete={() => setPendingDelete({ id: folder.id, type: "folder", name: folder.name })}
											onNewNote={() => void createNote(folder.id)}
											onNewFolder={() => void createFolder(folder.id)}
										/>
									</div>
								</div>
								{isExpanded ? (
									<ul role="group" className="space-y-1 overflow-x-hidden">
										{renderFolderList(visibleChildren, depth + 1)}
										<SortableContext items={visibleNotes.map((note) => note.id)} strategy={verticalListSortingStrategy}>
											{renderNotes(visibleNotes, depth + 1)}
										</SortableContext>
										{isEmptyFolder ? (
											<li role="none" className="relative overflow-hidden px-3 py-2 text-xs text-zinc-600" style={{ paddingLeft: `${getRowPaddingLeft(depth + 1, 16)}px` }}>
												<TreeGuides depth={depth + 1} extraPadding={8} />
												Empty folder
											</li>
										) : null}
										{!isEmptyFolder && !hasChildren ? (
											<li role="none" className="relative overflow-hidden px-3 py-2 text-xs text-zinc-600" style={{ paddingLeft: `${getRowPaddingLeft(depth + 1, 16)}px` }}>
												<TreeGuides depth={depth + 1} extraPadding={8} />
												No matching items
											</li>
										) : null}
									</ul>
								) : null}
							</>
						)}
					</SortableTreeRow>
				);
			})}
		</SortableContext>
	);

	return (
		<>
			<section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-white/5 bg-[#111111] p-5 sm:p-6">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
					<div className="space-y-2">
						<p className="text-xs font-medium uppercase tracking-widest text-zinc-500">File Manager</p>
						<p className="text-sm text-zinc-400">Browse folders, notes, and uploaded study files.</p>
					</div>

					<div className="flex flex-wrap gap-2">
						{FILTERS.map((filter) => (
							<button
								key={filter.id}
								type="button"
								onClick={() => setActiveFilter(filter.id)}
								className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
									activeFilter === filter.id
										? "border-[#7c6aff] bg-[#7c6aff]/10 text-violet-300"
										: "border-white/5 bg-[#141414] text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
								}`}>
								{filter.label}
							</button>
						))}
					</div>
				</div>

				<div className="mt-3 flex flex-wrap items-center justify-between gap-3">
					<p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Tree controls</p>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => {
								setExpandedFolders(new Set(visibleFolderIds));
								setExpandedNotes(new Set(visibleNoteIdsWithFiles));
							}}
							title="Expand all"
							aria-label="Expand all"
							disabled={!canExpandAll}
							className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-transparent text-zinc-300 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50">
							<ChevronsUpDown className="h-4 w-4" />
						</button>
						<button
							type="button"
							onClick={() => {
								setExpandedFolders(new Set());
								setExpandedNotes(new Set());
							}}
							title="Collapse all"
							aria-label="Collapse all"
							disabled={expandedFolders.size === 0 && expandedNotes.size === 0}
							className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-transparent text-zinc-300 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50">
							<ChevronsDownUp className="h-4 w-4" />
						</button>
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
					<div ref={scrollContainerRef} className="relative mt-6 min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y pr-1">
						{hasVisibleItems ? (
							<ul role="tree" aria-label="File manager tree" className="min-w-0 space-y-1 overflow-x-hidden">
								{renderFolderList(filteredTree.folders, 0)}
								<SortableContext items={filteredTree.rootNotes.map((note) => note.id)} strategy={verticalListSortingStrategy}>
									{renderNotes(filteredTree.rootNotes, 0)}
								</SortableContext>
							</ul>
						) : (
							<div className="rounded-2xl border border-dashed border-white/5 bg-[#141414] px-4 py-10 text-center text-sm text-zinc-500">
								No matching items for this filter.
							</div>
						)}
					</div>
					{activeDragId ? (
						<div className="mt-3">
							<RootDropZone active={isDropTargetActive({ kind: "root" })} />
						</div>
					) : null}
					<DragOverlay>
						{activeDragEntry ? (
							<div className="pointer-events-none flex max-w-[300px] items-center gap-2 rounded-xl border border-[#7c6aff]/80 bg-[#1a1435]/95 px-3 py-2 shadow-[0_14px_30px_rgba(9,5,22,0.5)]">
								{activeDragEntry.type === "folder" ? (
									<Folder className="h-4 w-4 shrink-0 text-violet-300" />
								) : activeDragEntry.type === "note" ? (
									activeDragEntry.emoji ? (
										<span className="flex h-4 w-4 shrink-0 items-center justify-center text-sm leading-none">{activeDragEntry.emoji}</span>
									) : (
										<FileText className="h-4 w-4 shrink-0 text-violet-300" />
									)
								) : null}
								<span className="truncate text-sm font-medium text-violet-100">{activeDragEntry.name || "Untitled"}</span>
							</div>
						) : null}
					</DragOverlay>
				</DndContext>

				<Separator className="my-5 bg-white/5" />

				<p aria-live="polite" className="mb-3 text-xs text-zinc-500">
					Tip: drag folders or notes to reorder. On touch devices, press and hold for about half a second to start dragging. Drop in the center of a folder to nest items.
				</p>

				<div className="flex flex-wrap gap-3">
					<Button type="button" onClick={() => void handleNewNote()} disabled={isSubmitting || isReordering} className="h-10 rounded-xl bg-[#7c6aff] px-4 text-white hover:bg-[#8b7bff]">
						<FilePlus className="h-4 w-4" />
						New note
					</Button>
					<Button type="button" variant="outline" onClick={() => void handleNewFolder()} disabled={isSubmitting || isReordering} className="h-10 rounded-xl border-white/5 bg-[#141414] px-4 text-zinc-200 hover:bg-white/5">
						<FolderPlus className="h-4 w-4" />
						New folder
					</Button>
				</div>
			</section>

			<FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
			<NoteIconPickerDialog
				open={emojiPickerNote !== null}
                noteTitle={emojiPickerNote?.title ?? "Untitled"}
                emoji={emojiPickerNote?.emoji ?? null}
				onOpenChange={(open) => {
					if (!open) {
						setEmojiPickerNoteId(null);
					}
				}}
				onEmojiSelect={(emoji) => {
					if (!emojiPickerNote) {
						return;
					}
					void handleNoteEmojiChange(emojiPickerNote.id, emoji);
					setEmojiPickerNoteId(null);
				}}
			/>
		</>
	);
}




