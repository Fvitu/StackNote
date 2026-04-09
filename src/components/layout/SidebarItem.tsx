"use client";

import { useState, useRef, useEffect } from "react";
import { Folder, FileText, ChevronRight, MoreHorizontal } from "lucide-react";
import { NoteActionsMenu } from "./NoteActionsMenu";

interface SidebarItemProps {
	id: string;
	name: string;
	type: "folder" | "note";
	variant?: "default" | "home-card";
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
	variant = "default",
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
	const inputRef = useRef<HTMLInputElement>(null);
	const isHomeCardVariant = variant === "home-card";

	useEffect(() => {
		if (isRenaming && inputRef.current) {
			const animationFrame = window.requestAnimationFrame(() => {
				setEditName(name);
				inputRef.current?.focus();
				inputRef.current?.select();
			});

			return () => {
				window.cancelAnimationFrame(animationFrame);
			};
		}
	}, [isRenaming, name]);

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

	const getBgColor = () => {
		if (isDragOver) return "rgba(124, 106, 255, 0.12)";
		if (isActive) return isHomeCardVariant ? "rgba(124, 106, 255, 0.08)" : "var(--bg-active)";
		return undefined;
	};

	const getBorderLeft = () => {
		if (isDragOver) return "2px solid var(--sn-accent)";
		if (isActive) return "2px solid var(--sn-accent)";
		return "2px solid transparent";
	};

	return (
		<div
			className={`group/sidebar-item mb-0.5 flex cursor-pointer items-center gap-1 smooth-bg smooth-border item-enter ${
				isHomeCardVariant
					? "min-h-[36px] rounded-lg px-2 py-1.5 transition-all duration-200 hover:bg-[#1a1a1a]"
					: "h-7 rounded-[var(--sn-radius-sm)] pr-1"
			}`}
			style={{
				paddingLeft: isHomeCardVariant ? `${8 + depth * 14}px` : `${8 + depth * 12}px`,
				backgroundColor: getBgColor(),
				borderLeft: getBorderLeft(),
				userSelect: isRenaming ? "text" : "none",
				WebkitUserSelect: isRenaming ? "text" : "none",
				WebkitTouchCallout: "none",
				touchAction: "pan-y",
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
				if (!isHomeCardVariant && !isActive && !isDragOver) {
					(e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover)";
				}
			}}
			onMouseLeave={(e) => {
				if (!isHomeCardVariant && !isActive && !isDragOver) {
					(e.currentTarget as HTMLElement).style.backgroundColor = "";
				}
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
						className={`${isHomeCardVariant ? "h-3.5 w-3.5" : "h-3 w-3"} transition-transform duration-150`}
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
				<Folder className={`${isHomeCardVariant ? "h-4 w-4 opacity-70" : "h-3.5 w-3.5"} shrink-0`} style={{ color: "var(--text-tertiary)" }} />
			) : emoji ? (
				<span className="shrink-0 text-sm leading-none opacity-70">{emoji}</span>
			) : (
				<FileText className={`${isHomeCardVariant ? "h-4 w-4 opacity-70" : "h-3.5 w-3.5"} shrink-0`} style={{ color: "var(--text-tertiary)" }} />
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
				<span
					className={`ml-1 flex-1 truncate select-none ${isHomeCardVariant ? "text-sm" : "text-xs"}`}
					style={{ color: isActive ? "var(--text-primary)" : "var(--text-secondary)" }}>
					{name}
				</span>
			)}

			{/* More button / Menu */}
			{!isRenaming &&
				(menuActions || onMoreClick) &&
				(menuActions ? (
					<NoteActionsMenu
						type={type}
						triggerIcon={<MoreHorizontal className="h-3.5 w-3.5" />}
						triggerClassName="flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--sn-radius-sm)] opacity-0 pointer-events-none transition-opacity duration-100 group-hover/sidebar-item:opacity-100 group-hover/sidebar-item:pointer-events-auto hover:bg-[var(--bg-active)]"
						contentClassName="w-auto min-w-[168px]"
						onChangeIcon={menuActions.onChangeIcon}
						onRename={menuActions.onRename}
						onDuplicate={menuActions.onDuplicate}
						onDelete={menuActions.onDelete}
						onNewNote={menuActions.onNewNote}
						onNewFolder={menuActions.onNewFolder}
					/>
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



