"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext"
import { Sidebar } from "@/components/layout/Sidebar"
import { MainContent } from "@/components/layout/MainContent"
import { SearchModal } from "@/components/search/SearchModal";
import { NameCaptureDialog } from "@/components/layout/NameCaptureDialog"
import { AccountDialog } from "@/components/layout/AccountDialog";
import { useWorkspace } from "@/contexts/WorkspaceContext"
import type { WorkspaceTree, NoteTreeItem, FolderTreeItem } from "@/types"
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import {
  addNoteToTree,
  removeNoteFromTree,
  addFolderToTree,
  removeFolderFromTree,
  updateNoteInTree,
  updateFolderInTree,
  moveNoteInTree,
  moveFolderInTree,
} from "@/lib/tree-helpers"

interface AppShellProps {
  workspaceId: string
  workspaceName: string
  userEmail: string
  userName: string
  isGoogleUser: boolean
  needsName: boolean
  children: React.ReactNode
}

function AppShellInner({
  workspaceId,
  workspaceName,
  userEmail,
  userName,
  isGoogleUser,
  needsName,
}: Omit<AppShellProps, "children">) {
  const [tree, setTree] = useState<WorkspaceTree>({ folders: [], rootNotes: [] })
  const [optimisticTree, setOptimisticTree] = useState<WorkspaceTree>({ folders: [], rootNotes: [] })
  const [searchOpen, setSearchOpen] = useState(false)
  const [showNameDialog, setShowNameDialog] = useState(needsName)
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [currentWorkspaceName, setCurrentWorkspaceName] = useState(workspaceName);
  const [currentUserName, setCurrentUserName] = useState(userName);
  const [isSidebarPreviewOpen, setIsSidebarPreviewOpen] = useState(false);
  const [isMobileSidebarMode, setIsMobileSidebarMode] = useState(false);
  const [canUseSidebarPreview, setCanUseSidebarPreview] = useState(false);
  const { state, setActiveNote, toggleFolder, toggleSidebar, setSidebarOpen } = useWorkspace();
  const pendingActionsRef = useRef<number>(0)

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
    const res = await fetch(`/api/workspace/${workspaceId}/tree`)
    if (res.ok) {
      const data = await res.json()
      setTree(data)
      // Only update optimistic tree if no pending actions
      if (pendingActionsRef.current === 0) {
        setOptimisticTree(data)
      }
    }
  }, [workspaceId])

  useEffect(() => {
    fetchTree()
  }, [fetchTree])

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

  // Optimistic action wrapper
  const optimisticAction = useCallback(
    async <T,>(
      optimisticUpdate: (tree: WorkspaceTree) => WorkspaceTree,
      serverAction: () => Promise<T>,
      onSuccess?: (result: T) => void
    ): Promise<T | null> => {
      // Apply optimistic update immediately
      setOptimisticTree((prev) => optimisticUpdate(prev))
      pendingActionsRef.current++

      try {
        const result = await serverAction()
        if (onSuccess) onSuccess(result)
        // Refresh from server
        await fetchTree()
        return result
      } catch (error) {
        console.error("Action failed:", error)
        // Revert to server state
        setOptimisticTree(tree)
        return null
      } finally {
        pendingActionsRef.current--
        if (pendingActionsRef.current === 0) {
          // Sync with server when all actions complete
          await fetchTree()
        }
      }
    },
    [tree, fetchTree]
  )

  // Optimistic create note
  const handleCreateNote = useCallback(
    async (folderId?: string) => {
      const tempId = `temp-${Date.now()}`
      const tempNote: NoteTreeItem = {
			id: tempId,
			title: "Untitled",
			emoji: null,
			type: "note",
		};

      return optimisticAction(
        (tree) => addNoteToTree(tree, tempNote, folderId),
        async () => {
          const res = await fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspaceId, folderId }),
          })
          if (!res.ok) throw new Error("Failed to create note")
          return res.json()
        },
        (newNote) => {
          setActiveNote(newNote.id)
        }
      )
    },
    [workspaceId, optimisticAction, setActiveNote]
  )

  // Optimistic create folder
  const handleCreateFolder = useCallback(
    async (parentId?: string) => {
      const tempId = `temp-folder-${Date.now()}`
      const tempFolder: FolderTreeItem = {
			id: tempId,
			name: "New Folder",
			type: "folder",
			children: [],
			notes: [],
		};

      return optimisticAction(
        (tree) => addFolderToTree(tree, tempFolder, parentId),
        async () => {
          const res = await fetch("/api/folders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspaceId, parentId, name: "New Folder" }),
          })
          if (!res.ok) throw new Error("Failed to create folder")
          return res.json()
        }
      )
    },
    [workspaceId, optimisticAction]
  )

  // Optimistic delete note
  const handleDeleteNote = useCallback(
    async (noteId: string) => {
      return optimisticAction(
        (tree) => removeNoteFromTree(tree, noteId),
        async () => {
          const res = await fetch(`/api/notes/${noteId}`, { method: "DELETE" })
          if (!res.ok) throw new Error("Failed to delete note")
        }
      )
    },
    [optimisticAction]
  )

  // Optimistic delete folder
  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      return optimisticAction(
        (tree) => removeFolderFromTree(tree, folderId),
        async () => {
          const res = await fetch(`/api/folders/${folderId}`, { method: "DELETE" })
          if (!res.ok) throw new Error("Failed to delete folder")
        }
      )
    },
    [optimisticAction]
  )

  // Optimistic rename note
  const handleRenameNote = useCallback(
    async (noteId: string, title: string) => {
      return optimisticAction(
        (tree) => updateNoteInTree(tree, noteId, { title }),
        async () => {
          const res = await fetch(`/api/notes/${noteId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title }),
          })
          if (!res.ok) throw new Error("Failed to rename note")
        }
      )
    },
    [optimisticAction]
  )

  // Optimistic rename folder
  const handleRenameFolder = useCallback(
    async (folderId: string, name: string) => {
      return optimisticAction(
        (tree) => updateFolderInTree(tree, folderId, { name }),
        async () => {
          const res = await fetch(`/api/folders/${folderId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          })
          if (!res.ok) throw new Error("Failed to rename folder")
        }
      )
    },
    [optimisticAction]
  )

  // Optimistic move note
  const handleMoveNote = useCallback(
    async (noteId: string, folderId: string | null) => {
      return optimisticAction(
        (tree) => moveNoteInTree(tree, noteId, folderId),
        async () => {
          const res = await fetch(`/api/notes/${noteId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folderId }),
          })
          if (!res.ok) throw new Error("Failed to move note")
        }
      )
    },
    [optimisticAction]
  )

  // Optimistic move folder
  const handleMoveFolder = useCallback(
    async (folderId: string, parentId: string | null) => {
      return optimisticAction(
        (tree) => moveFolderInTree(tree, folderId, parentId),
        async () => {
          const res = await fetch(`/api/folders/${folderId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parentId }),
          })
          if (!res.ok) throw new Error("Failed to move folder")
        }
      )
    },
    [optimisticAction]
  )

  // Handle name submission for magic link users
  const updateUserName = useCallback(async (name: string) => {
		try {
			const res = await fetch("/api/user/name", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});

			if (!res.ok) {
				throw new Error("Failed to update name");
			}

			setCurrentUserName(name);
			setShowNameDialog(false);
		} catch (error) {
			console.error("Failed to update name:", error);
			throw error;
		}
  }, []);

  const updateWorkspaceName = useCallback(
		async (name: string) => {
			try {
				const res = await fetch(`/api/workspace/${workspaceId}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name }),
				});

				if (!res.ok) {
					throw new Error("Failed to update workspace");
				}

				setCurrentWorkspaceName(name);
				await fetchTree();
			} catch (error) {
				console.error("Failed to update workspace:", error);
				throw error;
			}
		},
		[workspaceId, fetchTree],
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

  useKeyboardShortcut("k", () => setSearchOpen((v) => !v), { metaOrCtrl: true, preventDefault: true });
  useKeyboardShortcut("\\", () => toggleSidebar(), { metaOrCtrl: true, preventDefault: true });

  const sidebarProps = useMemo(
		() => ({
			workspaceId,
			workspaceName: currentWorkspaceName,
			userEmail,
			userName: currentUserName,
			isGoogleUser,
			tree: optimisticTree,
			onRefresh: fetchTree,
			onSearchOpen: () => setSearchOpen(true),
			onAccountOpen: () => {
				setAccountDialogOpen(true);
				// Close the sidebar on small screens when opening account panel
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
		}),
		[
			workspaceId,
			currentWorkspaceName,
			userEmail,
			currentUserName,
			isGoogleUser,
			optimisticTree,
			fetchTree,
			handleCreateNote,
			handleCreateFolder,
			handleDeleteNote,
			handleDeleteFolder,
			handleRenameNote,
			handleRenameFolder,
			handleMoveNote,
			handleMoveFolder,
			isMobileSidebarMode,
			setSidebarOpen,
			setAccountDialogOpen,
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
			/>
			<SearchModal
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
			<AccountDialog
				open={accountDialogOpen}
				userName={currentUserName}
				userEmail={userEmail}
				workspaceName={currentWorkspaceName}
				isGoogleUser={isGoogleUser}
				onClose={() => setAccountDialogOpen(false)}
				onSaveUserName={updateUserName}
				onSaveWorkspaceName={updateWorkspaceName}
			/>
			<NameCaptureDialog open={showNameDialog} onNameSubmit={handleNameSubmit} />
		</div>
  );
}

export function AppShell({
  workspaceId,
  workspaceName,
  userEmail,
  userName,
  isGoogleUser,
  needsName,
}: AppShellProps) {
  return (
    <WorkspaceProvider>
      <AppShellInner
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        userEmail={userEmail}
        userName={userName}
        isGoogleUser={isGoogleUser}
        needsName={needsName}
      />
    </WorkspaceProvider>
  )
}
