import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { buildCacheKey, cacheDelete, cacheGetJson, cacheSetJson } from "@/lib/cache";
import { noteContentToText } from "@/lib/ai/note-content";
import { resolveSttModel, resolveTextModel } from "@/lib/groq-models";
import { getUsageStats, type UsageStats } from "@/lib/rate-limit";
import type { WorkspaceTree, FolderTreeItem, NoteTreeItem } from "@/types";

const CURRENT_WORKSPACE_TTL_SECONDS = 60;
const SETTINGS_TTL_SECONDS = 60;
const TREE_TTL_SECONDS = 30;

export type WorkspaceSummary = {
	id: string;
	name: string;
};

export type UserSettingsSummary = {
	preferredTextModel: string;
	preferredSttModel: string;
};

function buildWorkspaceKey(userId: string) {
	return buildCacheKey("stacknote", "user", userId, "workspace", "current");
}

function buildSettingsKey(userId: string) {
	return buildCacheKey("stacknote", "user", userId, "settings");
}

function buildTreeKey(userId: string, workspaceId: string) {
	return buildCacheKey("stacknote", "user", userId, "workspace", workspaceId, "tree");
}

const getCurrentWorkspaceUncached = unstable_cache(
	async (userId: string) => {
		return prisma.workspace.findFirst({
			where: { userId },
			orderBy: { createdAt: "asc" },
			select: { id: true, name: true },
		});
	},
	["stacknote-current-workspace"],
	{ revalidate: 60 },
);

export async function getCurrentWorkspace(userId: string): Promise<WorkspaceSummary | null> {
	const cachedWorkspace = await cacheGetJson<WorkspaceSummary>(buildWorkspaceKey(userId));
	if (cachedWorkspace) {
		return cachedWorkspace;
	}

	const workspace = await getCurrentWorkspaceUncached(userId);
	if (!workspace) {
		return null;
	}

	await cacheSetJson(buildWorkspaceKey(userId), workspace, CURRENT_WORKSPACE_TTL_SECONDS);
	return workspace;
}

export async function invalidateCurrentWorkspace(userId: string) {
	await cacheDelete(buildWorkspaceKey(userId));
}

export async function getUserSettings(userId: string): Promise<UserSettingsSummary> {
	const cachedSettings = await cacheGetJson<UserSettingsSummary>(buildSettingsKey(userId));
	if (cachedSettings) {
		return cachedSettings;
	}

	const settings = await prisma.userSettings.findUnique({
		where: { userId },
		select: {
			preferredTextModel: true,
			preferredSttModel: true,
		},
	});

	const normalizedSettings = {
		preferredTextModel: resolveTextModel(undefined, settings?.preferredTextModel),
		preferredSttModel: resolveSttModel(undefined, settings?.preferredSttModel),
	} satisfies UserSettingsSummary;

	await cacheSetJson(buildSettingsKey(userId), normalizedSettings, SETTINGS_TTL_SECONDS);
	return normalizedSettings;
}

export async function invalidateUserSettings(userId: string) {
	await cacheDelete(buildSettingsKey(userId));
}

function buildWorkspaceTree(folders: Array<{ id: string; name: string; parentId: string | null }>, notes: Array<{ id: string; title: string; emoji: string | null; folderId: string | null }>): WorkspaceTree {
	const folderMap = new Map<string, FolderTreeItem>();

	for (const folder of folders) {
		folderMap.set(folder.id, {
			id: folder.id,
			name: folder.name,
			type: "folder",
			children: [],
			notes: [],
		});
	}

	const rootNotes: NoteTreeItem[] = [];
	for (const note of notes) {
		const item: NoteTreeItem = {
			id: note.id,
			title: note.title,
			emoji: note.emoji,
			folderId: note.folderId,
			type: "note",
		};

		if (note.folderId && folderMap.has(note.folderId)) {
			folderMap.get(note.folderId)?.notes.push(item);
			continue;
		}

		rootNotes.push(item);
	}

	const rootFolders: FolderTreeItem[] = [];
	for (const folder of folders) {
		const current = folderMap.get(folder.id);
		if (!current) {
			continue;
		}

		if (folder.parentId && folderMap.has(folder.parentId)) {
			folderMap.get(folder.parentId)?.children.push(current);
			continue;
		}

		rootFolders.push(current);
	}

	return {
		folders: rootFolders,
		rootNotes,
	};
}

export async function getWorkspaceTree(userId: string, workspaceId: string, options?: { skipOwnershipCheck?: boolean }): Promise<WorkspaceTree | null> {
	const cachedTree = await cacheGetJson<WorkspaceTree>(buildTreeKey(userId, workspaceId));
	if (cachedTree) {
		return cachedTree;
	}

	if (!options?.skipOwnershipCheck) {
		const workspace = await prisma.workspace.findFirst({
			where: { id: workspaceId, userId },
			select: { id: true },
		});

		if (!workspace) {
			return null;
		}
	}

	const [folders, notes] = await Promise.all([
		prisma.folder.findMany({
			where: { workspaceId },
			orderBy: { order: "asc" },
			select: {
				id: true,
				name: true,
				parentId: true,
				order: true,
			},
		}),
		prisma.note.findMany({
			where: { workspaceId, isArchived: false },
			orderBy: { order: "asc" },
			select: {
				id: true,
				title: true,
				emoji: true,
				folderId: true,
				order: true,
				isArchived: true,
			},
		}),
	]);

	const tree = buildWorkspaceTree(
		folders.map(({ id, name, parentId }) => ({ id, name, parentId })),
		notes.map(({ id, title, emoji, folderId }) => ({ id, title, emoji, folderId })),
	);

	await cacheSetJson(buildTreeKey(userId, workspaceId), tree, TREE_TTL_SECONDS);
	return tree;
}

export async function invalidateWorkspaceTree(userId: string, workspaceId: string) {
	await cacheDelete(buildTreeKey(userId, workspaceId));
}

export type ContextNoteSummary = {
	id: string;
	title: string;
	emoji: string | null;
	folderId: string | null;
	path: string;
	contentText: string;
};

export async function getWorkspaceContextNotes(userId: string, workspaceId: string): Promise<ContextNoteSummary[] | null> {
	const workspace = await prisma.workspace.findFirst({
		where: { id: workspaceId, userId },
		select: { id: true },
	});

	if (!workspace) {
		return null;
	}

	const [notes, folders] = await Promise.all([
		prisma.note.findMany({
			where: { workspaceId, isArchived: false },
			orderBy: { order: "asc" },
			select: {
				id: true,
				title: true,
				emoji: true,
				folderId: true,
				content: true,
			},
		}),
		prisma.folder.findMany({
			where: { workspaceId },
			select: {
				id: true,
				name: true,
				parentId: true,
			},
		}),
	]);

	const folderMap = new Map(folders.map((folder) => [folder.id, folder]));

	const buildFolderPath = (folderId: string | null) => {
		if (!folderId) {
			return "Workspace";
		}

		const segments: string[] = [];
		let currentFolderId: string | null = folderId;

		while (currentFolderId) {
			const folder = folderMap.get(currentFolderId);
			if (!folder) {
				break;
			}

			segments.unshift(folder.name);
			currentFolderId = folder.parentId;
		}

		return segments.length > 0 ? segments.join(" / ") : "Workspace";
	};

	return notes.map((note) => ({
		id: note.id,
		title: note.title,
		emoji: note.emoji,
		folderId: note.folderId,
		path: buildFolderPath(note.folderId),
		contentText: noteContentToText(note.content),
	}));
}

export async function getAiUsage(userId: string): Promise<UsageStats> {
	return getUsageStats(userId);
}
