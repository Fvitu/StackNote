"use client";

import { forwardRef, useEffect, useState } from "react";
import type { NoteEditorRef } from "@/components/editor/NoteEditor";
import { EditorSkeleton } from "@/components/layout/AppShellSkeleton";
import type { NoteData } from "@/lib/note-client";

type NoteEditorComponent = typeof import("@/components/editor/NoteEditor").NoteEditor;

interface LazyNoteEditorProps {
	workspaceId: string;
	noteId: string;
	initialContent: NoteData["content"];
	onContentChange: (noteId: string, content: unknown) => void;
	onSave: (noteId: string, content: unknown, changedBlockIds: string[]) => Promise<void>;
}

export const LazyNoteEditor = forwardRef<NoteEditorRef, LazyNoteEditorProps>(function LazyNoteEditor(props, ref) {
	const [Component, setComponent] = useState<NoteEditorComponent | null>(null);

	useEffect(() => {
		let cancelled = false;

		void import("@/components/editor/NoteEditor").then((module) => {
			if (!cancelled) {
				setComponent(() => module.NoteEditor);
			}
		});

		return () => {
			cancelled = true;
		};
	}, []);

	if (!Component) {
		return <EditorSkeleton />;
	}

	return <Component {...props} ref={ref} />;
});
