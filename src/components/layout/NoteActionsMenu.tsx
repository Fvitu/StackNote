"use client"

import { Smile, Copy, Trash2, Pencil, FilePlus, FolderPlus, MoreHorizontal, Save } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface NoteActionsMenuProps {
	type: "note" | "folder";
	trigger?: React.ReactNode;
	triggerIcon?: React.ReactNode;
	triggerClassName?: string;
	align?: "start" | "center" | "end";
	side?: "top" | "bottom" | "left" | "right";
	onChangeIcon?: () => void;
	onRename?: () => void;
	onDuplicate?: () => void;
	onSaveVersion?: () => void;
	saveVersionDisabled?: boolean;
	saveVersionLabel?: string;
	onDelete?: () => void;
	onNewNote?: () => void;
	onNewFolder?: () => void;
}

export function NoteActionsMenu({
	type,
	trigger,
	triggerIcon = <MoreHorizontal className="h-3.5 w-3.5" />,
	triggerClassName = "flex h-6 w-6 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 hover:bg-[#1a1a1a]",
	align = "end",
	side = "bottom",
	onChangeIcon,
	onRename,
	onDuplicate,
	onSaveVersion,
	saveVersionDisabled = false,
	saveVersionLabel = "Save version",
	onDelete,
	onNewNote,
	onNewFolder,
}: NoteActionsMenuProps) {
	return (
		<DropdownMenu>
			{trigger ? (
				<DropdownMenuTrigger onClick={(e) => e.stopPropagation()}>{trigger}</DropdownMenuTrigger>
			) : (
				<DropdownMenuTrigger className={triggerClassName} style={{ color: "var(--text-tertiary)" }} onClick={(e) => e.stopPropagation()}>
					{triggerIcon}
				</DropdownMenuTrigger>
			)}
			<DropdownMenuContent align={align} side={side} onClick={(e) => e.stopPropagation()}>
				{type === "note" && onChangeIcon && (
					<DropdownMenuItem onClick={onChangeIcon}>
						<Smile className="h-3.5 w-3.5" />
						Change Icon
					</DropdownMenuItem>
				)}

				{onRename && (
					<DropdownMenuItem onClick={onRename}>
						<Pencil className="h-3.5 w-3.5" />
						Rename
					</DropdownMenuItem>
				)}

				{type === "folder" && onNewNote && (
					<DropdownMenuItem onClick={onNewNote}>
						<FilePlus className="h-3.5 w-3.5" />
						New Note
					</DropdownMenuItem>
				)}

				{type === "folder" && onNewFolder && (
					<DropdownMenuItem onClick={onNewFolder}>
						<FolderPlus className="h-3.5 w-3.5" />
						New Folder
					</DropdownMenuItem>
				)}

				{type === "note" && onDuplicate && (
					<DropdownMenuItem onClick={onDuplicate}>
						<Copy className="h-3.5 w-3.5" />
						Duplicate
					</DropdownMenuItem>
				)}

				{type === "note" && onSaveVersion && (
					<DropdownMenuItem onClick={onSaveVersion} disabled={saveVersionDisabled}>
						<Save className="h-3.5 w-3.5" />
						{saveVersionLabel}
					</DropdownMenuItem>
				)}

				{onDelete && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={onDelete} variant="destructive">
							<Trash2 className="h-3.5 w-3.5" />
							{type === "note" ? "Remove" : "Delete"}
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
