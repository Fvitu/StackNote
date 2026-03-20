"use client"

import { useCreateBlockNote } from "@blocknote/react"
import { BlockNoteView } from "@blocknote/mantine"
import "@blocknote/mantine/style.css"
import { useEffect, forwardRef, useImperativeHandle } from "react"
import { useDebouncedCallback } from "use-debounce"

interface NoteEditorProps {
  noteId: string
  initialContent: unknown
  onSave: (content: unknown) => Promise<void>
}

export interface NoteEditorRef {
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}

export const NoteEditor = forwardRef<NoteEditorRef, NoteEditorProps>(
  ({ noteId, initialContent, onSave }, ref) => {
    const editor = useCreateBlockNote({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialContent: (initialContent as any) ?? undefined,
    })

    const debouncedSave = useDebouncedCallback(async (content: unknown) => {
      await onSave(content)
    }, 1500)

    useEffect(() => {
      editor.onChange(() => {
        const content = editor.document
        debouncedSave(content)
      })
    }, [editor, debouncedSave])

    useImperativeHandle(ref, () => ({
      undo: () => editor.undo(),
      redo: () => editor.redo(),
      canUndo: () => editor.canUndo(),
      canRedo: () => editor.canRedo(),
    }))

    return (
      <div className="mx-auto w-full max-w-[720px] flex-1">
        <BlockNoteView
          editor={editor}
          theme="dark"
          data-theming-css-variables-demo
        />
      </div>
    )
  }
)

NoteEditor.displayName = "NoteEditor"
