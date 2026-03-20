"use client"

import { Pencil, Trash2, FilePlus, FolderPlus, Copy, Smile } from "lucide-react";

interface SidebarContextMenuProps {
	x: number;
	y: number;
	type: "folder" | "note";
	onRename: () => void;
	onDelete: () => void;
	onNewNote?: () => void;
	onNewFolder?: () => void;
	onDuplicate?: () => void;
	onChangeIcon?: () => void;
}

export function SidebarContextMenu({ x, y, type, onRename, onDelete, onNewNote, onNewFolder, onDuplicate, onChangeIcon }: SidebarContextMenuProps) {
	const items: {
		label: string;
		icon: React.ReactNode;
		action: () => void;
		destructive?: boolean;
	}[] = [];

	if (type === "note" && onChangeIcon) {
		items.push({
			label: "Change Icon",
			icon: <Smile className="h-3.5 w-3.5" />,
			action: onChangeIcon,
		});
	}

	items.push({
		label: "Rename",
		icon: <Pencil className="h-3.5 w-3.5" />,
		action: onRename,
	});

	if (type === "folder") {
		if (onNewNote) {
			items.push({
				label: "New Note",
				icon: <FilePlus className="h-3.5 w-3.5" />,
				action: onNewNote,
			});
		}
		if (onNewFolder) {
			items.push({
				label: "New Folder",
				icon: <FolderPlus className="h-3.5 w-3.5" />,
				action: onNewFolder,
			});
		}
	}

	if (type === "note" && onDuplicate) {
		items.push({
			label: "Duplicate",
			icon: <Copy className="h-3.5 w-3.5" />,
			action: onDuplicate,
		});
	}

	items.push({
		label: "Delete",
		icon: <Trash2 className="h-3.5 w-3.5" />,
		action: onDelete,
		destructive: true,
	});

	return (
		<div
			className="fixed z-50 min-w-[160px] rounded-[var(--sn-radius-md)] py-1"
			style={{
				top: y,
				left: x,
				backgroundColor: "var(--bg-hover)",
				border: "1px solid var(--border-strong)",
				boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
			}}
			onClick={(e) => e.stopPropagation()}>
			{items.map((item) => (
				<button
					key={item.label}
					onClick={item.action}
					className="flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors duration-100"
					style={{
						color: item.destructive ? "#ef4444" : "var(--text-secondary)",
					}}
					onMouseEnter={(e) => {
						(e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-active)";
					}}
					onMouseLeave={(e) => {
						(e.currentTarget as HTMLElement).style.backgroundColor = "";
					}}>
					{item.icon}
					{item.label}
				</button>
			))}
		</div>
	);
}
