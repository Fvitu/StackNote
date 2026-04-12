"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { syncEngine } from "@/lib/db/syncEngine";
import type { SyncQueueRecord } from "@/lib/db/local";

type SyncEngineContextValue = {
	isSyncing: boolean;
	hasFailedEntries: boolean;
	failedEntries: SyncQueueRecord[];
	refreshFailedEntries: () => Promise<void>;
};

const SyncEngineContext = createContext<SyncEngineContextValue | null>(null);

export function SyncEngineProvider({ children }: { children: ReactNode }) {
	const [isSyncing, setIsSyncing] = useState(syncEngine.isSyncing);
	const [failedEntries, setFailedEntries] = useState<SyncQueueRecord[]>([]);

	useEffect(() => {
		syncEngine.start();
		const unsubscribe = syncEngine.subscribe(() => {
			setIsSyncing(syncEngine.isSyncing);
			void syncEngine.getFailedEntries().then(setFailedEntries);
		});
		void syncEngine.getFailedEntries().then(setFailedEntries);

		return () => {
			unsubscribe();
			syncEngine.stop();
		};
	}, []);

	const value = useMemo<SyncEngineContextValue>(
		() => ({
			isSyncing,
			hasFailedEntries: failedEntries.length > 0,
			failedEntries,
			refreshFailedEntries: async () => {
				const entries = await syncEngine.getFailedEntries();
				setFailedEntries(entries);
			},
		}),
		[failedEntries, isSyncing],
	);

	return <SyncEngineContext.Provider value={value}>{children}</SyncEngineContext.Provider>;
}

export function useSyncEngine() {
	const context = useContext(SyncEngineContext);
	if (!context) {
		throw new Error("useSyncEngine must be used within SyncEngineProvider");
	}

	return context;
}
