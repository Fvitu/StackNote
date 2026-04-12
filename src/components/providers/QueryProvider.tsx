"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { localNotes } from "@/lib/db/local";
import { createStackNoteQueryClient } from "@/lib/queryClient";
import { queryKeys } from "@/lib/query-keys";
import type { NoteData } from "@/lib/note-client";

const QUERY_PERSIST_KEY = "stacknote:query-cache";

function shouldPersistQuery(queryKey: readonly unknown[]) {
	return (Array.isArray(queryKey) && queryKey[0] === "settings") || (Array.isArray(queryKey) && queryKey[0] === "workspace" && queryKey[1] === "tree");
}

function toNoteData(note: Awaited<ReturnType<typeof localNotes.getAll>>[number]): NoteData {
	return {
		id: note.id,
		title: note.title,
		emoji: note.emoji ?? null,
		coverImage: note.coverImage ?? null,
		coverImageMeta: note.coverImageMeta,
		content: note.content,
		createdAt: note.createdAt,
		updatedAt: note.updatedAt,
		editorWidth: note.editorWidth ?? null,
		folderId: note.folderId ?? null,
		workspace: { name: "Workspace" },
		folder: null,
		folderPath: [],
	};
}

export function QueryProvider({ children }: { children: ReactNode }) {
	const [queryClient] = useState<QueryClient>(() => createStackNoteQueryClient());
	const [persister] = useState(() => {
		if (typeof window === "undefined") {
			return null;
		}

		return createSyncStoragePersister({
			key: QUERY_PERSIST_KEY,
			storage: window.localStorage,
		});
	});

	useEffect(() => {
		let cancelled = false;

		void localNotes.getAll().then((notes) => {
			if (cancelled) {
				return;
			}

			for (const note of notes) {
				queryClient.setQueryData(queryKeys.note(note.id), toNoteData(note));
			}
		});

		return () => {
			cancelled = true;
		};
	}, [queryClient]);

	if (!persister) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	}

	return (
		<PersistQueryClientProvider
			client={queryClient}
			persistOptions={{
				persister,
				maxAge: 1000 * 60 * 60 * 12,
				dehydrateOptions: {
					shouldDehydrateQuery: (query) => shouldPersistQuery(query.queryKey),
				},
			}}>
			{children}
		</PersistQueryClientProvider>
	);
}
