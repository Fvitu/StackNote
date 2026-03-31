"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { AppShellSkeleton } from "@/components/layout/AppShellSkeleton";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { fetchJson } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { BootstrapResponse } from "@/lib/bootstrap";
import type { WorkspaceTree, NoteTreeItem, FolderTreeItem } from "@/types";
import {
	addFolderToTree,
	addNoteToTree,
	moveFolderInTree,
	moveNoteInTree,
	removeFolderFromTree,
	removeNoteFromTree,
	updateFolderInTree,
	updateNoteInTree,
} from "@/lib/tree-helpers";

const EMPTY_TREE: WorkspaceTree = { folders: [], rootNotes: [] };
const SearchModalClient = dynamic(() => import("@/components/search/SearchModal").then((module) => module.SearchModal), { ssr: false });
const NameCaptureDialogClient = dynamic(() => import("@/components/layout/NameCaptureDialog").then((module) => module.NameCaptureDialog), { ssr: false });
const AccountDialogClient = dynamic(() => import("@/components/layout/AccountDialog").then((module) => module.AccountDialog), { ssr: false });

interface AppShellProps {
	children: React.ReactNode;
	initialShell: {
		workspaceName: string;
		userName: string | null;
		userEmail: string;
		isGuestUser: boolean;
		isGoogleUser: boolean;
		needsName: boolean;
	};
}

function AppShellInner({ initialShell }: Pick<AppShellProps, "initialShell">) {
	const queryClient = useQueryClient();
	const bootstrapQuery = useQuery({
		queryKey: queryKeys.bootstrap,
		queryFn: () => fetchJson<BootstrapResponse>("/api/bootstrap"),
		staleTime: 15_000,
	});

	const bootstrapData = bootstrapQuery.data;
	const workspaceId = bootstrapData?.workspace.id ?? "";
	const treeQuery = useQuery({
		queryKey: queryKeys.workspaceTree(workspaceId),
		queryFn: () => fetchJson<WorkspaceTree>(`/api/workspace/${workspaceId}/tree`),
		enabled: workspaceId.length > 0,
		initialData: bootstrapData?.tree,
		staleTime: 30_000,
	});

	const tree = treeQuery.data ?? EMPTY_TREE;
	const [searchOpen, setSearchOpen] = useState(false);
	const [showNameDialog, setShowNameDialog] = useState(initialShell.needsName);
	const [accountDialogOpen, setAccountDialogOpen] = useState(false);
	const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
	const [currentWorkspaceName, setCurrentWorkspaceName] = useState(initialShell.workspaceName);
	const [currentUserName, setCurrentUserName] = useState(initialShell.userName ?? "");
	const [isSidebarPreviewOpen, setIsSidebarPreviewOpen] = useState(false);
	const [isMobileSidebarMode, setIsMobileSidebarMode] = useState(false);
	const [canUseSidebarPreview, setCanUseSidebarPreview] = useState(false);
	const { state, setActiveNote, toggleFolder, toggleSidebar, setSidebarOpen } = useWorkspace();

	useEffect(() => {
		if (!bootstrapData) {
			return;
		}

		setCurrentWorkspaceName(bootstrapData.workspace.name);
		setCurrentUserName(bootstrapData.user.name ?? "");
		setShowNameDialog(bootstrapData.auth.needsName);
		queryClient.setQueryData(queryKeys.currentWorkspace, bootstrapData.workspace);
		queryClient.setQueryData(queryKeys.currentUser, bootstrapData.user);
		queryClient.setQueryData(queryKeys.settings, bootstrapData.settings);
		queryClient.setQueryData(queryKeys.aiUsage, bootstrapData.aiUsage);
		queryClient.setQueryData(queryKeys.workspaceTree(bootstrapData.workspace.id), bootstrapData.tree);
	}, [bootstrapData, queryClient]);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const noteId = params.get("note");
		const folderId = params.get("folder");

		if (noteId) {
			setActiveNote(noteId);
		}

		if (folderId) {
			setActiveFolderId(folderId);
			toggleFolder(folderId);
		}
		// Intentionally run once to hydrate initial app state from URL.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);

		if (state.activeNoteId) {
			params.set("note", state.activeNoteId);
		} else {
			params.delete("note");
		}

		if (activeFolderId) {
			params.set("folder", activeFolderId);
		} else {
			params.delete("folder");
		}

		const query = params.toString();
		const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
		window.history.replaceState(null, "", nextUrl);
	}, [state.activeNoteId, activeFolderId]);

	const fetchTree = useCallback(async () => {
		if (!workspaceId) {
			return;
		}

		await queryClient.invalidateQueries({
			queryKey: queryKeys.workspaceTree(workspaceId),
		});
	}, [queryClient, workspaceId]);

	const showSidebarPreview = useCallback(() => {
		if (state.isSidebarOpen) return;
		setIsSidebarPreviewOpen(true);
	}, [state.isSidebarOpen]);

	const hideSidebarPreview = useCallback(() => {
		if (state.isSidebarOpen) return;
		setIsSidebarPreviewOpen(false);
	}, [state.isSidebarOpen]);

	useEffect(() => {
		if (state.isSidebarOpen) {
			setIsSidebarPreviewOpen(false);
		}
	}, [state.isSidebarOpen]);

	useEffect(() => {
		if (typeof window === "undefined") return;

		const mobileQuery = window.matchMedia("(max-width: 767px)");
		const mediaQuery = window.matchMedia("(min-width: 768px) and (hover: hover) and (pointer: fine)");
		const updateViewportMode = () => {
			setIsMobileSidebarMode(mobileQuery.matches);
			setCanUseSidebarPreview(mediaQuery.matches);
			if (!mediaQuery.matches) {
				setIsSidebarPreviewOpen(false);
			}
		};

		updateViewportMode();
		mobileQuery.addEventListener("change", updateViewportMode);
		mediaQuery.addEventListener("change", updateViewportMode);

		return () => {
			mobileQuery.removeEventListener("change", updateViewportMode);
			mediaQuery.removeEventListener("change", updateViewportMode);
		};
	}, []);

	const openSidebarDocked = useCallback(() => {
		setIsSidebarPreviewOpen(false);
		setSidebarOpen(true);
	}, [setSidebarOpen]);

	const handleSidebarToggleButton = useCallback(() => {
		if (isMobileSidebarMode) {
			toggleSidebar();
			return;
		}

		if (state.isSidebarOpen) {
			toggleSidebar();
			return;
		}

		openSidebarDocked();
	}, [isMobileSidebarMode, openSidebarDocked, state.isSidebarOpen, toggleSidebar]);

	const optimisticAction = useCallback(
		async <T,>(
			optimisticUpdate: (currentTree: WorkspaceTree) => WorkspaceTree,
			serverAction: () => Promise<T>,
			onSuccess?: (result: T) => void,
		): Promise<T | null> => {
			if (!workspaceId) {
				return null;
			}

			const treeKey = queryKeys.workspaceTree(workspaceId);
			const previousTree = queryClient.getQueryData<WorkspaceTree>(treeKey) ?? EMPTY_TREE;
			queryClient.setQueryData(treeKey, optimisticUpdate(previousTree));

			try {
				const result = await serverAction();
				onSuccess?.(result);
				await fetchTree();
				return result;
			} catch (error) {
				console.error("Action failed:", error);
				queryClient.setQueryData(treeKey, previousTree);
				return null;
			}
		},
		[fetchTree, queryClient, workspaceId],
	);

	const handleCreateNote = useCallback(
		async (folderId?: string) => {
			const tempId = `temp-${Date.now()}`;
			const tempNote: NoteTreeItem = {
				id: tempId,
				title: "Untitled",
				emoji: null,
				type: "note",
			};

			return optimisticAction(
				(currentTree) => addNoteToTree(currentTree, tempNote, folderId),
				async () => {
					const note = await fetchJson<{ id: string }>("/api/notes", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ workspaceId, folderId }),
					});
					return note;
				},
				(newNote) => {
					setActiveNote(newNote.id);
				},
			);
		},
		[optimisticAction, setActiveNote, workspaceId],
	);

	const handleCreateFolder = useCallback(
		async (parentId?: string) => {
			const tempId = `temp-folder-${Date.now()}`;
			const tempFolder: FolderTreeItem = {
				id: tempId,
				name: "New Folder",
				type: "folder",
				children: [],
				notes: [],
			};

			return optimisticAction(
				(currentTree) => addFolderToTree(currentTree, tempFolder, parentId),
				async () => {
					const folder = await fetchJson<{ id: string }>("/api/folders", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ workspaceId, parentId, name: "New Folder" }),
					});
					return folder;
				},
			);
		},
		[optimisticAction, workspaceId],
	);

	const handleDeleteNote = useCallback(
		async (noteId: string) => {
			return optimisticAction(
				(currentTree) => removeNoteFromTree(currentTree, noteId),
				async () => {
					await fetchJson<{ success: boolean }>(`/api/notes/${noteId}`, { method: "DELETE" });
				},
			);
		},
		[optimisticAction],
	);

	const handleDeleteFolder = useCallback(
		async (folderId: string) => {
			return optimisticAction(
				(currentTree) => removeFolderFromTree(currentTree, folderId),
				async () => {
					await fetchJson<{ success: boolean }>(`/api/folders/${folderId}`, { method: "DELETE" });
				},
			);
		},
		[optimisticAction],
	);

	const handleRenameNote = useCallback(
		async (noteId: string, title: string) => {
			return optimisticAction(
				(currentTree) => updateNoteInTree(currentTree, noteId, { title }),
				async () => {
					await fetchJson(`/api/notes/${noteId}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ title }),
					});
				},
			);
		},
		[optimisticAction],
	);

	const handleRenameFolder = useCallback(
		async (folderId: string, name: string) => {
			return optimisticAction(
				(currentTree) => updateFolderInTree(currentTree, folderId, { name }),
				async () => {
					await fetchJson(`/api/folders/${folderId}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ name }),
					});
				},
			);
		},
		[optimisticAction],
	);

	const handleMoveNote = useCallback(
		async (noteId: string, folderId: string | null) => {
			return optimisticAction(
				(currentTree) => moveNoteInTree(currentTree, noteId, folderId),
				async () => {
					await fetchJson(`/api/notes/${noteId}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ folderId }),
					});
				},
			);
		},
		[optimisticAction],
	);

	const handleMoveFolder = useCallback(
		async (folderId: string, parentId: string | null) => {
			return optimisticAction(
				(currentTree) => moveFolderInTree(currentTree, folderId, parentId),
				async () => {
					await fetchJson(`/api/folders/${folderId}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ parentId }),
					});
				},
			);
		},
		[optimisticAction],
	);

	const updateUserName = useCallback(async (name: string) => {
		await fetchJson<{ success: boolean }>("/api/user/name", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name }),
		});

		setCurrentUserName(name);
		queryClient.setQueryData(queryKeys.currentUser, (currentUser: BootstrapResponse["user"] | undefined) =>
			currentUser
				? {
						...currentUser,
						name,
					}
				: currentUser,
		);
		setShowNameDialog(false);
	}, [queryClient]);

	const updateWorkspaceName = useCallback(
		async (name: string) => {
			const workspace = await fetchJson<{ id: string; name: string }>(`/api/workspace/${workspaceId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});

			setCurrentWorkspaceName(workspace.name);
			queryClient.setQueryData(queryKeys.currentWorkspace, workspace);
		},
		[queryClient, workspaceId],
	);

	const handleNameSubmit = useCallback(
		async (name: string) => {
			try {
				await updateUserName(name);
				setShowNameDialog(false);
			} catch (error) {
				console.error("Failed to update name:", error);
				throw error;
			}
		},
		[updateUserName],
	);

	useKeyboardShortcut("k", () => setSearchOpen((value) => !value), { metaOrCtrl: true, preventDefault: true });
	useKeyboardShortcut("\\", () => toggleSidebar(), { metaOrCtrl: true, preventDefault: true });

	const sidebarProps = useMemo(
		() =>
			bootstrapData
				? {
						workspaceId,
						workspaceName: currentWorkspaceName,
						userEmail: bootstrapData.auth.isGuestUser ? "" : bootstrapData.user.email,
						userName: currentUserName,
						isGoogleUser: bootstrapData.auth.isGoogleUser,
						isGuestUser: bootstrapData.auth.isGuestUser,
						tree,
						onRefresh: fetchTree,
						onSearchOpen: () => setSearchOpen(true),
						onAccountOpen: () => {
							setAccountDialogOpen(true);
							if (typeof window !== "undefined" && (isMobileSidebarMode || window.innerWidth < 768)) {
								setSidebarOpen(false);
							}
						},
						onCreateNote: handleCreateNote,
						onCreateFolder: handleCreateFolder,
						onDeleteNote: handleDeleteNote,
						onDeleteFolder: handleDeleteFolder,
						onRenameNote: handleRenameNote,
						onRenameFolder: handleRenameFolder,
						onMoveNote: handleMoveNote,
						onMoveFolder: handleMoveFolder,
						onFolderVisited: setActiveFolderId,
				  }
				: null,
		[
			bootstrapData,
			currentUserName,
			currentWorkspaceName,
			fetchTree,
			handleCreateFolder,
			handleCreateNote,
			handleDeleteFolder,
			handleDeleteNote,
			handleMoveFolder,
			handleMoveNote,
			handleRenameFolder,
			handleRenameNote,
			isMobileSidebarMode,
			queryClient,
			setSidebarOpen,
			tree,
			workspaceId,
		],
	);

	useEffect(() => {
		const onEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setSearchOpen(false);
			}
		};

		window.addEventListener("keydown", onEscape);
		return () => window.removeEventListener("keydown", onEscape);
	}, []);

	if (bootstrapQuery.isError) {
		return (
			<div className="flex h-screen items-center justify-center" style={{ backgroundColor: "#000000", color: "var(--text-primary)" }}>
				<div className="space-y-4 text-center">
					<p className="text-sm">Failed to load your workspace.</p>
					<button
						type="button"
						onClick={() => void bootstrapQuery.refetch()}
						className="rounded-[var(--sn-radius-md)] px-4 py-2 text-sm"
						style={{ backgroundColor: "var(--accent-muted)", color: "var(--sn-accent)" }}>
						Retry
					</button>
				</div>
			</div>
		);
	}

	if (bootstrapQuery.isPending || !bootstrapData || !sidebarProps) {
		return (
			<AppShellSkeleton
				workspaceName={currentWorkspaceName || initialShell.workspaceName}
				userName={currentUserName || initialShell.userName}
				userEmail={initialShell.userEmail}
			/>
		);
	}

	return (
		<div className="relative flex h-screen overflow-hidden" style={{ backgroundColor: "var(--bg-app)" }}>
			{canUseSidebarPreview && !isMobileSidebarMode && !state.isSidebarOpen && (
				<div className="sidebar-preview-trigger" onMouseEnter={showSidebarPreview} aria-hidden="true" />
			)}
			<div
				className={`sidebar-dock ${state.isSidebarOpen ? "sidebar-dock-open" : "sidebar-dock-closed"}`}
				style={{ width: state.isSidebarOpen && !isMobileSidebarMode ? state.sidebarWidth : 0 }}>
				<div className={`sidebar-surface ${state.isSidebarOpen ? "sidebar-surface-open" : "sidebar-surface-closed"}`}>
					<Sidebar {...sidebarProps} />
				</div>
			</div>
			{isMobileSidebarMode && state.isSidebarOpen && (
				<>
					<button type="button" className="sidebar-mobile-backdrop" onClick={toggleSidebar} aria-label="Close sidebar overlay" />
					<div className="sidebar-mobile-layer" style={{ width: state.sidebarWidth }}>
						<div className="sidebar-surface sidebar-surface-open sidebar-mobile-surface">
							<Sidebar {...sidebarProps} />
						</div>
					</div>
				</>
			)}
			{canUseSidebarPreview && !isMobileSidebarMode && !state.isSidebarOpen && (
				<div
					className={`sidebar-preview-layer ${isSidebarPreviewOpen ? "sidebar-preview-layer-open" : ""}`}
					style={{ width: state.sidebarWidth }}
					onMouseEnter={showSidebarPreview}
					onMouseLeave={hideSidebarPreview}
					aria-hidden={!isSidebarPreviewOpen}>
					<div className={`sidebar-surface sidebar-preview-surface ${isSidebarPreviewOpen ? "sidebar-surface-open" : "sidebar-surface-closed"}`}>
						<Sidebar {...sidebarProps} />
					</div>
				</div>
			)}
			<MainContent
				workspaceId={workspaceId}
				workspaceName={currentWorkspaceName}
				onNoteCreated={fetchTree}
				onRefresh={fetchTree}
				isSidebarOpen={state.isSidebarOpen}
				onToggleSidebar={handleSidebarToggleButton}
				tree={tree}
			/>
			<SearchModalClient
				workspaceId={workspaceId}
				open={searchOpen}
				onSelectNote={(id) => {
					setActiveNote(id);
					if (typeof window !== "undefined" && window.innerWidth < 768) {
						toggleSidebar();
					}
				}}
				onClose={() => setSearchOpen(false)}
			/>
			<AccountDialogClient
				open={accountDialogOpen}
				userName={currentUserName}
				userEmail={bootstrapData.auth.isGuestUser ? "" : bootstrapData.user.email}
				workspaceName={currentWorkspaceName}
				isGoogleUser={bootstrapData.auth.isGoogleUser}
				isGuestUser={bootstrapData.auth.isGuestUser}
				onClose={() => setAccountDialogOpen(false)}
				onSaveUserName={updateUserName}
				onSaveWorkspaceName={updateWorkspaceName}
			/>
			<NameCaptureDialogClient open={showNameDialog} onNameSubmit={handleNameSubmit} />
		</div>
	);
}

export function AppShell({ initialShell }: AppShellProps) {
	return (
		<WorkspaceProvider>
			<AppShellInner initialShell={initialShell} />
		</WorkspaceProvider>
	);
}
