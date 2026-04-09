"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

import { useOfflineSync } from "@/hooks/useOfflineSync";
import { readErrorMessage } from "@/lib/http";

export interface QuickNotePayload {
	id: string;
	content: unknown;
	updatedAt: string;
}

function readStoredQuickNote(key: string) {
	if (typeof window === "undefined") {
		return null;
	}

	const raw = window.localStorage.getItem(key);
	if (!raw) {
		return null;
	}

	try {
		return JSON.parse(raw) as Pick<QuickNotePayload, "content" | "updatedAt">;
	} catch {
		return null;
	}
}

function writeStoredQuickNote(key: string, content: unknown, updatedAt: string) {
	if (typeof window === "undefined") {
		return;
	}

	window.localStorage.setItem(
		key,
		JSON.stringify({
			content,
			updatedAt,
		}),
	);
}

async function fetchQuickNoteFromApi() {
	const response = await fetch("/api/quick-note", { cache: "no-store" });
	if (!response.ok) {
		throw new Error(await readErrorMessage(response, "Failed to load quick note"));
	}

	return (await response.json()) as QuickNotePayload;
}

async function syncQuickNoteToApi(content: unknown) {
	const response = await fetch("/api/quick-note", {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ content }),
	});

	if (!response.ok) {
		throw new Error(await readErrorMessage(response, "Failed to save quick note"));
	}

	return (await response.json()) as QuickNotePayload;
}

export function useQuickNote(userId: string) {
	const storageKey = useMemo(() => `stacknote_quick_note_${userId}`, [userId]);
	const { isOnline, isOffline } = useOfflineSync();
	const storedValue = useMemo(() => readStoredQuickNote(storageKey), [storageKey]);
	const [content, setContent] = useState<unknown>(storedValue?.content ?? undefined);
	const [updatedAt, setUpdatedAt] = useState<string | null>(storedValue?.updatedAt ?? null);
	const [isSyncing, setIsSyncing] = useState(false);
	const [isLoaded, setIsLoaded] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const pendingContentRef = useRef<unknown | null>(null);

	const commitServerState = useCallback(
		(payload: QuickNotePayload) => {
			writeStoredQuickNote(storageKey, payload.content, payload.updatedAt);
			setContent(payload.content);
			setUpdatedAt(payload.updatedAt);
			pendingContentRef.current = null;
			setError(null);
		},
		[storageKey],
	);

	const pushPendingChanges = useCallback(async () => {
		if (!isOnline || pendingContentRef.current === null) {
			return;
		}

		setIsSyncing(true);
		try {
			const payload = await syncQuickNoteToApi(pendingContentRef.current);
			commitServerState(payload);
		} catch (syncError) {
			setError(syncError instanceof Error ? syncError.message : "Failed to sync quick note");
		} finally {
			setIsSyncing(false);
		}
	}, [commitServerState, isOnline]);

	const debouncedSync = useDebouncedCallback(() => {
		void pushPendingChanges();
	}, 500);

	const updateContent = useCallback(
		(nextContent: unknown) => {
			const nextUpdatedAt = new Date().toISOString();
			setContent(nextContent);
			setUpdatedAt(nextUpdatedAt);
			writeStoredQuickNote(storageKey, nextContent, nextUpdatedAt);
			pendingContentRef.current = nextContent;
			setError(null);
			debouncedSync();
		},
		[debouncedSync, storageKey],
	);

	const clear = useCallback(() => {
		updateContent([]);
	}, [updateContent]);

	useEffect(() => {
		let isCancelled = false;

		async function hydrate() {
			setIsLoaded(false);
			if (!isOnline) {
				setIsLoaded(true);
				return;
			}

			try {
				const serverValue = await fetchQuickNoteFromApi();
				if (isCancelled) {
					return;
				}

				const localValue = readStoredQuickNote(storageKey);
				const localTimestamp = localValue?.updatedAt ? Date.parse(localValue.updatedAt) : 0;
				const serverTimestamp = Date.parse(serverValue.updatedAt);

				if (localValue && localTimestamp > serverTimestamp) {
					pendingContentRef.current = localValue.content;
					setContent(localValue.content);
					setUpdatedAt(localValue.updatedAt);
					await pushPendingChanges();
				} else {
					commitServerState(serverValue);
				}
			} catch (loadError) {
				if (!isCancelled) {
					setError(loadError instanceof Error ? loadError.message : "Failed to load quick note");
				}
			} finally {
				if (!isCancelled) {
					setIsLoaded(true);
				}
			}
		}

		void hydrate();

		return () => {
			isCancelled = true;
		};
	}, [commitServerState, isOnline, pushPendingChanges, storageKey]);

	useEffect(() => {
		if (isOnline && pendingContentRef.current !== null) {
			void pushPendingChanges();
		}
	}, [isOnline, pushPendingChanges]);

	return {
		content,
		updatedAt,
		isLoaded,
		isSyncing,
		isOffline,
		error,
		setContent: updateContent,
		clear,
	};
}
