"use client";

import { lazy, Suspense, useMemo, useState } from "react";
import { PanelLeftOpen } from "lucide-react";
import { EditorSkeleton, LoadingContentSkeleton } from "@/components/layout/AppShellSkeleton";
import { ScrollRevealBar } from "@/components/layout/ScrollRevealBar";
import type { NoteTreeItem, WorkspaceTree } from "@/types";

const NoteWorkspaceClient = lazy(async () => {
	const noteWorkspaceModule = await import("@/components/layout/NoteWorkspace");

	return { default: noteWorkspaceModule.NoteWorkspace };
});

interface MainContentProps {
	workspaceId: string;
	workspaceName: string;
	activeNoteId: string | null;
	onNoteCreated: () => void;
	onOpenNote: (noteId: string | null) => void;
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
			<div className="stacknote-mobile-bottom-space flex flex-1 flex-col overflow-y-auto">
				<ScrollRevealBar
					className="flex h-9 shrink-0 items-center justify-between bg-[var(--bg-app)] px-4"
					style={{ borderBottom: "1px solid var(--border-default)" }}>
					<div className="flex items-center gap-2">
						{!isSidebarOpen && (
							<button
								type="button"
								onClick={onToggleSidebar}
								className="flex h-6 w-6 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 hover:bg-[#1a1a1a]"
								title="Open sidebar (Ctrl+\\)">
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
				</ScrollRevealBar>

				<EditorSkeleton />
			</div>
		</div>
	);
}

export function MainContent({
	workspaceId,
	workspaceName,
	activeNoteId,
	onNoteCreated,
	onOpenNote,
	onRefresh,
	isSidebarOpen,
	onToggleSidebar,
	tree,
}: MainContentProps) {
	const [isCreatingNote, setIsCreatingNote] = useState(false);

	const selectedNote = useMemo(() => {
		if (!activeNoteId) {
			return null;
		}

		return findNoteInTree(tree, activeNoteId);
	}, [activeNoteId, tree]);

	if (!activeNoteId) {
		return <LoadingContentSkeleton workspaceName={workspaceName} />;
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
				onOpenNote={onOpenNote}
				onRefresh={onRefresh}
				isSidebarOpen={isSidebarOpen}
				onToggleSidebar={onToggleSidebar}
				tree={tree}
			/>
		</Suspense>
	);
}
