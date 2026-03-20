"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { WorkspaceProvider } from "@/contexts/WorkspaceContext"
import { Sidebar } from "@/components/layout/Sidebar"
import { MainContent } from "@/components/layout/MainContent"
import { SearchModal } from "@/components/layout/SearchModal"
import { NameCaptureDialog } from "@/components/layout/NameCaptureDialog"
import { useWorkspace } from "@/contexts/WorkspaceContext"
import type { WorkspaceTree, NoteTreeItem, FolderTreeItem } from "@/types"
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
  const { state, setActiveNote, toggleSidebar } = useWorkspace()
  const pendingActionsRef = useRef<number>(0)

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
      }

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
        children: [],
        notes: [],
      }

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
  const handleNameSubmit = useCallback(async (name: string) => {
    try {
      const res = await fetch("/api/user/name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })

      if (!res.ok) {
        throw new Error("Failed to update name")
      }

      setShowNameDialog(false)
      // Reload page to update user name in session
      window.location.reload()
    } catch (error) {
      console.error("Failed to update name:", error)
      throw error
    }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
      if (e.key === "Escape") {
        setSearchOpen(false)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [toggleSidebar])

  return (
    <div
      className="flex h-screen overflow-hidden transition-all duration-300 ease-in-out"
      style={{ backgroundColor: "var(--bg-app)" }}
    >
      {state.isSidebarOpen && (
        <div className="animate-in slide-in-from-left-48 duration-300">
          <Sidebar
            workspaceId={workspaceId}
            workspaceName={workspaceName}
            userEmail={userEmail}
            userName={userName}
            isGoogleUser={isGoogleUser}
            tree={optimisticTree}
            onRefresh={fetchTree}
            onSearchOpen={() => setSearchOpen(true)}
            onCreateNote={handleCreateNote}
            onCreateFolder={handleCreateFolder}
            onDeleteNote={handleDeleteNote}
            onDeleteFolder={handleDeleteFolder}
            onRenameNote={handleRenameNote}
            onRenameFolder={handleRenameFolder}
            onMoveNote={handleMoveNote}
            onMoveFolder={handleMoveFolder}
          />
        </div>
      )}
      <MainContent
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        onNoteCreated={fetchTree}
        onRefresh={fetchTree}
        isSidebarOpen={state.isSidebarOpen}
        onToggleSidebar={toggleSidebar}
      />
      {searchOpen && (
        <SearchModal
          tree={optimisticTree}
          onSelectNote={(id) => setActiveNote(id)}
          onClose={() => setSearchOpen(false)}
        />
      )}
      <NameCaptureDialog
        open={showNameDialog}
        onNameSubmit={handleNameSubmit}
      />
    </div>
  )
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
