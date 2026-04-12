export interface SearchResult {
	id: string;
	title: string;
	snippet: string;
	score: number;
	updatedAt: string;
	parentId: string | null;
}

export interface SearchResponse {
	results: SearchResult[];
}
