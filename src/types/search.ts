export type SearchMode = "recent" | "search";
export type SearchMatchType = "semantic" | "fulltext" | "hybrid";

export interface SearchResult {
	id: string;
	title: string;
	snippet: string;
	matchType: SearchMatchType;
	score: number;
	updatedAt: string;
	parentId: string | null;
	emoji?: string | null;
}

export interface SearchResponse {
	mode: SearchMode;
	results: SearchResult[];
}
