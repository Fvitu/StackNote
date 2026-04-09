export type HomeFileMediaType = "pdf" | "audio" | "image" | "video";

export interface HomeFileItem {
	id: string;
	noteId: string;
	name: string;
	mediaType: HomeFileMediaType;
	mimeType: string;
	createdAt: string;
}

export interface HomeNoteItem {
	id: string;
	title: string;
	emoji: string | null;
	folderId: string | null;
	order: number;
	updatedAt: string;
	files: HomeFileItem[];
}

export interface HomeFolderItem {
	id: string;
	name: string;
	parentId: string | null;
	order: number;
	updatedAt: string;
	children: HomeFolderItem[];
	notes: HomeNoteItem[];
}

export interface HomeFileTree {
	folders: HomeFolderItem[];
	rootNotes: HomeNoteItem[];
}
