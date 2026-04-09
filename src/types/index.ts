export type WorkspaceFileMediaType = "pdf" | "audio" | "image" | "video";

export interface WorkspaceFileTreeItem {
	id: string;
	mediaType: WorkspaceFileMediaType;
}

export interface NoteTreeItem {
	id: string;
	title: string;
	emoji?: string | null;
	contentText?: string;
	createdAt?: string;
	updatedAt?: string;
	folderId?: string | null;
	order?: number;
	files?: WorkspaceFileTreeItem[];
	type: "note";
}

export interface FolderTreeItem {
	id: string;
	name: string;
	parentId?: string | null;
	order?: number;
	type: "folder";
	children: FolderTreeItem[];
	notes: NoteTreeItem[];
}

export interface WorkspaceTree {
	folders: FolderTreeItem[];
	rootNotes: NoteTreeItem[];
}
