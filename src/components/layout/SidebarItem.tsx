"use client";

import { useState, useRef, useEffect } from "react";
import { Folder, FileText, ChevronRight, MoreHorizontal, Smile, Pencil, Copy, Trash2, FilePlus, FolderPlus } from "lucide-react";

interface SidebarItemProps {
	id: string;
	name: string;
	type: "folder" | "note";
	emoji?: string | null;
	depth: number;
	isExpanded?: boolean;
	isActive?: boolean;
	isRenaming?: boolean;
	onToggle?: () => void;
	onClick?: () => void;
	onMouseEnter?: () => void;
	onDoubleClick?: () => void;
	onContextMenu?: (e: React.MouseEvent) => void;
	onMoreClick?: (e: React.MouseEvent) => void; // Deprecated, use menu actions
	onRename?: (newName: string) => void;
	onCancelRename?: () => void;
	// Drag & drop
	draggable?: boolean;
	onDragStart?: (e: React.DragEvent, id: string) => void;
	onDragOver?: (e: React.DragEvent, id: string) => void;
	onDrop?: (e: React.DragEvent, id: string) => void;
	onDragLeave?: (e: React.DragEvent) => void;
	isDragOver?: boolean;
	// Menu actions
	menuActions?: {
		onChangeIcon?: () => void;
		onRename?: () => void;
		onDuplicate?: () => void;
		onDelete?: () => void;
		onNewNote?: () => void;
		onNewFolder?: () => void;
	};
}

export function SidebarItem({
  id,
  name,
  type,
  emoji,
  depth,
  isExpanded,
  isActive,
  isRenaming,
  onToggle,
  onClick,
  onMouseEnter,
  onDoubleClick,
  onContextMenu,
  onMoreClick, // Deprecated
  onRename,
  onCancelRename,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragLeave,
  isDragOver,
  menuActions,
}: SidebarItemProps) {
  const [editName, setEditName] = useState(name);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      setEditName(name);
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming, name]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  const handleRenameSubmit = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== name) {
      onRename?.(trimmed);
    } else {
      onCancelRename?.();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      onCancelRename?.();
    }
  };

  const runMenuAction = (action?: () => void) => {
    if (!action) {
      return;
    }

    setIsMenuOpen(false);
    action();
  };

  const getBgColor = () => {
    if (isDragOver) return "var(--accent-muted)";
    if (isActive) return "var(--bg-active)";
    return undefined;
  };

  const getBorderLeft = () => {
    if (isDragOver) return "2px solid var(--sn-accent)";
    if (isActive) return "2px solid var(--sn-accent)";
    return "2px solid transparent";
  };

  return (
		<div
			className="group/sidebar-item mb-0.5 flex h-7 cursor-pointer items-center gap-1 rounded-[var(--sn-radius-sm)] pr-1 smooth-bg smooth-border item-enter"
			style={{
				paddingLeft: `${8 + depth * 12}px`,
				backgroundColor: getBgColor(),
				borderLeft: getBorderLeft(),
			}}
			draggable={draggable}
			onDragStart={draggable ? (e) => onDragStart?.(e, id) : undefined}
			onDragOver={
				type === "folder"
					? (e) => {
							e.preventDefault();
							e.stopPropagation();
							onDragOver?.(e, id);
						}
					: undefined
			}
			onDrop={
				type === "folder"
					? (e) => {
							e.preventDefault();
							e.stopPropagation();
							onDrop?.(e, id);
						}
					: undefined
			}
			onDragLeave={type === "folder" ? onDragLeave : undefined}
			onMouseEnter={(e) => {
				onMouseEnter?.();
				if (!isActive && !isDragOver) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover)";
			}}
			onMouseLeave={(e) => {
				if (!isActive && !isDragOver) (e.currentTarget as HTMLElement).style.backgroundColor = "";
			}}
			onClick={onClick}
			onDoubleClick={onDoubleClick}
			onContextMenu={onContextMenu}>
			{/* Expand arrow for folders */}
			{type === "folder" ? (
				<button
					onClick={(e) => {
						e.stopPropagation();
						onToggle?.();
					}}
					className="flex h-4 w-4 shrink-0 items-center justify-center">
					<ChevronRight
						className="h-3 w-3 transition-transform duration-150"
						style={{
							color: "var(--text-tertiary)",
							transform: isExpanded ? "rotate(90deg)" : undefined,
						}}
					/>
				</button>
			) : (
				<span className="w-4" />
			)}

			{/* Icon */}
			{type === "folder" ? (
				<Folder className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-tertiary)" }} />
			) : emoji ? (
				<span className="shrink-0 text-sm leading-none">{emoji}</span>
			) : (
				<FileText className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-tertiary)" }} />
			)}

			{/* Name */}
			{isRenaming ? (
				<input
					ref={inputRef}
					value={editName}
					onChange={(e) => setEditName(e.target.value)}
					onBlur={handleRenameSubmit}
					onKeyDown={handleKeyDown}
					onClick={(e) => e.stopPropagation()}
					className="ml-1 flex-1 rounded-[var(--sn-radius-sm)] border-0 bg-[#1a1a1a] px-1 py-0 text-xs text-[#e8e8e8] outline-none focus:ring-2 focus:ring-[var(--sn-accent)]"
				/>
			) : (
				<span className="ml-1 flex-1 truncate text-xs" style={{ color: isActive ? "var(--text-primary)" : "var(--text-secondary)" }}>
					{name}
				</span>
			)}

			{/* More button / Menu */}
			{!isRenaming &&
				(menuActions || onMoreClick) &&
				(menuActions ? (
					<div ref={menuRef} className="relative shrink-0">
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								setIsMenuOpen((value) => !value);
							}}
							className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--sn-radius-sm)] opacity-0 pointer-events-none transition-opacity duration-100 group-hover/sidebar-item:opacity-100 group-hover/sidebar-item:pointer-events-auto hover:bg-[var(--bg-active)]"
							data-popup-open={isMenuOpen ? "" : undefined}
							style={{ color: "var(--text-tertiary)" }}>
							<MoreHorizontal className="h-3.5 w-3.5" />
						</button>

						{isMenuOpen && (
							<div
								role="menu"
								onClick={(event) => event.stopPropagation()}
								className="absolute right-0 top-[calc(100%+0.375rem)] z-50 min-w-[168px] rounded-lg p-1 shadow-md ring-1 ring-foreground/10 fade-in"
								style={{
									backgroundColor: "var(--bg-hover)",
									border: "1px solid var(--border-strong)",
								}}>
								{type === "note" && menuActions.onChangeIcon && (
									<button
										type="button"
										role="menuitem"
										onClick={() => runMenuAction(menuActions.onChangeIcon)}
										className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
										style={{ color: "var(--text-primary)" }}>
										<Smile className="h-3.5 w-3.5" />
										Change Icon
									</button>
								)}

								{menuActions.onRename && (
									<button
										type="button"
										role="menuitem"
										onClick={() => runMenuAction(menuActions.onRename)}
										className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
										style={{ color: "var(--text-primary)" }}>
										<Pencil className="h-3.5 w-3.5" />
										Rename
									</button>
								)}

								{type === "folder" && menuActions.onNewNote && (
									<button
										type="button"
										role="menuitem"
										onClick={() => runMenuAction(menuActions.onNewNote)}
										className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
										style={{ color: "var(--text-primary)" }}>
										<FilePlus className="h-3.5 w-3.5" />
										New Note
									</button>
								)}

								{type === "folder" && menuActions.onNewFolder && (
									<button
										type="button"
										role="menuitem"
										onClick={() => runMenuAction(menuActions.onNewFolder)}
										className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
										style={{ color: "var(--text-primary)" }}>
										<FolderPlus className="h-3.5 w-3.5" />
										New Folder
									</button>
								)}

								{type === "note" && menuActions.onDuplicate && (
									<button
										type="button"
										role="menuitem"
										onClick={() => runMenuAction(menuActions.onDuplicate)}
										className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
										style={{ color: "var(--text-primary)" }}>
										<Copy className="h-3.5 w-3.5" />
										Duplicate
									</button>
								)}

								{menuActions.onDelete && (
									<>
										<div className="-mx-1 my-1 h-px bg-border" />
										<button
											type="button"
											role="menuitem"
											onClick={() => runMenuAction(menuActions.onDelete)}
											className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-destructive/10"
											style={{ color: "var(--text-primary)" }}>
											<Trash2 className="h-3.5 w-3.5" />
											{type === "note" ? "Remove" : "Delete"}
										</button>
									</>
								)}
							</div>
						)}
					</div>
				) : (
					<button
						onClick={(e) => {
							e.stopPropagation();
							onMoreClick?.(e);
						}}
						className="hidden h-5 w-5 shrink-0 items-center justify-center rounded-[var(--sn-radius-sm)] group-hover:flex"
						style={{ color: "var(--text-tertiary)" }}
						onMouseEnter={(e) => {
							(e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-active)";
						}}
						onMouseLeave={(e) => {
							(e.currentTarget as HTMLElement).style.backgroundColor = "";
						}}>
						<MoreHorizontal className="h-3.5 w-3.5" />
					</button>
				))}
		</div>
  );
}
