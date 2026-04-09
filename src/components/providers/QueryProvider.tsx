"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

const QUERY_PERSIST_KEY = "stacknote:query-cache";

function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 15_000,
				gcTime: 5 * 60_000,
				refetchOnWindowFocus: false,
				retry: 1,
			},
		},
	});
}

function shouldPersistQuery(queryKey: readonly unknown[]) {
	return (Array.isArray(queryKey) && queryKey[0] === "settings") || (Array.isArray(queryKey) && queryKey[0] === "workspace" && queryKey[1] === "tree");
}

export function QueryProvider({ children }: { children: ReactNode }) {
	const [queryClient] = useState(createQueryClient);
	const [persister] = useState(() => {
		if (typeof window === "undefined") {
			return null;
		}

		return createSyncStoragePersister({
			key: QUERY_PERSIST_KEY,
			storage: window.localStorage,
		});
	});

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
