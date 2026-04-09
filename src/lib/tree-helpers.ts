import type { WorkspaceTree, FolderTreeItem, NoteTreeItem } from "../types";

// Helper to create a deep copy of the tree
export function cloneTree(tree: WorkspaceTree): WorkspaceTree {
	return JSON.parse(JSON.stringify(tree));
}

// Helper to add a note to the tree
export function addNoteToTree(tree: WorkspaceTree, note: NoteTreeItem, folderId?: string | null): WorkspaceTree {
	const newTree = cloneTree(tree);
	const noteWithLocation: NoteTreeItem = {
		...note,
		folderId: folderId ?? null,
	};

	if (!folderId) {
		// Add to root
		newTree.rootNotes.unshift(noteWithLocation);
	} else {
		// Add to folder
		const addToFolder = (folders: FolderTreeItem[]): boolean => {
			for (const folder of folders) {
				if (folder.id === folderId) {
					folder.notes.unshift(noteWithLocation);
					return true;
				}
				if (addToFolder(folder.children)) return true;
			}
			return false;
		};
		addToFolder(newTree.folders);
	}

	return newTree;
}

// Helper to remove a note from the tree
export function removeNoteFromTree(tree: WorkspaceTree, noteId: string): WorkspaceTree {
	const newTree = cloneTree(tree);

	// Remove from root
	newTree.rootNotes = newTree.rootNotes.filter((n) => n.id !== noteId);

	// Remove from folders
	const removeFromFolders = (folders: FolderTreeItem[]) => {
		for (const folder of folders) {
			folder.notes = folder.notes.filter((n) => n.id !== noteId);
			removeFromFolders(folder.children);
		}
	};
	removeFromFolders(newTree.folders);

	return newTree;
}

// Helper to add a folder to the tree
export function addFolderToTree(tree: WorkspaceTree, folder: FolderTreeItem, parentId?: string | null): WorkspaceTree {
	const newTree = cloneTree(tree);
	const folderWithParent: FolderTreeItem = {
		...folder,
		parentId: parentId ?? null,
	};

	if (!parentId) {
		// Add to root
		newTree.folders.unshift(folderWithParent);
	} else {
		// Add to parent folder
		const addToParent = (folders: FolderTreeItem[]): boolean => {
			for (const f of folders) {
				if (f.id === parentId) {
					f.children.unshift(folderWithParent);
					return true;
				}
				if (addToParent(f.children)) return true;
			}
			return false;
		};
		addToParent(newTree.folders);
	}

	return newTree;
}

// Helper to remove a folder from the tree
export function removeFolderFromTree(tree: WorkspaceTree, folderId: string): WorkspaceTree {
	const newTree = cloneTree(tree);

	// Remove from root
	newTree.folders = newTree.folders.filter((f) => f.id !== folderId);

	// Remove from nested folders
	const removeFromFolders = (folders: FolderTreeItem[]) => {
		for (const folder of folders) {
			folder.children = folder.children.filter((f) => f.id !== folderId);
			removeFromFolders(folder.children);
		}
	};
	removeFromFolders(newTree.folders);

	return newTree;
}

// Helper to update note title in tree
export function updateNoteInTree(tree: WorkspaceTree, noteId: string, updates: Partial<NoteTreeItem>): WorkspaceTree {
	const newTree = cloneTree(tree);

	// Update in root
	const rootNote = newTree.rootNotes.find((n) => n.id === noteId);
	if (rootNote) {
		Object.assign(rootNote, updates);
		return newTree;
	}

	// Update in folders
	const updateInFolders = (folders: FolderTreeItem[]): boolean => {
		for (const folder of folders) {
			const note = folder.notes.find((n) => n.id === noteId);
			if (note) {
				Object.assign(note, updates);
				return true;
			}
			if (updateInFolders(folder.children)) return true;
		}
		return false;
	};
	updateInFolders(newTree.folders);

	return newTree;
}

// Helper to update folder name in tree
export function updateFolderInTree(tree: WorkspaceTree, folderId: string, updates: Partial<Pick<FolderTreeItem, "name">>): WorkspaceTree {
	const newTree = cloneTree(tree);

	const updateInFolders = (folders: FolderTreeItem[]): boolean => {
		for (const folder of folders) {
			if (folder.id === folderId) {
				Object.assign(folder, updates);
				return true;
			}
			if (updateInFolders(folder.children)) return true;
		}
		return false;
	};

	updateInFolders(newTree.folders);
	return newTree;
}

// Helper to move a note to a different folder
export function moveNoteInTree(tree: WorkspaceTree, noteId: string, targetFolderId: string | null): WorkspaceTree {
	let newTree = cloneTree(tree);

	// Find and remove the note
	let noteToMove: NoteTreeItem | null = null;

	// Check root notes
	const rootNoteIndex = newTree.rootNotes.findIndex((n) => n.id === noteId);
	if (rootNoteIndex >= 0) {
		noteToMove = newTree.rootNotes[rootNoteIndex];
		newTree.rootNotes.splice(rootNoteIndex, 1);
	}

	// Check folders
	if (!noteToMove) {
		const findAndRemove = (folders: FolderTreeItem[]): NoteTreeItem | null => {
			for (const folder of folders) {
				const noteIndex = folder.notes.findIndex((n) => n.id === noteId);
				if (noteIndex >= 0) {
					const found = folder.notes[noteIndex];
					folder.notes.splice(noteIndex, 1);
					return found;
				}
				const result = findAndRemove(folder.children);
				if (result) return result;
			}
			return null;
		};
		noteToMove = findAndRemove(newTree.folders);
	}

	// Add to new location
	if (noteToMove) {
		newTree = addNoteToTree(newTree, { ...noteToMove, folderId: targetFolderId }, targetFolderId);
	}

	return newTree;
}

// Helper to move a folder to a different parent
export function moveFolderInTree(tree: WorkspaceTree, folderId: string, targetParentId: string | null): WorkspaceTree {
	let newTree = cloneTree(tree);

	// Find and remove the folder
	let folderToMove: FolderTreeItem | null = null;

	// Check root folders
	const rootFolderIndex = newTree.folders.findIndex((f) => f.id === folderId);
	if (rootFolderIndex >= 0) {
		folderToMove = newTree.folders[rootFolderIndex];
		newTree.folders.splice(rootFolderIndex, 1);
	}

	// Check nested folders
	if (!folderToMove) {
		const findAndRemove = (folders: FolderTreeItem[]): FolderTreeItem | null => {
			for (const folder of folders) {
				const childIndex = folder.children.findIndex((f) => f.id === folderId);
				if (childIndex >= 0) {
					const found = folder.children[childIndex];
					folder.children.splice(childIndex, 1);
					return found;
				}
				const result = findAndRemove(folder.children);
				if (result) return result;
			}
			return null;
		};
		folderToMove = findAndRemove(newTree.folders);
	}

	// Add to new location
	if (folderToMove) {
		newTree = addFolderToTree(newTree, { ...folderToMove, parentId: targetParentId }, targetParentId);
	}

	return newTree;
}
