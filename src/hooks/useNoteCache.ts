"use client"

import { useCallback, useMemo } from "react"
import { normalizeBlockNoteContent } from "@/lib/blocknote-normalize"
import { NOTE_CACHE_KEY, NOTE_CACHE_LIMIT } from "@/lib/note-versioning"

export interface CachedNoteMetadata {
  emoji?: string | null
  coverImage?: string | null
  coverImageMeta?: unknown
  createdAt?: string
  workspace?: { name: string }
  folder?: { name: string } | null
  editorWidth?: number | null
}

export interface CachedNote {
  id: string
  title: string
  content: unknown
  updatedAt: string
  cachedAt: string
  dirty: boolean
  metadata?: CachedNoteMetadata
}

export interface CacheableNoteInput {
  id: string
  title: string
  content: unknown
  updatedAt: string
  dirty?: boolean
  metadata?: CachedNoteMetadata
}

function readCache(): CachedNote[] {
  if (typeof window === "undefined") {
    return []
  }

  try {
    const raw = window.localStorage.getItem(NOTE_CACHE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter((entry): entry is CachedNote => {
        return (
          entry &&
          typeof entry === "object" &&
          typeof entry.id === "string" &&
          typeof entry.title === "string" &&
          typeof entry.updatedAt === "string" &&
          typeof entry.cachedAt === "string" &&
          typeof entry.dirty === "boolean"
        )
      })
      .slice(0, NOTE_CACHE_LIMIT)
  } catch {
    return []
  }
}

function writeCache(entries: CachedNote[]) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(
    NOTE_CACHE_KEY,
    JSON.stringify(entries.slice(0, NOTE_CACHE_LIMIT)),
  )
}

function upsertEntry(entries: CachedNote[], entry: CachedNote): CachedNote[] {
  const nextEntries = [entry, ...entries.filter((candidate) => candidate.id !== entry.id)]
  return nextEntries.slice(0, NOTE_CACHE_LIMIT)
}

function buildEntry(
  input: CacheableNoteInput,
  existing?: CachedNote,
): CachedNote {
  return {
    id: input.id,
    title: input.title,
    content: normalizeBlockNoteContent(input.content),
    updatedAt: input.updatedAt,
    cachedAt: new Date().toISOString(),
    dirty: input.dirty ?? false,
    metadata: {
      ...existing?.metadata,
      ...input.metadata,
    },
  }
}

export function useNoteCache() {
  const getEntries = useCallback(() => readCache(), [])

  const getCachedNote = useCallback((noteId: string) => {
    return readCache().find((entry) => entry.id === noteId) ?? null
  }, [])

  const touchCachedNote = useCallback((noteId: string) => {
    const entries = readCache()
    const entry = entries.find((candidate) => candidate.id === noteId)
    if (!entry) {
      return null
    }

    writeCache(upsertEntry(entries, entry))
    return entry
  }, [])

  const upsertCachedNote = useCallback((input: CacheableNoteInput) => {
    const entries = readCache()
    const existing = entries.find((entry) => entry.id === input.id)
    const entry = buildEntry(input, existing)
    writeCache(upsertEntry(entries, entry))
    return entry
  }, [])

  const markClean = useCallback((noteId: string, updatedAt: string) => {
    const entries = readCache()
    const existing = entries.find((entry) => entry.id === noteId)
    if (!existing) {
      return null
    }

    const entry: CachedNote = {
      ...existing,
      updatedAt,
      cachedAt: new Date().toISOString(),
      dirty: false,
    }

    writeCache(upsertEntry(entries, entry))
    return entry
  }, [])

  const getDirtyNotes = useCallback(() => {
    return readCache().filter((entry) => entry.dirty)
  }, [])

  return useMemo(
    () => ({
      getEntries,
      getCachedNote,
      touchCachedNote,
      upsertCachedNote,
      markClean,
      getDirtyNotes,
    }),
    [getEntries, getCachedNote, getDirtyNotes, markClean, touchCachedNote, upsertCachedNote],
  )
}
