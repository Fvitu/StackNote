"use client"

import { useState, useCallback, useEffect } from "react"
import {
  Plus,
  Search,
  ChevronDown,
  LogOut,
  User,
  PanelLeftClose,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu"
import { useWorkspace } from "@/contexts/WorkspaceContext"
import { SidebarItem } from "./SidebarItem";
import { signOutAction } from "@/app/actions"
import type { FolderTreeItem, WorkspaceTree } from "@/types"

type OptimisticResult = Promise<{ id: string } | null | void>;
type AsyncResult = Promise<void | null>;

interface SidebarProps {
	workspaceId: string;
	workspaceName: string;
	userEmail: string;
	userName: string;
	isGoogleUser: boolean;
	tree: WorkspaceTree;
	onRefresh: () => void;
	onSearchOpen: () => void;
	onAccountOpen: () => void;
	// Optimistic action handlers
	onCreateNote?: (folderId?: string) => OptimisticResult;
	onCreateFolder?: (parentId?: string) => OptimisticResult;
	onDeleteNote?: (noteId: string) => AsyncResult;
	onDeleteFolder?: (folderId: string) => AsyncResult;
	onRenameNote?: (noteId: string, title: string) => AsyncResult;
	onRenameFolder?: (folderId: string, name: string) => AsyncResult;
	onMoveNote?: (noteId: string, folderId: string | null) => AsyncResult;
	onMoveFolder?: (folderId: string, parentId: string | null) => AsyncResult;
	onFolderVisited?: (folderId: string | null) => void;
}

export function Sidebar({
	workspaceId,
	workspaceName,
	userEmail,
	userName,
	isGoogleUser,
	tree,
	onRefresh,
	onSearchOpen,
	onAccountOpen,
	onCreateNote: onCreateNoteOptimistic,
	onCreateFolder: onCreateFolderOptimistic,
	onDeleteNote: onDeleteNoteOptimistic,
	onDeleteFolder: onDeleteFolderOptimistic,
	onRenameNote: onRenameNoteOptimistic,
	onRenameFolder: onRenameFolderOptimistic,
	onMoveNote: onMoveNoteOptimistic,
	onMoveFolder: onMoveFolderOptimistic,
	onFolderVisited,
}: SidebarProps) {
	const { state, setActiveNote, toggleFolder, toggleSidebar } = useWorkspace();
	const [renamingId, setRenamingId] = useState<string | null>(null);

	// Drag & drop state
	const [draggedItem, setDraggedItem] = useState<{ id: string; type: "note" | "folder" } | null>(null);
	const [dropTargetId, setDropTargetId] = useState<string | "root" | null>(null);

	const handleCreateNote = useCallback(
		async (folderId?: string) => {
			if (onCreateNoteOptimistic) {
				const newNote = await onCreateNoteOptimistic(folderId);
				if (newNote) {
					setActiveNote(newNote.id);
				}
			} else {
				// Fallback to legacy behavior
				const res = await fetch("/api/notes", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ workspaceId, folderId }),
				});
				if (res.ok) {
					const note = await res.json();
					onRefresh();
					setActiveNote(note.id);
				}
			}
		},
		[workspaceId, onCreateNoteOptimistic, onRefresh, setActiveNote],
	);

	const handleCreateFolder = useCallback(
		async (parentId?: string) => {
			if (onCreateFolderOptimistic) {
				const folder = await onCreateFolderOptimistic(parentId);
				if (folder) {
					setRenamingId(folder.id);
				}
			} else {
				// Fallback to legacy behavior
				const res = await fetch("/api/folders", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ workspaceId, parentId, name: "New Folder" }),
				});
				if (res.ok) {
					const folder = await res.json();
					onRefresh();
					setRenamingId(folder.id);
				}
			}
		},
		[workspaceId, onCreateFolderOptimistic, onRefresh],
	);

	const handleRename = useCallback(
		async (id: string, type: "folder" | "note", newName: string) => {
			if (type === "folder" && onRenameFolderOptimistic) {
				await onRenameFolderOptimistic(id, newName);
			} else if (type === "note" && onRenameNoteOptimistic) {
				await onRenameNoteOptimistic(id, newName);
			} else {
				// Fallback to legacy behavior
				const endpoint = type === "folder" ? `/api/folders/${id}` : `/api/notes/${id}`;
				const body = type === "folder" ? { name: newName } : { title: newName };
				await fetch(endpoint, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				});
				onRefresh();
			}
			setRenamingId(null);
		},
		[onRenameFolderOptimistic, onRenameNoteOptimistic, onRefresh],
	);

	const handleDelete = useCallback(
		async (id: string, type: "folder" | "note") => {
			if (type === "folder" && onDeleteFolderOptimistic) {
				await onDeleteFolderOptimistic(id);
			} else if (type === "note" && onDeleteNoteOptimistic) {
				await onDeleteNoteOptimistic(id);
				if (state.activeNoteId === id) {
					setActiveNote(null);
				}
			} else {
				// Fallback to legacy behavior
				const endpoint = type === "folder" ? `/api/folders/${id}` : `/api/notes/${id}`;
				await fetch(endpoint, { method: "DELETE" });
				if (state.activeNoteId === id) {
					setActiveNote(null);
				}
				onRefresh();
			}
		},
		[onDeleteFolderOptimistic, onDeleteNoteOptimistic, onRefresh, state.activeNoteId, setActiveNote],
	);

	const handleDuplicate = useCallback(
		async (noteId: string) => {
			const res = await fetch(`/api/notes/${noteId}`);
			if (!res.ok) return;
			const note = await res.json();
			const createRes = await fetch("/api/notes", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspaceId, folderId: note.folderId }),
			});
			if (createRes.ok) {
				const newNote = await createRes.json();
				await fetch(`/api/notes/${newNote.id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						title: `${note.title} (copy)`,
						content: note.content,
					}),
				});
				onRefresh();
			}
		},
		[workspaceId, onRefresh],
	);

	const handleContextMenu = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		// Context menu disabled - users should use the More button
	}, []);

	// Drag & drop handlers
	const handleDragStart = useCallback((_e: React.DragEvent, id: string, type: "note" | "folder") => {
		setDraggedItem({ id, type });
	}, []);

	const handleDragOverFolder = useCallback((_e: React.DragEvent, folderId: string) => {
		setDropTargetId(folderId);
	}, []);

	const handleDragLeaveFolder = useCallback(() => {
		setDropTargetId(null);
	}, []);

	// Reset drag state when drag ends without dropping
	useEffect(() => {
		const handler = () => {
			setDraggedItem(null);
			setDropTargetId(null);
		};
		window.addEventListener("dragend", handler);
		return () => window.removeEventListener("dragend", handler);
	}, []);

	const handleDropOnFolder = useCallback(
		async (_e: React.DragEvent, folderId: string) => {
			if (!draggedItem) return;
			setDropTargetId(null);

			if (draggedItem.type === "note" && onMoveNoteOptimistic) {
				await onMoveNoteOptimistic(draggedItem.id, folderId);
			} else if (draggedItem.type === "folder" && onMoveFolderOptimistic) {
				await onMoveFolderOptimistic(draggedItem.id, folderId);
			} else {
				// Fallback to legacy behavior
				if (draggedItem.type === "note") {
					await fetch(`/api/notes/${draggedItem.id}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ folderId }),
					});
				} else if (draggedItem.type === "folder") {
					await fetch(`/api/folders/${draggedItem.id}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ parentId: folderId }),
					});
				}
				onRefresh();
			}

			setDraggedItem(null);
		},
		[draggedItem, onMoveNoteOptimistic, onMoveFolderOptimistic, onRefresh],
	);

	const handleDropOnRoot = useCallback(
		async (e: React.DragEvent) => {
			e.preventDefault();
			if (!draggedItem || dropTargetId !== "root") return;
			setDropTargetId(null);

			if (draggedItem.type === "note" && onMoveNoteOptimistic) {
				await onMoveNoteOptimistic(draggedItem.id, null);
			} else if (draggedItem.type === "folder" && onMoveFolderOptimistic) {
				await onMoveFolderOptimistic(draggedItem.id, null);
			} else {
				// Fallback to legacy behavior
				if (draggedItem.type === "note") {
					await fetch(`/api/notes/${draggedItem.id}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ folderId: null }),
					});
				} else if (draggedItem.type === "folder") {
					await fetch(`/api/folders/${draggedItem.id}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ parentId: null }),
					});
				}
				onRefresh();
			}

			setDraggedItem(null);
		},
		[draggedItem, dropTargetId, onMoveNoteOptimistic, onMoveFolderOptimistic, onRefresh],
	);

	useEffect(() => {
		const close = () => {
			// Cleanup handler removed as context menu is no longer used
		};
		window.addEventListener("click", close);
		return () => window.removeEventListener("click", close);
	}, []);

	// Keyboard shortcuts
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "n") {
				e.preventDefault();
				handleCreateNote();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [handleCreateNote]);

	const renderFolder = (folder: FolderTreeItem, depth: number = 0) => {
		const isExpanded = state.expandedFolders.has(folder.id);

		const handleFolderVisit = () => {
			toggleFolder(folder.id);
			onFolderVisited?.(folder.id);
		};

		return (
			<div key={folder.id} className="item-enter">
				<SidebarItem
					id={folder.id}
					name={folder.name}
					type="folder"
					depth={depth}
					isExpanded={isExpanded}
					isActive={false}
					isRenaming={renamingId === folder.id}
					onToggle={handleFolderVisit}
					onClick={handleFolderVisit}
					onContextMenu={handleContextMenu}
					onRename={(name) => handleRename(folder.id, "folder", name)}
					onCancelRename={() => setRenamingId(null)}
					onDragOver={handleDragOverFolder}
					onDrop={handleDropOnFolder}
					onDragLeave={handleDragLeaveFolder}
					isDragOver={dropTargetId === folder.id}
					draggable
					onDragStart={(e) => handleDragStart(e, folder.id, "folder")}
					menuActions={{
						onRename: () => setRenamingId(folder.id),
						onDelete: () => handleDelete(folder.id, "folder"),
						onNewNote: () => handleCreateNote(folder.id),
						onNewFolder: () => handleCreateFolder(folder.id),
					}}
				/>
				<div
					className="folder-content overflow-hidden transition-all duration-250 ease-in-out"
					style={{
						maxHeight: isExpanded ? "2000px" : "0",
						opacity: isExpanded ? 1 : 0,
					}}>
					{folder.children.map((child) => renderFolder(child, depth + 1))}
					{folder.notes.map((note) => (
						<SidebarItem
							key={note.id}
							id={note.id}
							name={note.title}
							type="note"
							emoji={note.emoji}
							depth={depth + 1}
							isActive={state.activeNoteId === note.id}
							isRenaming={renamingId === note.id}
							onClick={() => {
								setActiveNote(note.id);
								onFolderVisited?.(folder.id);
								if (typeof window !== "undefined" && window.innerWidth < 768) {
									toggleSidebar();
								}
							}}
							onContextMenu={handleContextMenu}
							onRename={(name) => handleRename(note.id, "note", name)}
							onCancelRename={() => setRenamingId(null)}
							onDoubleClick={() => setRenamingId(note.id)}
							draggable
							onDragStart={(e) => handleDragStart(e, note.id, "note")}
							menuActions={{
								onChangeIcon: () => {
									setActiveNote(note.id);
									window.dispatchEvent(new CustomEvent("open-emoji-picker", { detail: { noteId: note.id } }));
								},
								onRename: () => setRenamingId(note.id),
								onDuplicate: () => handleDuplicate(note.id),
								onDelete: () => handleDelete(note.id, "note"),
							}}
						/>
					))}
				</div>
			</div>
		);
	};

	const baseDisplayName = userName || userEmail || "User";
	const displayName = isGoogleUser ? `${baseDisplayName} (Google)` : baseDisplayName;
	const initials = displayName
		.split(" ")
		.map((w) => w[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

	return (
		<div
			className="flex h-full min-h-[100dvh] flex-col transition-all duration-300 ease-in-out"
			style={{
				width: state.sidebarWidth,
				minWidth: state.sidebarWidth,
				height: "100dvh",
				maxHeight: "100dvh",
				backgroundColor: "var(--bg-sidebar)",
				borderRight: "1px solid var(--border-default)",
			}}>
			{/* Workspace header */}
			<div className="flex h-12 items-center gap-2 px-3" style={{ borderBottom: "1px solid var(--border-default)" }}>
				<DropdownMenu>
					<DropdownMenuTrigger className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--sn-radius-sm)] px-1 py-1 transition-colors duration-150 hover:bg-[#1a1a1a]">
						<div
							className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-semibold"
							style={{
								backgroundColor: "var(--accent-muted)",
								color: "var(--sn-accent)",
							}}>
							{workspaceName.slice(0, 2).toUpperCase()}
						</div>
						<span className="flex-1 truncate text-left text-sm font-medium" style={{ color: "var(--text-primary)" }}>
							{workspaceName}
						</span>
						<ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-tertiary)" }} />
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="start"
						side="bottom"
						className="min-w-[200px]"
						style={{
							backgroundColor: "var(--bg-hover)",
							border: "1px solid var(--border-strong)",
						}}>
						<DropdownMenuGroup>
							<DropdownMenuLabel>
								<div className="flex items-center gap-2">
									<div
										className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
										style={{
											backgroundColor: "var(--accent-muted)",
											color: "var(--sn-accent)",
										}}>
										{initials}
									</div>
									<div className="min-w-0">
										<p className="truncate text-xs font-medium" style={{ color: "var(--text-primary)" }}>
											{displayName}
										</p>
										<p className="truncate text-xs" style={{ color: "var(--text-tertiary)" }}>
											{userEmail}
										</p>
									</div>
								</div>
							</DropdownMenuLabel>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={onAccountOpen}>
							<User className="h-3.5 w-3.5" />
							Account
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							variant="destructive"
							onClick={async () => {
								await signOutAction();
							}}>
							<LogOut className="h-3.5 w-3.5" />
							Sign out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>

				{/* Collapse sidebar button */}
				<button
					onClick={toggleSidebar}
					className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 hover:bg-[#1a1a1a]"
					title="Collapse sidebar (Ctrl+\)">
					<PanelLeftClose className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
				</button>
			</div>

			{/* Quick actions */}
			<div className="space-y-1 p-2">
				<Button
					variant="ghost"
					onClick={() => handleCreateNote()}
					className="h-8 w-full justify-start gap-2 px-2 text-sm text-[#888888] hover:bg-[#1a1a1a] hover:text-[#e8e8e8]">
					<Plus className="h-4 w-4" />
					New Note
				</Button>
				<Button
					variant="ghost"
					className="h-8 w-full justify-start gap-2 px-2 text-sm text-[#888888] hover:bg-[#1a1a1a] hover:text-[#e8e8e8]"
					onClick={onSearchOpen}>
					<Search className="h-4 w-4" />
					Search
					<span className="ml-auto text-xs text-[#555555]">Ctrl+K</span>
				</Button>
			</div>

			{/* File tree */}
			<div
				className="flex-1 overflow-y-auto px-1 py-1"
				onDragOver={(e) => {
					if (draggedItem) {
						e.preventDefault();
						setDropTargetId("root");
					}
				}}
				onDragLeave={() => {
					if (dropTargetId === "root") setDropTargetId(null);
				}}
				onDrop={handleDropOnRoot}>
				{tree.folders.map((folder) => renderFolder(folder))}
				{tree.folders.length > 0 && tree.rootNotes.length > 0 && <div style={{ height: "8px" }} />}
				{tree.rootNotes.map((note) => (
					<div key={note.id} className="item-enter">
						<SidebarItem
							id={note.id}
							name={note.title}
							type="note"
							emoji={note.emoji}
							depth={0}
							isActive={state.activeNoteId === note.id}
							isRenaming={renamingId === note.id}
							onClick={() => {
								setActiveNote(note.id);
								onFolderVisited?.(null);
								if (typeof window !== "undefined" && window.innerWidth < 768) {
									toggleSidebar();
								}
							}}
							onContextMenu={handleContextMenu}
							onRename={(name) => handleRename(note.id, "note", name)}
							onCancelRename={() => setRenamingId(null)}
							onDoubleClick={() => setRenamingId(note.id)}
							draggable
							onDragStart={(e) => handleDragStart(e, note.id, "note")}
							menuActions={{
								onChangeIcon: () => {
									setActiveNote(note.id);
									window.dispatchEvent(new CustomEvent("open-emoji-picker", { detail: { noteId: note.id } }));
								},
								onRename: () => setRenamingId(note.id),
								onDuplicate: () => handleDuplicate(note.id),
								onDelete: () => handleDelete(note.id, "note"),
							}}
						/>
					</div>
				))}

				{tree.folders.length === 0 && tree.rootNotes.length === 0 && (
					<div className="px-3 py-6 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
						No notes yet
					</div>
				)}

				{/* Root drop indicator */}
				{draggedItem && dropTargetId === "root" && (
					<div
						className="pointer-events-none mx-1 mt-1 rounded-[var(--sn-radius-sm)] py-1.5 text-center text-xs"
						style={{
							border: "1px dashed var(--sn-accent)",
							color: "var(--sn-accent)",
							backgroundColor: "var(--accent-muted)",
							position: "relative",
							zIndex: 999,
						}}>
						Move to root
					</div>
				)}
			</div>

			{/* Bottom: New folder button */}
			<div className="p-2" style={{ borderTop: "1px solid var(--border-default)" }}>
				<Button
					variant="ghost"
					onClick={() => handleCreateFolder()}
					className="h-8 w-full justify-start gap-2 px-2 text-xs text-[#555555] hover:bg-[#1a1a1a] hover:text-[#888888]">
					<Plus className="h-3.5 w-3.5" />
					New Folder
				</Button>
			</div>
		</div>
	);
}
