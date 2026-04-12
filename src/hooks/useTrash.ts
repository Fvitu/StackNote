"use client";

import { useEffect, useRef, useState } from "react";
import { type InfiniteData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchJson } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { TrashedItem, TrashListResponse, TrashMutationResponse } from "@/types/trash";

const TRASH_PAGE_SIZE = 20;
const TRASH_EMPTIED_TOAST = "Trash emptied";

function removeItemFromPages(data: InfiniteData<TrashListResponse, string | undefined> | undefined, itemId: string) {
	if (!data) {
		return data;
	}

	return {
		...data,
		pages: data.pages.map((page) => ({
			...page,
			items: page.items.filter((item) => item.id !== itemId),
		})),
	};
}

function clearPages(data: InfiniteData<TrashListResponse, string | undefined> | undefined): InfiniteData<TrashListResponse, string | undefined> | undefined {
	if (!data || data.pages.length === 0) {
		return data;
	}

	return {
		...data,
		pages: data.pages.map((page, index) => (index === 0 ? { items: [], nextCursor: null } : { ...page, items: [], nextCursor: null })),
	};
}

export function useTrash(open: boolean, workspaceId: string) {
	const queryClient = useQueryClient();
	const sentinelRef = useRef<HTMLDivElement | null>(null);
	const [pendingItemIds, setPendingItemIds] = useState<string[]>([]);
	const [isEmptying, setIsEmptying] = useState(false);

	const trashQuery = useInfiniteQuery({
		queryKey: queryKeys.trashList,
		initialPageParam: undefined as string | undefined,
		enabled: open,
		staleTime: 15_000,
		queryFn: ({ pageParam }) => {
			const params = new URLSearchParams({ limit: String(TRASH_PAGE_SIZE) });
			if (pageParam) {
				params.set("cursor", pageParam);
			}

			return fetchJson<TrashListResponse>(`/api/trash?${params.toString()}`);
		},
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
	});

	const items = trashQuery.data?.pages.flatMap((page) => page.items) ?? [];

	useEffect(() => {
		if (!open || !sentinelRef.current || !trashQuery.hasNextPage || trashQuery.isFetchingNextPage) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (entry?.isIntersecting && trashQuery.hasNextPage && !trashQuery.isFetchingNextPage) {
					void trashQuery.fetchNextPage();
				}
			},
			{
				rootMargin: "0px 0px 240px 0px",
			},
		);

		observer.observe(sentinelRef.current);

		return () => {
			observer.disconnect();
		};
	}, [open, trashQuery]);

	async function refreshTrashQueries() {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: queryKeys.trashList }),
			queryClient.invalidateQueries({ queryKey: queryKeys.trashStatus }),
			queryClient.invalidateQueries({ queryKey: queryKeys.workspaceTree(workspaceId) }),
		]);
	}

	async function restoreItem(item: TrashedItem) {
		const previous = queryClient.getQueryData<InfiniteData<TrashListResponse, string | undefined>>(queryKeys.trashList);
		setPendingItemIds((current) => [...current, item.id]);
		queryClient.setQueryData<InfiniteData<TrashListResponse, string | undefined>>(queryKeys.trashList, (current) => removeItemFromPages(current, item.id));

		try {
			await fetchJson<TrashMutationResponse>("/api/trash/restore", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id: item.id, type: item.type }),
			});
			if (item.type === "folder") {
				toast.success("Folder restored", {
					description: `${item.childCount ?? 0} item${item.childCount === 1 ? "" : "s"} restored`,
				});
			} else {
				toast.success("Note restored");
			}
			await refreshTrashQueries();
		} catch (error) {
			queryClient.setQueryData(queryKeys.trashList, previous);
			console.error("Failed to restore trash item:", error);
			toast.error("Something went wrong. Please try again.");
		} finally {
			setPendingItemIds((current) => current.filter((pendingId) => pendingId !== item.id));
		}
	}

	async function permanentlyDeleteItem(item: TrashedItem) {
		const previous = queryClient.getQueryData<InfiniteData<TrashListResponse, string | undefined>>(queryKeys.trashList);
		setPendingItemIds((current) => [...current, item.id]);
		queryClient.setQueryData<InfiniteData<TrashListResponse, string | undefined>>(queryKeys.trashList, (current) => removeItemFromPages(current, item.id));

		try {
			await fetchJson<TrashMutationResponse>("/api/trash/delete", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id: item.id, type: item.type }),
			});
			toast.success(TRASH_EMPTIED_TOAST);
			await refreshTrashQueries();
		} catch (error) {
			queryClient.setQueryData(queryKeys.trashList, previous);
			console.error("Failed to permanently delete trash item:", error);
			toast.error("Something went wrong. Please try again.");
		} finally {
			setPendingItemIds((current) => current.filter((pendingId) => pendingId !== item.id));
		}
	}

	async function emptyTrash() {
		const previous = queryClient.getQueryData<InfiniteData<TrashListResponse, string | undefined>>(queryKeys.trashList);
		setIsEmptying(true);
		queryClient.setQueryData<InfiniteData<TrashListResponse, string | undefined>>(queryKeys.trashList, (current) => clearPages(current));

		try {
			await fetchJson<TrashMutationResponse>("/api/trash/empty", {
				method: "DELETE",
			});
			toast.success(TRASH_EMPTIED_TOAST);
			await refreshTrashQueries();
		} catch (error) {
			queryClient.setQueryData(queryKeys.trashList, previous);
			console.error("Failed to empty trash:", error);
			toast.error("Something went wrong. Please try again.");
		} finally {
			setIsEmptying(false);
		}
	}

	return {
		items,
		sentinelRef,
		restoreItem,
		permanentlyDeleteItem,
		emptyTrash,
		isInitialLoading: trashQuery.isPending,
		isFetchingNextPage: trashQuery.isFetchingNextPage,
		hasNextPage: trashQuery.hasNextPage,
		isError: trashQuery.isError,
		isRefreshing: trashQuery.isRefetching,
		isEmptying,
		isItemPending: (itemId: string) => pendingItemIds.includes(itemId) || isEmptying,
	};
}
