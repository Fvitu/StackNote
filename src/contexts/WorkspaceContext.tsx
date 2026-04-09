"use client";

import { createContext, useCallback, useContext, useReducer, useEffect, type ReactNode } from "react";

interface WorkspaceState {
	activeNoteId: string | null;
	expandedFolders: Set<string>;
	sidebarWidth: number;
	isSidebarOpen: boolean;
	isFocusMode: boolean;
	isAiPanelOpen: boolean;
	aiPanelWidth: number;
}

type WorkspaceAction =
	| { type: "SET_ACTIVE_NOTE"; noteId: string | null }
	| { type: "TOGGLE_FOLDER"; folderId: string }
	| { type: "EXPAND_FOLDER"; folderId: string }
	| { type: "SET_SIDEBAR_WIDTH"; width: number }
	| { type: "TOGGLE_SIDEBAR" }
	| { type: "SET_SIDEBAR_OPEN"; isOpen: boolean }
	| { type: "TOGGLE_FOCUS_MODE" }
	| { type: "SET_FOCUS_MODE"; isFocusMode: boolean }
	| { type: "SET_AI_PANEL_OPEN"; isOpen: boolean }
	| { type: "SET_AI_PANEL_WIDTH"; width: number };

const initialState: WorkspaceState = {
	activeNoteId: null,
	expandedFolders: new Set<string>(),
	sidebarWidth: 240,
	isSidebarOpen: true,
	isFocusMode: false,
	isAiPanelOpen: false,
	aiPanelWidth: 360,
};

function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
	switch (action.type) {
		case "SET_ACTIVE_NOTE":
			return { ...state, activeNoteId: action.noteId };
		case "TOGGLE_FOLDER": {
			const next = new Set(state.expandedFolders);
			if (next.has(action.folderId)) {
				next.delete(action.folderId);
			} else {
				next.add(action.folderId);
			}
			return { ...state, expandedFolders: next };
		}
		case "EXPAND_FOLDER": {
			if (state.expandedFolders.has(action.folderId)) {
				return state;
			}
			const next = new Set(state.expandedFolders);
			next.add(action.folderId);
			return { ...state, expandedFolders: next };
		}
		case "SET_SIDEBAR_WIDTH":
			return { ...state, sidebarWidth: action.width };
		case "TOGGLE_SIDEBAR":
			return { ...state, isSidebarOpen: !state.isSidebarOpen };
		case "SET_SIDEBAR_OPEN":
			return { ...state, isSidebarOpen: action.isOpen };
		case "TOGGLE_FOCUS_MODE":
			return { ...state, isFocusMode: !state.isFocusMode };
		case "SET_FOCUS_MODE":
			return { ...state, isFocusMode: action.isFocusMode };
		case "SET_AI_PANEL_OPEN":
			return { ...state, isAiPanelOpen: action.isOpen };
		case "SET_AI_PANEL_WIDTH":
			return { ...state, aiPanelWidth: action.width };
		default:
			return state;
	}
}

interface WorkspaceContextValue {
	state: WorkspaceState;
	setActiveNote: (noteId: string | null) => void;
	toggleFolder: (folderId: string) => void;
	expandFolder: (folderId: string) => void;
	setSidebarWidth: (width: number) => void;
	toggleSidebar: () => void;
	setSidebarOpen: (isOpen: boolean) => void;
	toggleFocusMode: () => void;
	setFocusMode: (isFocusMode: boolean) => void;
	setAiPanelOpen: (isOpen: boolean) => void;
	setWorkspaceAiPanelWidth: (width: number) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(workspaceReducer, initialState);

	const setActiveNote = useCallback((noteId: string | null) => dispatch({ type: "SET_ACTIVE_NOTE", noteId }), []);

	const toggleFolder = useCallback((folderId: string) => dispatch({ type: "TOGGLE_FOLDER", folderId }), []);
	const expandFolder = useCallback((folderId: string) => dispatch({ type: "EXPAND_FOLDER", folderId }), []);

	const setSidebarWidth = useCallback((width: number) => dispatch({ type: "SET_SIDEBAR_WIDTH", width }), []);

	const toggleSidebar = useCallback(() => dispatch({ type: "TOGGLE_SIDEBAR" }), []);

	const setSidebarOpen = useCallback((isOpen: boolean) => dispatch({ type: "SET_SIDEBAR_OPEN", isOpen }), []);
	const toggleFocusMode = useCallback(() => dispatch({ type: "TOGGLE_FOCUS_MODE" }), []);
	const setFocusMode = useCallback((isFocusMode: boolean) => dispatch({ type: "SET_FOCUS_MODE", isFocusMode }), []);
	const setAiPanelOpen = useCallback((isOpen: boolean) => dispatch({ type: "SET_AI_PANEL_OPEN", isOpen }), []);
	const setWorkspaceAiPanelWidth = useCallback((width: number) => dispatch({ type: "SET_AI_PANEL_WIDTH", width }), []);

	// Auto-close/open sidebar based on viewport width (client-only)
	useEffect(() => {
		const apply = () => {
			const isWide = window.innerWidth >= 768;
			dispatch({ type: "SET_SIDEBAR_OPEN", isOpen: isWide });
		};
		apply();
		window.addEventListener("resize", apply);
		return () => window.removeEventListener("resize", apply);
	}, []);

	return (
		<WorkspaceContext.Provider
			value={{
				state,
				setActiveNote,
				toggleFolder,
				expandFolder,
				setSidebarWidth,
				toggleSidebar,
				setSidebarOpen,
				toggleFocusMode,
				setFocusMode,
				setAiPanelOpen,
				setWorkspaceAiPanelWidth,
			}}>
			{children}
		</WorkspaceContext.Provider>
	);
}

export function useWorkspace() {
	const ctx = useContext(WorkspaceContext);
	if (!ctx) {
		throw new Error("useWorkspace must be used within WorkspaceProvider");
	}
	return ctx;
}
