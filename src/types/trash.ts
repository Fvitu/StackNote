export type TrashedItemType = "note" | "folder";

export interface TrashedItem {
	id: string;
	type: TrashedItemType;
	name: string;
	deletedAt: string;
	expiresAt: string;
	childCount?: number;
	emoji?: string | null;
	coverImage?: string | null;
}

export interface TrashListResponse {
	items: TrashedItem[];
	nextCursor: string | null;
}

export interface TrashMutationResponse {
	restoredCount?: number;
	deletedCount?: number;
}
