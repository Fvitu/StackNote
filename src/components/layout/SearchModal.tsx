"use client"

import { useState, useEffect, useRef } from "react"
import { Search, FileText, X } from "lucide-react"
import type { FolderTreeItem, NoteTreeItem, WorkspaceTree } from "@/types"

interface SearchResult extends NoteTreeItem {
  folderName?: string
}

function flattenNotes(
  folders: FolderTreeItem[],
  parentName?: string
): SearchResult[] {
  return folders.flatMap((f) => [
    ...f.notes.map((n) => ({ ...n, folderName: f.name })),
    ...flattenNotes(f.children, f.name),
  ])
}

interface SearchModalProps {
  tree: WorkspaceTree
  onSelectNote: (noteId: string) => void
  onClose: () => void
}

export function SearchModal({ tree, onSelectNote, onClose }: SearchModalProps) {
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const allNotes: SearchResult[] = [
    ...tree.rootNotes.map((n) => ({ ...n })),
    ...flattenNotes(tree.folders),
  ]

  const filtered = query.trim()
    ? allNotes.filter((n) =>
        (n.title || "Untitled").toLowerCase().includes(query.toLowerCase())
      )
    : allNotes.slice(0, 12)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh]"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] overflow-hidden rounded-[var(--sn-radius-lg)]"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-strong)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid var(--border-default)" }}
        >
          <Search className="h-4 w-4 shrink-0" style={{ color: "var(--text-tertiary)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--text-primary)" }}
          />
          <button
            onClick={onClose}
            className="flex h-5 w-5 items-center justify-center rounded"
            style={{ color: "var(--text-tertiary)" }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[380px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p
              className="px-4 py-8 text-center text-sm"
              style={{ color: "var(--text-tertiary)" }}
            >
              No notes found for &quot;{query}&quot;
            </p>
          ) : (
            filtered.map((note) => (
              <button
                key={note.id}
                onClick={() => {
                  onSelectNote(note.id)
                  onClose()
                }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100"
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLElement).style.backgroundColor =
                    "var(--bg-hover)"
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLElement).style.backgroundColor = ""
                }}
              >
                {note.emoji ? (
                  <span className="w-4 text-center text-sm">{note.emoji}</span>
                ) : (
                  <FileText
                    className="h-4 w-4 shrink-0"
                    style={{ color: "var(--text-tertiary)" }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {note.title || "Untitled"}
                  </p>
                  {note.folderName && (
                    <p
                      className="truncate text-xs"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {note.folderName}
                    </p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
