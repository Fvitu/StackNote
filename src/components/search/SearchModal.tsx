"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Search, X, FileText } from "lucide-react"

type ResultItem = {
  id: string
  title: string
  emoji?: string | null
  excerpt: string
  updatedAt: string
}

interface SearchModalProps {
  workspaceId: string
  open: boolean
  onClose: () => void
  onSelectNote: (noteId: string) => void
}

function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [delay, value])

  return debounced
}

export function SearchModal({ workspaceId, open, onClose, onSelectNote }: SearchModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ResultItem[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [mode, setMode] = useState<"recent" | "search">("recent")

  const debouncedQuery = useDebounced(query, 300)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    setActiveIndex(0)
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    const run = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/search?workspaceId=${workspaceId}&q=${encodeURIComponent(debouncedQuery)}`)
        const data = (await response.json()) as { mode: "recent" | "search"; results: ResultItem[] }
        if (!cancelled) {
          setResults(data.results ?? [])
          setMode(data.mode)
          setActiveIndex(0)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [debouncedQuery, open, workspaceId])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key === "ArrowDown") {
        event.preventDefault()
        setActiveIndex((prev) => Math.min(results.length - 1, prev + 1))
        return
      }

      if (event.key === "ArrowUp") {
        event.preventDefault()
        setActiveIndex((prev) => Math.max(0, prev - 1))
        return
      }

      if (event.key === "Enter") {
        const selected = results[activeIndex]
        if (!selected) return
        event.preventDefault()
        onSelectNote(selected.id)
        onClose()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [activeIndex, onClose, onSelectNote, open, results])

  const emptyState = useMemo(() => {
    if (loading) return "Searching..."
    if (!debouncedQuery.trim()) return "No recent notes"
    return `No notes found for "${debouncedQuery}"`
  }, [debouncedQuery, loading])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center p-4 pt-[12vh]"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-[600px] flex-col overflow-hidden rounded-[var(--sn-radius-lg)] border"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-strong)",
          maxHeight: "70vh",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-12 items-center gap-3 px-4" style={{ borderBottom: "1px solid var(--border-default)" }}>
          <Search className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your notes..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--text-primary)" }}
          />
          {loading && <div className="h-3.5 w-3.5 animate-spin rounded-full border-2" style={{ borderColor: "var(--text-tertiary)", borderTopColor: "transparent" }} />}
          <button onClick={onClose} className="rounded-[var(--sn-radius-sm)] p-1" style={{ color: "var(--text-tertiary)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(70vh-80px)] overflow-y-auto py-1">
          {!results.length ? (
            <div className="flex min-h-36 items-center justify-center px-4 text-sm" style={{ color: "var(--text-tertiary)" }}>
              {emptyState}
            </div>
          ) : (
            <>
              <div className="px-4 py-1 text-[11px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
                {mode === "recent" ? "Recent" : "Results"}
              </div>
              {results.map((result, index) => {
                const active = index === activeIndex

                return (
                  <button
                    key={result.id}
                    className="w-full px-4 py-2 text-left"
                    style={{ backgroundColor: active ? "var(--bg-hover)" : "transparent" }}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      onSelectNote(result.id)
                      onClose()
                    }}
                  >
                    <div className="flex items-start gap-2">
                      {result.emoji ? (
                        <span className="mt-0.5 text-sm">{result.emoji}</span>
                      ) : (
                        <FileText className="mt-0.5 h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm" style={{ color: "var(--text-primary)" }}>
                          {result.title || "Untitled"}
                        </p>
                        {result.excerpt && (
                          <p
                            className="mt-0.5 line-clamp-2 text-xs"
                            style={{ color: "var(--text-secondary)" }}
                            dangerouslySetInnerHTML={{ __html: result.excerpt }}
                          />
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </>
          )}
        </div>

        <div className="flex h-8 items-center justify-center text-[11px]" style={{ borderTop: "1px solid var(--border-default)", color: "var(--text-tertiary)" }}>
          [↑↓ to navigate] [Enter to open] [Esc]
        </div>
      </div>
    </div>,
    document.body,
  )
}
