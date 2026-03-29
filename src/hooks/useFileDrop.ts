"use client"

import { useCallback, useState } from "react"

interface UseFileDropOptions {
  onDropFiles: (files: File[], event: React.DragEvent<HTMLDivElement>) => Promise<void>
}

export function useFileDrop({ onDropFiles }: UseFileDropOptions) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (event.currentTarget.contains(event.relatedTarget as Node)) return
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragging(false)
      const files = Array.from(event.dataTransfer.files ?? [])
      if (!files.length) return
      await onDropFiles(files, event)
    },
    [onDropFiles],
  )

  return {
    isDragging,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  }
}
