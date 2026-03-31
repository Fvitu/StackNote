export const queryKeys = {
	bootstrap: ["bootstrap"] as const,
	currentWorkspace: ["workspace", "current"] as const,
	currentUser: ["viewer"] as const,
	settings: ["settings"] as const,
	aiUsage: ["ai", "usage"] as const,
	workspaceTree: (workspaceId: string) => ["workspace", "tree", workspaceId] as const,
	note: (noteId: string) => ["note", noteId] as const,
};
