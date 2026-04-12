"use client";

import { Smile, Copy, Trash2, Pencil, FilePlus, FolderPlus, MoreHorizontal, Save, History as HistoryIcon, Hexagon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface NoteActionsMenuProps {
	type: "note" | "folder";
	trigger?: React.ReactElement;
	triggerIcon?: React.ReactNode;
	triggerClassName?: string;
	contentClassName?: string;
	align?: "start" | "center" | "end";
	side?: "top" | "bottom" | "left" | "right";
	disabled?: boolean;
	onChangeIcon?: () => void;
	onViewHistory?: () => void;
	onRename?: () => void;
	onDuplicate?: () => void;
	onSaveVersion?: () => void;
	saveVersionDisabled?: boolean;
	saveVersionLabel?: string;
	analysisItem?: {
		label: string;
		badge: React.ReactNode;
		onClick: () => void;
		disabled?: boolean;
	};
	onDelete?: () => void;
	onNewNote?: () => void;
	onNewFolder?: () => void;
	newFolderDisabled?: boolean;
}

export function NoteActionsMenu({
	type,
	trigger,
	triggerIcon = <MoreHorizontal className="h-3.5 w-3.5" />,
	triggerClassName = "flex h-6 w-6 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 hover:bg-[#1a1a1a]",
	contentClassName = "!w-fit !min-w-0 max-w-[min(92vw,22rem)]",
	align = "end",
	side = "bottom",
	disabled = false,
	onChangeIcon,
	onViewHistory,
	onRename,
	onDuplicate,
	onSaveVersion,
	saveVersionDisabled = false,
	saveVersionLabel = "Save version",
	analysisItem,
	onDelete,
	onNewNote,
	onNewFolder,
	newFolderDisabled = false,
}: NoteActionsMenuProps) {
	return (
		<DropdownMenu>
			{trigger ? (
				<DropdownMenuTrigger render={trigger} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} />
			) : (
				<Tooltip>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger
							className={triggerClassName}
							style={{ color: "var(--text-tertiary)" }}
							aria-label="More options"
							onClick={(e) => e.stopPropagation()}
							onPointerDown={(e) => e.stopPropagation()}>
							{triggerIcon}
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent>More options</TooltipContent>
				</Tooltip>
			)}
			<DropdownMenuContent align={align} side={side} className={contentClassName} onClick={(e) => e.stopPropagation()}>
				{type === "note" && onChangeIcon && (
					<DropdownMenuItem onClick={onChangeIcon} disabled={disabled}>
						<Smile className="h-3.5 w-3.5" />
						Change Icon
					</DropdownMenuItem>
				)}

				{onRename && (
					<DropdownMenuItem onClick={onRename} disabled={disabled}>
						<Pencil className="h-3.5 w-3.5" />
						Rename
					</DropdownMenuItem>
				)}

				{type === "folder" && onNewNote && (
					<DropdownMenuItem onClick={onNewNote} disabled={disabled}>
						<FilePlus className="h-3.5 w-3.5" />
						New Note
					</DropdownMenuItem>
				)}

				{type === "folder" && onNewFolder && (
					<DropdownMenuItem onClick={onNewFolder} disabled={disabled || newFolderDisabled}>
						<FolderPlus className="h-3.5 w-3.5" />
						New Folder
					</DropdownMenuItem>
				)}

				{type === "note" && onDuplicate && (
					<DropdownMenuItem onClick={onDuplicate} disabled={disabled}>
						<Copy className="h-3.5 w-3.5" />
						Duplicate
					</DropdownMenuItem>
				)}

				{type === "note" && onViewHistory && (
					<DropdownMenuItem onClick={onViewHistory} disabled={disabled}>
						<HistoryIcon className="h-3.5 w-3.5" />
						History
					</DropdownMenuItem>
				)}

				{type === "note" && onSaveVersion && (
					<DropdownMenuItem onClick={onSaveVersion} disabled={disabled || saveVersionDisabled}>
						<Save className="h-3.5 w-3.5" />
						{saveVersionLabel}
					</DropdownMenuItem>
				)}

				{type === "note" && analysisItem && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={analysisItem.onClick}
							disabled={disabled || analysisItem.disabled}
							className="min-w-0 items-start gap-2 py-2">
							<Hexagon className="h-3.5 w-3.5" />
							<div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
								<span className="min-w-0 flex-1 text-sm leading-5">{analysisItem.label}</span>
								{analysisItem.badge}
							</div>
						</DropdownMenuItem>
					</>
				)}

				{onDelete && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={onDelete} variant="destructive" disabled={disabled}>
							<Trash2 className="h-3.5 w-3.5" />
							Move to Trash
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
