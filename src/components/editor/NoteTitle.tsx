"use client"

import { useState, useRef, useEffect } from "react"
import { useDebouncedCallback } from "use-debounce"

interface NoteTitleProps {
  initialTitle: string
  onSave: (title: string) => Promise<void>
  autoFocus?: boolean
}

export function NoteTitle({ initialTitle, onSave, autoFocus }: NoteTitleProps) {
  const [title, setTitle] = useState(initialTitle)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setTitle(initialTitle)
  }, [initialTitle])

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [autoFocus])

  const debouncedSave = useDebouncedCallback(async (value: string) => {
    await onSave(value)
  }, 1500)

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTitle(e.target.value)
    debouncedSave(e.target.value)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
    }
  }

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = "auto"
      el.style.height = `${el.scrollHeight}px`
    }
  }, [title])

  return (
    <textarea
      ref={textareaRef}
      value={title}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder="Untitled"
      rows={1}
      className="w-full resize-none border-0 bg-transparent text-4xl font-semibold leading-tight outline-none placeholder:text-[#333333]"
      style={{ color: "var(--text-primary)" }}
    />
  )
}
