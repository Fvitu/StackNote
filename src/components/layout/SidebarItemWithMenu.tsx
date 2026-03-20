"use client"

import { SidebarItem } from "./SidebarItem"
import { NoteActionsMenu } from "./NoteActionsMenu"
import { MoreHorizontal } from "lucide-react"

interface SidebarItemWithMenuProps {
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
	onDoubleClick?: () => void;
	onContextMenu?: (e: React.MouseEvent) => void;
	onRename?: (newName: string) => void;
	onCancelRename?: () => void;
	// Drag & drop
	draggable?: boolean;
	onDragStart?: (e: React.DragEvent, id: string) => void;
	onDragOver?: (e: React.DragEvent, id: string) => void;
	onDrop?: (e: React.DragEvent, id: string) => void;
	onDragLeave?: (e: React.DragEvent) => void;
	isDragOver?: boolean;
	// Actions
	onChangeIcon?: () => void;
	onDuplicate?: () => void;
	onDelete?: () => void;
	onNewNote?: () => void;
	onNewFolder?: () => void;
}

export function SidebarItemWithMenu(props: SidebarItemWithMenuProps) {
  const { type, onChangeIcon, onRename, onDuplicate, onDelete, onNewNote, onNewFolder, isRenaming, ...restProps } = props;

  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  return (
		<div className="relative flex items-center">
			<SidebarItem
				{...restProps}
				type={type}
				isRenaming={isRenaming}
				onRename={onRename}
				onMoreClick={undefined} // Remove original handler
			/>
			{!isRenaming && (
				<div className="absolute right-1 opacity-0 group-hover/sidebar-item:opacity-100 transition-opacity">
					<NoteActionsMenu
						type={type}
						trigger={
							<button
								onClick={handleMoreClick}
								className="flex h-5 w-5 items-center justify-center rounded-[var(--sn-radius-sm)] hover:bg-[var(--bg-active)]"
								style={{ color: "var(--text-tertiary)" }}>
								<MoreHorizontal className="h-3.5 w-3.5" />
							</button>
						}
						align="end"
						side="bottom"
						onChangeIcon={type === "note" ? onChangeIcon : undefined}
						onRename={onRename ? () => props.onCancelRename?.() : undefined}
						onDuplicate={type === "note" ? onDuplicate : undefined}
						onDelete={onDelete}
						onNewNote={type === "folder" ? onNewNote : undefined}
						onNewFolder={type === "folder" ? onNewFolder : undefined}
					/>
				</div>
			)}
		</div>
  );
}
