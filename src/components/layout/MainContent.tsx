"use client";

import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { FileText, PanelLeftOpen, Plus } from "lucide-react";
import { EditorSkeleton } from "@/components/layout/AppShellSkeleton";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import type { NoteTreeItem, WorkspaceTree } from "@/types";

const NoteWorkspaceClient = lazy(async () => {
	const module = await import("@/components/layout/NoteWorkspace");

	return { default: module.NoteWorkspace };
});

interface MainContentProps {
	workspaceId: string;
	workspaceName: string;
	onNoteCreated: () => void;
	onRefresh: () => void;
	isSidebarOpen: boolean;
	onToggleSidebar: () => void;
	tree: WorkspaceTree;
}

function findNoteInTree(tree: WorkspaceTree, noteId: string): NoteTreeItem | null {
	for (const note of tree.rootNotes) {
		if (note.id === noteId) {
			return note;
		}
	}

	const visitFolders = (folders: WorkspaceTree["folders"]): NoteTreeItem | null => {
		for (const folder of folders) {
			const folderNote = folder.notes.find((note) => note.id === noteId);
			if (folderNote) {
				return folderNote;
			}

			const nested = visitFolders(folder.children);
			if (nested) {
				return nested;
			}
		}

		return null;
	};

	return visitFolders(tree.folders);
}

function ActiveNoteWorkspaceFallback({
	workspaceName,
	note,
	isSidebarOpen,
	onToggleSidebar,
}: {
	workspaceName: string;
	note: NoteTreeItem | null;
	isSidebarOpen: boolean;
	onToggleSidebar: () => void;
}) {
	return (
		<div
			className="flex flex-1 overflow-hidden fade-in"
			style={{
				backgroundColor: "var(--bg-app)",
				transform: "none",
				transition: "none",
				willChange: "auto",
			}}>
			<div className="flex flex-1 flex-col overflow-y-auto">
				<div className="flex h-9 shrink-0 items-center justify-between px-4" style={{ borderBottom: "1px solid var(--border-default)" }}>
					<div className="flex items-center gap-2">
						{!isSidebarOpen && (
							<button
								type="button"
								onClick={onToggleSidebar}
								className="flex h-6 w-6 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 hover:bg-[#1a1a1a]"
								title="Open sidebar (Ctrl+\)">
								<PanelLeftOpen className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
							</button>
						)}
						<div className="flex items-center gap-1 text-xs min-w-0" style={{ color: "var(--text-tertiary)" }}>
							<span
								className="min-w-0"
								style={{
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
									display: "inline-block",
									maxWidth: "calc(100vw - 280px)",
								}}>
								{workspaceName}
								<> / </>
								<span style={{ color: "var(--text-secondary)" }}>{note?.title || "Untitled"}</span>
							</span>
						</div>
					</div>
				</div>

				<EditorSkeleton />
			</div>
		</div>
	);
}

export function MainContent({ workspaceId, workspaceName, onNoteCreated, onRefresh, isSidebarOpen, onToggleSidebar, tree }: MainContentProps) {
	const { state, setActiveNote } = useWorkspace();
	const [isCreatingNote, setIsCreatingNote] = useState(false);
	const activeNoteId = state.activeNoteId;

	const selectedNote = useMemo(() => {
		if (!activeNoteId) {
			return null;
		}

		return findNoteInTree(tree, activeNoteId);
	}, [activeNoteId, tree]);

	const handleCreateNote = useCallback(async () => {
		if (isCreatingNote) {
			return;
		}

		setIsCreatingNote(true);
		try {
			const response = await fetch("/api/notes", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId }),
			});

			if (!response.ok) {
				throw new Error("Failed to create note");
			}

			const note = (await response.json()) as { id: string };
			onNoteCreated();
			setActiveNote(note.id);
		} finally {
			setIsCreatingNote(false);
		}
	}, [isCreatingNote, onNoteCreated, setActiveNote, workspaceId]);

	if (!activeNoteId) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-4 fade-in" style={{ backgroundColor: "var(--bg-app)" }}>
				{!isSidebarOpen && (
					<button
						type="button"
						onClick={onToggleSidebar}
						className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 hover:bg-[#1a1a1a]"
						title="Open sidebar (Ctrl+\)">
						<PanelLeftOpen className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
					</button>
				)}
				<div className="flex h-16 w-16 items-center justify-center rounded-2xl smooth-bg" style={{ backgroundColor: "var(--bg-surface)" }}>
					<FileText className="h-8 w-8" style={{ color: "var(--text-tertiary)" }} />
				</div>
				<div className="max-w-[32rem] px-6 text-center">
					<h1
						className="text-[clamp(1.875rem,4vw,2.75rem)] font-semibold leading-tight tracking-[-0.02em]"
						style={{ color: "var(--text-primary)" }}>
						{workspaceName}
					</h1>
					<p className="text-sm" style={{ color: "var(--text-secondary)" }}>
						Select a note or create a new one
					</p>
				</div>
				<button
					type="button"
					onClick={() => void handleCreateNote()}
					disabled={isCreatingNote}
					className="hover-scale mt-2 flex items-center gap-2 rounded-[var(--sn-radius-md)] px-4 py-2 text-sm transition-all duration-150 disabled:opacity-70"
					style={{ backgroundColor: "var(--accent-muted)", color: "var(--sn-accent)" }}
					onMouseEnter={(event) => {
						(event.currentTarget as HTMLElement).style.backgroundColor = "rgba(124, 106, 255, 0.25)";
					}}
					onMouseLeave={(event) => {
						(event.currentTarget as HTMLElement).style.backgroundColor = "var(--accent-muted)";
					}}>
					<Plus className="h-4 w-4" />
					{isCreatingNote ? "Creating note..." : "Create your first note"}
				</button>
			</div>
		);
	}

	return (
		<Suspense
			fallback={
				<ActiveNoteWorkspaceFallback
					workspaceName={workspaceName}
					note={selectedNote}
					isSidebarOpen={isSidebarOpen}
					onToggleSidebar={onToggleSidebar}
				/>
			}>
			<NoteWorkspaceClient
				activeNoteId={activeNoteId}
				workspaceId={workspaceId}
				workspaceName={workspaceName}
				onNoteCreated={onNoteCreated}
				onRefresh={onRefresh}
				isSidebarOpen={isSidebarOpen}
				onToggleSidebar={onToggleSidebar}
				tree={tree}
			/>
		</Suspense>
	);
}
