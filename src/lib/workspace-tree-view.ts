import type { FolderTreeItem, NoteTreeItem, WorkspaceTree } from "@/types";

export const SIDEBAR_FILTERS = [
	{ id: "all", label: "All" },
	{ id: "note", label: "Notes" },
	{ id: "pdf", label: "PDFs" },
	{ id: "audio", label: "Audio" },
	{ id: "image", label: "Images" },
] as const;

export type SidebarFilterId = (typeof SIDEBAR_FILTERS)[number]["id"];

export type WorkspaceDraggableItem = {
	id: string;
	type: "folder" | "note";
	parentId: string | null;
};

export type WorkspaceDropTarget =
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

export type WorkspaceReorderPayload = {
	folders: Array<{ id: string; parentId: string | null; order: number }>;
	notes: Array<{ id: string; folderId: string | null; order: number }>;
};

type FlatFolder = Omit<FolderTreeItem, "children" | "notes">;
type FlatNote = NoteTreeItem;

const ORDER_STEP = 1024;

function sortFolders(items: FlatFolder[]) {
	return [...items].sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.name.localeCompare(right.name));
}

function sortNotes(items: FlatNote[]) {
	return [...items].sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.title.localeCompare(right.title));
}

export function flattenWorkspaceFolders(folders: FolderTreeItem[]): FlatFolder[] {
	const result: FlatFolder[] = [];

	const visit = (items: FolderTreeItem[]) => {
		for (const folder of items) {
			result.push({
				id: folder.id,
				name: folder.name,
				parentId: folder.parentId ?? null,
				order: folder.order,
				type: "folder",
			});
			visit(folder.children);
		}
	};

	visit(folders);
	return result;
}

export function flattenWorkspaceNotes(tree: WorkspaceTree): FlatNote[] {
	const result: FlatNote[] = [...tree.rootNotes];

	const visit = (folders: FolderTreeItem[]) => {
		for (const folder of folders) {
			result.push(...folder.notes);
			visit(folder.children);
		}
	};

	visit(tree.folders);
	return result;
}

export function buildWorkspaceTreeFromFlatData(folders: FlatFolder[], notes: FlatNote[]): WorkspaceTree {
	const sortedFolders = sortFolders(folders);
	const sortedNotes = sortNotes(notes);
	const folderMap = new Map<string, FolderTreeItem>();

	for (const folder of sortedFolders) {
		folderMap.set(folder.id, {
			...folder,
			type: "folder",
			children: [],
			notes: [],
		});
	}

	const rootNotes: NoteTreeItem[] = [];
	for (const note of sortedNotes) {
		if (note.folderId && folderMap.has(note.folderId)) {
			folderMap.get(note.folderId)?.notes.push(note);
			continue;
		}

		rootNotes.push(note);
	}

	const rootFolders: FolderTreeItem[] = [];
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

	return { folders: rootFolders, rootNotes };
}

export function noteMatchesSidebarFilter(note: NoteTreeItem, filter: SidebarFilterId) {
	if (filter === "all" || filter === "note") {
		return true;
	}

	return (note.files ?? []).some((file) => file.mediaType === filter);
}

export function pruneWorkspaceFoldersByFilter(folders: FolderTreeItem[], filter: SidebarFilterId): FolderTreeItem[] {
	return [...folders]
		.sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.name.localeCompare(right.name))
		.map((folder) => {
			const children = pruneWorkspaceFoldersByFilter(folder.children, filter);
			const notes = sortNotes(folder.notes).filter((note) => noteMatchesSidebarFilter(note, filter));
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
		.filter((folder): folder is FolderTreeItem => folder !== null);
}

export function sortWorkspaceRootNotes(notes: NoteTreeItem[]) {
	return sortNotes(notes);
}

export function collectWorkspaceTreeEntries(tree: WorkspaceTree) {
	const entries: Array<{ id: string; type: "folder" | "note"; parentId: string | null; name: string }> = [];

	const visitFolders = (folders: FolderTreeItem[]) => {
		for (const folder of folders) {
			entries.push({ id: folder.id, type: "folder", parentId: folder.parentId ?? null, name: folder.name });
			visitFolders(folder.children);
			for (const note of folder.notes) {
				entries.push({ id: note.id, type: "note", parentId: note.folderId ?? null, name: note.title || "Untitled" });
			}
		}
	};

	visitFolders(tree.folders);
	for (const note of tree.rootNotes) {
		entries.push({ id: note.id, type: "note", parentId: note.folderId ?? null, name: note.title || "Untitled" });
	}

	return entries;
}

export function isWorkspaceFolderDescendant(candidateParentId: string | null, folderId: string, foldersById: Map<string, FlatFolder>) {
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

export function applyWorkspaceTreeReorder(
	tree: WorkspaceTree,
	dragItem: WorkspaceDraggableItem,
	dropTarget: WorkspaceDropTarget,
): { tree: WorkspaceTree; payload: WorkspaceReorderPayload } | null {
	const folders = flattenWorkspaceFolders(tree.folders);
	const notes = flattenWorkspaceNotes(tree);
	const foldersById = new Map(folders.map((folder) => [folder.id, { ...folder }]));
	const notesById = new Map(notes.map((note) => [note.id, { ...note }]));
	const updates: WorkspaceReorderPayload = { folders: [], notes: [] };

	if (dragItem.type === "folder") {
		const movingFolder = foldersById.get(dragItem.id);
		if (!movingFolder) {
			return null;
		}

		if (dropTarget.kind === "note") {
			return null;
		}

		if (dropTarget.kind === "folder" && dropTarget.mode === "inside") {
			return null;
		}

		const nextParentId =
			dropTarget.kind === "root"
				? null
				: dropTarget.mode === "inside"
					? dropTarget.folderId
					: dropTarget.parentId;

		if (nextParentId === movingFolder.id || isWorkspaceFolderDescendant(nextParentId, movingFolder.id, foldersById)) {
			return null;
		}

		const previousParentId = movingFolder.parentId ?? null;
		const destinationSiblings = sortFolders(
			Array.from(foldersById.values()).filter((folder) => (folder.parentId ?? null) === nextParentId && folder.id !== movingFolder.id),
		);

		let insertIndex = destinationSiblings.length;
		if (dropTarget.kind === "folder" && dropTarget.mode !== "inside") {
			const targetIndex = destinationSiblings.findIndex((folder) => folder.id === dropTarget.folderId);
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
			updates.folders.push({ id: folder.id, parentId: folder.parentId ?? null, order: folder.order ?? 0 });
		});

		if (previousParentId !== nextParentId) {
			const sourceSiblings = sortFolders(
				Array.from(foldersById.values()).filter((folder) => (folder.parentId ?? null) === previousParentId && folder.id !== movingFolder.id),
			);
			sourceSiblings.forEach((folder, index) => {
				folder.order = index * ORDER_STEP;
				foldersById.set(folder.id, folder);
				updates.folders.push({ id: folder.id, parentId: folder.parentId ?? null, order: folder.order ?? 0 });
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

		const previousParentId = movingNote.folderId ?? null;
		const targetNoteId = dropTarget.kind === "note" ? dropTarget.noteId : null;
		const destinationSiblings = sortNotes(
			Array.from(notesById.values()).filter((note) => (note.folderId ?? null) === nextParentId && note.id !== movingNote.id),
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
			updates.notes.push({ id: note.id, folderId: note.folderId ?? null, order: note.order ?? 0 });
		});

		if (previousParentId !== nextParentId) {
			const sourceSiblings = sortNotes(
				Array.from(notesById.values()).filter((note) => (note.folderId ?? null) === previousParentId && note.id !== movingNote.id),
			);
			sourceSiblings.forEach((note, index) => {
				note.order = index * ORDER_STEP;
				notesById.set(note.id, note);
				updates.notes.push({ id: note.id, folderId: note.folderId ?? null, order: note.order ?? 0 });
			});
		}
	}

	const dedupedFolders = Array.from(new Map(updates.folders.map((entry) => [entry.id, entry])).values());
	const dedupedNotes = Array.from(new Map(updates.notes.map((entry) => [entry.id, entry])).values());

	return {
		tree: buildWorkspaceTreeFromFlatData(Array.from(foldersById.values()), Array.from(notesById.values())),
		payload: { folders: dedupedFolders, notes: dedupedNotes },
	};
}
