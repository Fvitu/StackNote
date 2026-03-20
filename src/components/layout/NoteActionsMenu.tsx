"use client"

import {
  Smile,
  Copy,
  Trash2,
  Expand,
  Pencil,
  FilePlus,
  FolderPlus,
  MoreHorizontal,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface NoteActionsMenuProps {
  type: "note" | "folder"
  triggerIcon?: React.ReactNode
  triggerClassName?: string
  align?: "start" | "center" | "end"
  side?: "top" | "bottom" | "left" | "right"
  onChangeIcon?: () => void
  onRename?: () => void
  onDuplicate?: () => void
  onFullscreen?: () => void
  onDelete?: () => void
  onNewNote?: () => void
  onNewFolder?: () => void
}

export function NoteActionsMenu({
  type,
  triggerIcon = <MoreHorizontal className="h-3.5 w-3.5" />,
  triggerClassName = "flex h-6 w-6 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 hover:bg-[#1a1a1a]",
  align = "end",
  side = "bottom",
  onChangeIcon,
  onRename,
  onDuplicate,
  onFullscreen,
  onDelete,
  onNewNote,
  onNewFolder,
}: NoteActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={triggerClassName}
        style={{ color: "var(--text-tertiary)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {triggerIcon}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        side={side}
        onClick={(e) => e.stopPropagation()}
      >
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

        {type === "note" && onFullscreen && (
          <DropdownMenuItem onClick={onFullscreen}>
            <Expand className="h-3.5 w-3.5" />
            Full Screen
          </DropdownMenuItem>
        )}

        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} variant="destructive">
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
