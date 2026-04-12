export const MAX_FOLDER_DEPTH = 5;

export type FolderParentRef = {
	id: string;
	parentId: string | null;
};

type DepthComputationState = {
	depthById: Map<string, number>;
	visiting: Set<string>;
	maxDepth: number;
};

function resolveFolderDepth(folderId: string, parentById: Map<string, string | null>, state: DepthComputationState): number {
	const cachedDepth = state.depthById.get(folderId);
	if (cachedDepth !== undefined) {
		return cachedDepth;
	}

	if (state.visiting.has(folderId)) {
		return state.maxDepth + 1;
	}

	state.visiting.add(folderId);
	const parentId = parentById.get(folderId) ?? null;
	const depth = parentId ? resolveFolderDepth(parentId, parentById, state) + 1 : 1;
	state.visiting.delete(folderId);
	state.depthById.set(folderId, depth);
	return depth;
}

export function buildFolderParentMap(folders: FolderParentRef[]): Map<string, string | null> {
	return new Map(folders.map((folder) => [folder.id, folder.parentId]));
}

export function buildFolderDepthMap(folders: FolderParentRef[], maxDepth: number = MAX_FOLDER_DEPTH): Map<string, number> {
	const parentById = buildFolderParentMap(folders);
	const state: DepthComputationState = {
		depthById: new Map<string, number>(),
		visiting: new Set<string>(),
		maxDepth,
	};

	for (const folder of folders) {
		resolveFolderDepth(folder.id, parentById, state);
	}

	return state.depthById;
}

export function canCreateFolderUnderParent(
	parentId: string | null,
	folderDepthById: Map<string, number>,
	maxDepth: number = MAX_FOLDER_DEPTH,
): boolean {
	if (!parentId) {
		return maxDepth >= 1;
	}

	const parentDepth = folderDepthById.get(parentId);
	if (parentDepth === undefined) {
		return false;
	}

	return parentDepth + 1 <= maxDepth;
}

export function folderHierarchyExceedsMaxDepth(folderParents: Map<string, string | null>, maxDepth: number = MAX_FOLDER_DEPTH): boolean {
	const depths = buildFolderDepthMap(
		Array.from(folderParents.entries()).map(([id, parentId]) => ({
			id,
			parentId,
		})),
		maxDepth,
	);

	for (const depth of depths.values()) {
		if (depth > maxDepth) {
			return true;
		}
	}

	return false;
}