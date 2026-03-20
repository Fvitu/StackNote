"use client"

import {
  createContext,
  useCallback,
  useContext,
  useReducer,
  type ReactNode,
} from "react"

interface WorkspaceState {
  activeNoteId: string | null
  expandedFolders: Set<string>
  sidebarWidth: number
  isSidebarOpen: boolean
  isFullscreen: boolean
}

type WorkspaceAction =
  | { type: "SET_ACTIVE_NOTE"; noteId: string | null }
  | { type: "TOGGLE_FOLDER"; folderId: string }
  | { type: "SET_SIDEBAR_WIDTH"; width: number }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "SET_FULLSCREEN"; value: boolean }

const initialState: WorkspaceState = {
  activeNoteId: null,
  expandedFolders: new Set<string>(),
  sidebarWidth: 240,
  isSidebarOpen: true,
  isFullscreen: false,
}

function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction
): WorkspaceState {
  switch (action.type) {
    case "SET_ACTIVE_NOTE":
      return { ...state, activeNoteId: action.noteId }
    case "TOGGLE_FOLDER": {
      const next = new Set(state.expandedFolders)
      if (next.has(action.folderId)) {
        next.delete(action.folderId)
      } else {
        next.add(action.folderId)
      }
      return { ...state, expandedFolders: next }
    }
    case "SET_SIDEBAR_WIDTH":
      return { ...state, sidebarWidth: action.width }
    case "TOGGLE_SIDEBAR":
      return { ...state, isSidebarOpen: !state.isSidebarOpen }
    case "SET_FULLSCREEN":
      return { ...state, isFullscreen: action.value }
    default:
      return state
  }
}

interface WorkspaceContextValue {
  state: WorkspaceState
  setActiveNote: (noteId: string | null) => void
  toggleFolder: (folderId: string) => void
  setSidebarWidth: (width: number) => void
  toggleSidebar: () => void
  setFullscreen: (value: boolean) => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workspaceReducer, initialState)

  const setActiveNote = useCallback(
    (noteId: string | null) => dispatch({ type: "SET_ACTIVE_NOTE", noteId }),
    []
  )

  const toggleFolder = useCallback(
    (folderId: string) => dispatch({ type: "TOGGLE_FOLDER", folderId }),
    []
  )

  const setSidebarWidth = useCallback(
    (width: number) => dispatch({ type: "SET_SIDEBAR_WIDTH", width }),
    []
  )

  const toggleSidebar = useCallback(
    () => dispatch({ type: "TOGGLE_SIDEBAR" }),
    []
  )

  const setFullscreen = useCallback(
    (value: boolean) => dispatch({ type: "SET_FULLSCREEN", value }),
    []
  )

  return (
    <WorkspaceContext.Provider
      value={{ state, setActiveNote, toggleFolder, setSidebarWidth, toggleSidebar, setFullscreen }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) {
    throw new Error("useWorkspace must be used within WorkspaceProvider")
  }
  return ctx
}
