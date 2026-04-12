"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelLeftOpen } from "lucide-react";
import { toast } from "sonner";
import { SettingsDockProvider } from "@/contexts/SettingsDockContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { AppShellSkeleton } from "@/components/layout/AppShellSkeleton";
import { PomodoroWidget } from "@/components/pomodoro/PomodoroWidget";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { TrashPanel } from "@/components/trash/TrashPanel";
import { QuickNoteWidget } from "@/components/quick-note/QuickNoteWidget";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { SyncStatusBar } from "@/components/pwa/SyncStatusBar";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchJson, fetchJsonOrNullOnNotFound } from "@/lib/api-client";
import { localNotes } from "@/lib/db/local";
import { queryKeys } from "@/lib/query-keys";
import type { WorkspaceReorderPayload } from "@/lib/workspace-tree-view";
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
const SETTINGS_DOCK_TRANSITION_MS = 220;
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

type SidebarDockPanel = "settings" | "trash";

function getNoteIdFromPathname(pathname: string) {
	const match = /^\/note\/([^/?#]+)$/.exec(pathname);
	return match ? decodeURIComponent(match[1]) : null;
}

function AppShellInner({ initialShell, children }: AppShellProps) {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const router = useRouter();
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
		queryFn: ({ signal }) => fetchJson<WorkspaceTree>(`/api/workspace/${workspaceId}/tree`, { signal }),
		enabled: workspaceId.length > 0,
		initialData: bootstrapData?.tree,
		staleTime: 30_000,
		refetchOnWindowFocus: true,
	});

	const tree = treeQuery.data ?? EMPTY_TREE;
	const [searchOpen, setSearchOpen] = useState(false);
	const [showNameDialog, setShowNameDialog] = useState(initialShell.needsName);
	const [accountDialogOpen, setAccountDialogOpen] = useState(false);
	const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
	const [currentWorkspaceName, setCurrentWorkspaceName] = useState(initialShell.workspaceName);
	const [currentUserName, setCurrentUserName] = useState(initialShell.userName ?? "");
	const [isSidebarPreviewOpen, setIsSidebarPreviewOpen] = useState(false);
	const [activeDockPanel, setActiveDockPanel] = useState<SidebarDockPanel | null>(null);
	const [mountedDockPanel, setMountedDockPanel] = useState<SidebarDockPanel | null>(null);
	const [isDockVisible, setIsDockVisible] = useState(false);
	const [isMobileSidebarMode, setIsMobileSidebarMode] = useState(false);
	const [canUseSidebarPreview, setCanUseSidebarPreview] = useState(false);
	const { state, setActiveNote, expandFolder, toggleSidebar, setSidebarOpen } = useWorkspace();
	const activeRouteNoteId = useMemo(() => getNoteIdFromPathname(pathname), [pathname]);
	const requestedFolderId = pathname === "/" ? searchParams.get("folder")?.trim() || null : null;
	const isHomeRoute = pathname === "/";
	const isPlannerRoute = pathname === "/planner";
	const isNoteRoute = Boolean(activeRouteNoteId);
	const isSidebarVisible = state.isSidebarOpen && !state.isFocusMode;
	const isAiPanelFullscreen = isMobileSidebarMode && state.isAiPanelOpen;
	const settingsDockWidth = 480;
	const previousSidebarVisibleRef = useRef(isSidebarVisible);
	const settingsDockRef = useRef<HTMLDivElement | null>(null);
	const dockedContentOffset = !isMobileSidebarMode && isSidebarVisible ? state.sidebarWidth : 0;
	const isSettingsDockOpen = activeDockPanel === "settings";
	const isTrashDockOpen = activeDockPanel === "trash";
	const isDockMounted = mountedDockPanel !== null;

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
		setActiveNote(activeRouteNoteId);
	}, [activeRouteNoteId, setActiveNote]);

	useEffect(() => {
		setActiveFolderId(requestedFolderId);
		if (requestedFolderId) {
			expandFolder(requestedFolderId);
		}
	}, [expandFolder, requestedFolderId]);

	useEffect(() => {
		if (pathname !== "/") {
			return;
		}

		const params = new URLSearchParams(window.location.search);

		if (activeFolderId) {
			params.set("folder", activeFolderId);
		} else {
			params.delete("folder");
		}

		const query = params.toString();
		const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
		const currentUrl = `${window.location.pathname}${window.location.search}`;
		if (currentUrl !== nextUrl) {
			window.history.replaceState(null, "", nextUrl);
		}
	}, [pathname, activeFolderId]);

	const fetchTree = useCallback(async () => {
		if (!workspaceId) {
			return;
		}

		await queryClient.invalidateQueries({
			queryKey: queryKeys.workspaceTree(workspaceId),
		});
	}, [queryClient, workspaceId]);

	const showSidebarPreview = useCallback(() => {
		if (isSidebarVisible) return;
		setIsSidebarPreviewOpen(true);
	}, [isSidebarVisible]);

	const hideSidebarPreview = useCallback(() => {
		if (isSidebarVisible) return;
		setIsSidebarPreviewOpen(false);
	}, [isSidebarVisible]);

	const hideDockedPanels = useCallback(() => {
		if (!isSidebarVisible) {
			setActiveDockPanel(null);
			setIsSidebarPreviewOpen(false);
		}
	}, [isSidebarVisible]);

	const prepareDockOpen = useCallback(() => {
		if (isMobileSidebarMode) {
			setSidebarOpen(false);
			setIsSidebarPreviewOpen(false);
		}
	}, [isMobileSidebarMode, setSidebarOpen]);

	const openSettingsDock = useCallback(() => {
		prepareDockOpen();
		setActiveDockPanel("settings");
	}, [prepareDockOpen]);

	const toggleSettingsDock = useCallback(() => {
		prepareDockOpen();
		setActiveDockPanel((currentPanel) => (currentPanel === "settings" ? null : "settings"));
	}, [prepareDockOpen]);

	const toggleTrashDock = useCallback(() => {
		prepareDockOpen();
		setActiveDockPanel((currentPanel) => (currentPanel === "trash" ? null : "trash"));
	}, [prepareDockOpen]);

	useEffect(() => {
		if (activeDockPanel && !isSidebarVisible && !isMobileSidebarMode) {
			setIsSidebarPreviewOpen(true);
		}
	}, [activeDockPanel, isMobileSidebarMode, isSidebarVisible]);

	useEffect(() => {
		if (!activeDockPanel && !isSidebarVisible) {
			setIsSidebarPreviewOpen(false);
		}
	}, [activeDockPanel, isSidebarVisible]);

	useEffect(() => {
		if (previousSidebarVisibleRef.current && !isSidebarVisible && !(isMobileSidebarMode && activeDockPanel)) {
			setActiveDockPanel(null);
			setIsSidebarPreviewOpen(false);
		}

		previousSidebarVisibleRef.current = isSidebarVisible;
	}, [activeDockPanel, isMobileSidebarMode, isSidebarVisible]);

	useEffect(() => {
		if (state.isSidebarOpen) {
			setIsSidebarPreviewOpen(false);
		}
	}, [state.isSidebarOpen]);

	useEffect(() => {
		if (activeDockPanel) {
			if (mountedDockPanel !== activeDockPanel) {
				setMountedDockPanel(activeDockPanel);
				return;
			}

			if (!isDockVisible) {
				const frame = window.requestAnimationFrame(() => {
					setIsDockVisible(true);
				});

				return () => {
					window.cancelAnimationFrame(frame);
				};
			}

			return;
		}

		if (isDockVisible) {
			setIsDockVisible(false);
		}

		if (!mountedDockPanel) {
			return;
		}

		const timeout = window.setTimeout(() => {
			setMountedDockPanel(null);
		}, SETTINGS_DOCK_TRANSITION_MS);

		return () => {
			window.clearTimeout(timeout);
		};
	}, [activeDockPanel, isDockVisible, mountedDockPanel]);

	useEffect(() => {
		const handleOpenAccountDialog = () => {
			setAccountDialogOpen(true);
		};

		window.addEventListener("stacknote:open-account-dialog", handleOpenAccountDialog as EventListener);

		return () => {
			window.removeEventListener("stacknote:open-account-dialog", handleOpenAccountDialog as EventListener);
		};
	}, []);

	useEffect(() => {
		if (!activeDockPanel) {
			return;
		}

		const handlePointerDown = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) {
				return;
			}

			if (target instanceof HTMLElement && target.closest('[data-dock-toggle="true"]')) {
				return;
			}

			if (settingsDockRef.current?.contains(target)) {
				return;
			}

			setActiveDockPanel(null);
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setActiveDockPanel(null);
			}
		};

		window.addEventListener("mousedown", handlePointerDown);
		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("mousedown", handlePointerDown);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [activeDockPanel]);

	useEffect(() => {
		const handleOpenSettingsDock = () => {
			openSettingsDock();
		};

		window.addEventListener("stacknote:open-settings-dock", handleOpenSettingsDock);

		return () => {
			window.removeEventListener("stacknote:open-settings-dock", handleOpenSettingsDock);
		};
	}, [openSettingsDock]);

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

	const handleOpenNote = useCallback(
		(noteId: string | null) => {
			setActiveNote(noteId);
			router.push(noteId ? `/note/${encodeURIComponent(noteId)}` : "/");
			if (typeof window !== "undefined" && window.innerWidth < 768) {
				setSidebarOpen(false);
			}
		},
		[router, setActiveNote, setSidebarOpen],
	);

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
			await queryClient.cancelQueries({ queryKey: treeKey });
			const previousTree = queryClient.getQueryData<WorkspaceTree>(treeKey) ?? EMPTY_TREE;
			queryClient.setQueryData(treeKey, optimisticUpdate(previousTree));

			try {
				const result = await serverAction();
				onSuccess?.(result);
				try {
					await fetchTree();
				} catch (refreshError) {
					console.error("Post-mutation tree refresh failed:", refreshError);
				}
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
			if (typeof navigator !== "undefined" && !navigator.onLine) {
				const localId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `local-${Date.now()}`;
				const nowIso = new Date().toISOString();

				await localNotes.create({
					id: localId,
					title: "Untitled",
					emoji: null,
					workspaceId,
					folderId: folderId ?? null,
					coverImage: null,
					coverImageMeta: null,
					content: [],
					createdAt: nowIso,
					updatedAt: nowIso,
					editorWidth: null,
					_syncStatus: "pending",
				});

				const treeKey = queryKeys.workspaceTree(workspaceId);
				const currentTree = queryClient.getQueryData<WorkspaceTree>(treeKey) ?? EMPTY_TREE;
				const offlineNote: NoteTreeItem = {
					id: localId,
					title: "Untitled",
					emoji: null,
					type: "note",
				};
				queryClient.setQueryData(treeKey, addNoteToTree(currentTree, offlineNote, folderId));
				handleOpenNote(localId);
				toast.success("Note created offline");
				return { id: localId };
			}

			const tempId = `temp-${Date.now()}`;
			const tempNote: NoteTreeItem = {
				id: tempId,
				title: "Untitled",
				emoji: null,
				type: "note",
			};

			const result = await optimisticAction(
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
					handleOpenNote(newNote.id);
				},
			);

			if (result) {
				toast.success("Note created");
			} else {
				toast.error("Failed to create note");
			}

			return result;
		},
		[handleOpenNote, optimisticAction, queryClient, workspaceId],
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

			const result = await optimisticAction(
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

			if (result) {
				toast.success("Folder created");
			} else {
				toast.error("Failed to create folder");
			}

			return result;
		},
		[optimisticAction, workspaceId],
	);

	const handleDeleteNote = useCallback(
		async (noteId: string) => {
			if (typeof navigator !== "undefined" && !navigator.onLine) {
				const localDeleted = await localNotes.delete(noteId);
				if (!localDeleted) {
					toast.error("Failed to move note to Trash");
					return null;
				}

				const treeKey = queryKeys.workspaceTree(workspaceId);
				const currentTree = queryClient.getQueryData<WorkspaceTree>(treeKey) ?? EMPTY_TREE;
				queryClient.setQueryData(treeKey, removeNoteFromTree(currentTree, noteId));
				await Promise.all([
					queryClient.invalidateQueries({ queryKey: queryKeys.trashStatus }),
					queryClient.invalidateQueries({ queryKey: queryKeys.trashList }),
				]);
				toast.success("Moved to Trash");
				return;
			}

			const result = await optimisticAction(
				(currentTree) => removeNoteFromTree(currentTree, noteId),
				async () => {
					await fetchJsonOrNullOnNotFound<{ success: boolean }>(`/api/notes/${noteId}`, { method: "DELETE" });
					await Promise.all([
						queryClient.invalidateQueries({ queryKey: queryKeys.trashStatus }),
						queryClient.invalidateQueries({ queryKey: queryKeys.trashList }),
					]);
				},
			);

			if (result !== null) {
				toast.success("Moved to Trash");
			} else {
				toast.error("Failed to move note to Trash");
			}

			return result;
		},
		[optimisticAction, queryClient, workspaceId],
	);

	const handleDeleteFolder = useCallback(
		async (folderId: string) => {
			const result = await optimisticAction(
				(currentTree) => removeFolderFromTree(currentTree, folderId),
				async () => {
					await fetchJsonOrNullOnNotFound<{ success: boolean }>(`/api/folders/${folderId}`, { method: "DELETE" });
					await Promise.all([
						queryClient.invalidateQueries({ queryKey: queryKeys.trashStatus }),
						queryClient.invalidateQueries({ queryKey: queryKeys.trashList }),
					]);
				},
			);

			if (result !== null) {
				toast.success("Folder moved to Trash");
			} else {
				toast.error("Failed to move folder to Trash");
			}

			return result;
		},
		[optimisticAction, queryClient],
	);

	const handleRenameNote = useCallback(
		async (noteId: string, title: string) => {
			const result = await optimisticAction(
				(currentTree) => updateNoteInTree(currentTree, noteId, { title }),
				async () => {
					await fetchJson(`/api/notes/${noteId}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ title }),
					});
				},
			);

			if (result !== null) {
				toast.success("Note renamed");
			} else {
				toast.error("Failed to rename");
			}

			return result;
		},
		[optimisticAction],
	);

	const handleRenameFolder = useCallback(
		async (folderId: string, name: string) => {
			const result = await optimisticAction(
				(currentTree) => updateFolderInTree(currentTree, folderId, { name }),
				async () => {
					await fetchJson(`/api/folders/${folderId}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ name }),
					});
				},
			);

			if (result !== null) {
				toast.success("Folder renamed");
			} else {
				toast.error("Failed to rename");
			}

			return result;
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

	const handleReorderTree = useCallback(
		async (nextTree: WorkspaceTree, payload: WorkspaceReorderPayload) => {
			return optimisticAction(
				() => nextTree,
				async () => {
					await fetchJson(`/api/workspace/${workspaceId}/reorder`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(payload),
					});
				},
			);
		},
		[optimisticAction, workspaceId],
	);

	const updateUserName = useCallback(
		async (name: string) => {
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
		},
		[queryClient],
	);

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
						onSettingsOpen: toggleSettingsDock,
						onTrashOpen: toggleTrashDock,
						isSettingsOpen: isSettingsDockOpen,
						isTrashOpen: isTrashDockOpen,
						onCreateNote: handleCreateNote,
						onCreateFolder: handleCreateFolder,
						onDeleteNote: handleDeleteNote,
						onDeleteFolder: handleDeleteFolder,
						onRenameNote: handleRenameNote,
						onRenameFolder: handleRenameFolder,
						onMoveNote: handleMoveNote,
						onMoveFolder: handleMoveFolder,
						onReorderTree: handleReorderTree,
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
			handleReorderTree,
			handleRenameFolder,
			handleRenameNote,
			isSettingsDockOpen,
			isTrashDockOpen,
			toggleSettingsDock,
			toggleTrashDock,
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
			<div className="flex h-dvh items-center justify-center" style={{ backgroundColor: "#000000", color: "var(--text-primary)" }}>
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
		<SettingsDockProvider value={{ openSettingsDock, isSettingsDockOpen }}>
			<div className="relative flex h-dvh min-h-0 overflow-hidden" style={{ backgroundColor: "var(--bg-app)" }}>
				{canUseSidebarPreview && !isMobileSidebarMode && !state.isSidebarOpen && !state.isFocusMode && (
					<div className="sidebar-preview-trigger" onMouseEnter={showSidebarPreview} aria-hidden="true" />
				)}
				{(isSidebarVisible || isDockMounted) && !isMobileSidebarMode && (
					<div
						className="fixed inset-y-0 left-0 z-50 flex overflow-hidden"
						style={{
							width: state.sidebarWidth,
							transition: "width 280ms cubic-bezier(0.22, 1, 0.36, 1)",
						}}
						onMouseLeave={isDockMounted ? undefined : hideDockedPanels}>
						<div className="h-full flex-shrink-0" style={{ width: state.sidebarWidth, minWidth: state.sidebarWidth }}>
							<div className={`sidebar-surface ${isSidebarVisible || activeDockPanel ? "sidebar-surface-open" : "sidebar-surface-closed"}`}>
								<Sidebar {...sidebarProps} />
							</div>
						</div>
					</div>
				)}
				{isDockMounted && !isMobileSidebarMode && (
					<div
						ref={settingsDockRef}
						className="fixed inset-y-0 z-[56] overflow-hidden"
						style={{
							left: state.sidebarWidth,
							width: settingsDockWidth,
							minWidth: settingsDockWidth,
							boxShadow: "24px 0 48px rgba(0, 0, 0, 0.32)",
							opacity: isDockVisible ? 1 : 0,
							transform: isDockVisible ? "translateX(0)" : "translateX(-14px)",
							pointerEvents: isDockVisible ? "auto" : "none",
							willChange: "opacity, transform",
							transition: `opacity ${SETTINGS_DOCK_TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1), transform ${SETTINGS_DOCK_TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
						}}>
						{mountedDockPanel === "settings" ? (
							<SettingsPanel variant="dock" onClose={() => setActiveDockPanel(null)} />
						) : (
							<TrashPanel
								open={isTrashDockOpen || mountedDockPanel === "trash"}
								workspaceId={workspaceId}
								onClose={() => setActiveDockPanel(null)}
							/>
						)}
					</div>
				)}
				{isMobileSidebarMode && isSidebarVisible && (
					<>
						<button type="button" className="sidebar-mobile-backdrop" onClick={toggleSidebar} aria-label="Close sidebar overlay" />
						<div className="sidebar-mobile-layer" style={{ width: state.sidebarWidth }}>
							<div className="sidebar-surface sidebar-surface-open sidebar-mobile-surface">
								<Sidebar {...sidebarProps} />
							</div>
						</div>
					</>
				)}
				{isDockMounted && isMobileSidebarMode && (
					<div
						ref={settingsDockRef}
						className="fixed inset-0 z-[56] overflow-hidden"
						style={{
							opacity: isDockVisible ? 1 : 0,
							transform: isDockVisible ? "translateX(0)" : "translateX(-18px)",
							pointerEvents: isDockVisible ? "auto" : "none",
							willChange: "opacity, transform",
							transition: `opacity ${SETTINGS_DOCK_TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1), transform ${SETTINGS_DOCK_TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
						}}>
						{mountedDockPanel === "settings" ? (
							<SettingsPanel variant="dock" onClose={() => setActiveDockPanel(null)} />
						) : (
							<TrashPanel
								open={isTrashDockOpen || mountedDockPanel === "trash"}
								workspaceId={workspaceId}
								onClose={() => setActiveDockPanel(null)}
							/>
						)}
					</div>
				)}
				{canUseSidebarPreview && !isMobileSidebarMode && !state.isSidebarOpen && !isDockMounted && (
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
				<div
					className="flex min-w-0 flex-1 overflow-hidden"
					style={{
						backgroundColor: "var(--bg-app)",
						paddingLeft: dockedContentOffset,
						transition: "padding-left 280ms cubic-bezier(0.22, 1, 0.36, 1)",
					}}>
					{isNoteRoute ? (
						<MainContent
							workspaceId={workspaceId}
							workspaceName={currentWorkspaceName}
							activeNoteId={activeRouteNoteId}
							onNoteCreated={fetchTree}
							onOpenNote={handleOpenNote}
							onRefresh={fetchTree}
							isSidebarOpen={isSidebarVisible}
							onToggleSidebar={handleSidebarToggleButton}
							tree={tree}
						/>
					) : (
						<div className="flex min-h-0 min-w-0 flex-1 overflow-hidden" style={{ backgroundColor: "var(--bg-app)" }}>
							{!isHomeRoute && !isPlannerRoute && !isSidebarVisible && !state.isFocusMode && (
								<Tooltip>
									<TooltipTrigger asChild>
										<button
											type="button"
											onClick={handleSidebarToggleButton}
											className="fixed z-40 flex h-7 w-7 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 hover:bg-[#1a1a1a]"
											style={{
												left: "max(0.5rem, env(safe-area-inset-left))",
												top: "max(0.5rem, env(safe-area-inset-top))",
											}}
											aria-label="Open sidebar">
											<PanelLeftOpen className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
										</button>
									</TooltipTrigger>
									<TooltipContent>Open sidebar</TooltipContent>
								</Tooltip>
							)}
							{children}
						</div>
					)}
				</div>
				{!isHomeRoute && !isPlannerRoute ? (
					<PomodoroWidget sidebarOffset={isSidebarVisible && !isMobileSidebarMode ? state.sidebarWidth + 24 : 24} isHidden={isAiPanelFullscreen} />
				) : null}
				<SyncStatusBar />
				<InstallPrompt />
				<SearchModalClient
					workspaceId={workspaceId}
					open={searchOpen}
					onSelectNote={(id) => {
						handleOpenNote(id);
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
				{!isHomeRoute && !isPlannerRoute ? <QuickNoteWidget userId={bootstrapData.user.id} isHidden={isAiPanelFullscreen} /> : null}
			</div>
		</SettingsDockProvider>
	);
}

export function AppShell({ initialShell, children }: AppShellProps) {
	return (
		<WorkspaceProvider>
			<AppShellInner initialShell={initialShell}>{children}</AppShellInner>
		</WorkspaceProvider>
	);
}
