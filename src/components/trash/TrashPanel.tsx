"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TrashEmptyState } from "@/components/trash/TrashEmptyState";
import { TrashItem } from "@/components/trash/TrashItem";
import { TrashItemSkeleton } from "@/components/trash/TrashItemSkeleton";
import { useTrash } from "@/hooks/useTrash";
import type { TrashedItem } from "@/types/trash";

interface TrashPanelProps {
	open: boolean;
	workspaceId: string;
	onClose: () => void;
}

export function TrashPanel({ open, workspaceId, onClose }: TrashPanelProps) {
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [deleteConfirmItem, setDeleteConfirmItem] = useState<TrashedItem | null>(null);
	const { items, sentinelRef, restoreItem, permanentlyDeleteItem, emptyTrash, isInitialLoading, isFetchingNextPage, hasNextPage, isItemPending, isEmptying } = useTrash(open, workspaceId);
	const deleteConfirmTypeLabel = deleteConfirmItem?.type === "folder" ? "folder" : "note";
	const deleteConfirmTitle = deleteConfirmItem ? `Delete ${deleteConfirmTypeLabel} permanently?` : "Delete permanently?";
	const deleteConfirmDescription = deleteConfirmItem
		? `Are you sure you want to permanently delete "${deleteConfirmItem.name}" from the trash? This action cannot be undone.`
		: "Are you sure you want to permanently delete this item from the trash? This action cannot be undone.";

	return (
		<>
			<div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--bg-sidebar)]">
				<div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-6" style={{ borderColor: "var(--border-default)" }}>
					<h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
						Trash
					</h1>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={onClose}
								className="flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-[#1a1a1a]"
								style={{ color: "var(--text-secondary)" }}
								aria-label="Close">
								<X className="h-4 w-4" />
								Close
							</button>
						</TooltipTrigger>
						<TooltipContent>Close</TooltipContent>
					</Tooltip>
				</div>

				<div className="px-4 pt-6 pb-4">
					<div className="flex items-center gap-2">
						<Trash2 className="h-5 w-5" style={{ color: "var(--sn-accent)" }} />
						<p className="text-base font-medium" style={{ color: "var(--text-primary)" }}>
							Deleted items
						</p>
					</div>
				</div>

				<div className="relative flex-1 min-h-0">
					<div className="h-full overflow-y-auto px-4 py-4 pb-24">
						{isInitialLoading ? (
							<div className="space-y-3">
								{Array.from({ length: 5 }).map((_, index) => (
									<TrashItemSkeleton key={index} />
								))}
							</div>
						) : items.length === 0 ? (
							<TrashEmptyState />
						) : (
							<div role="list" className="space-y-3">
								{items.map((item) => (
									<TrashItem
										key={item.id}
										item={item}
										disabled={isItemPending(item.id)}
										onRestore={() => {
											void restoreItem(item);
										}}
										onDelete={() => {
											setDeleteConfirmItem(item);
										}}
									/>
								))}

								{isFetchingNextPage ? (
									<div className="space-y-3 pt-1">
										{Array.from({ length: 3 }).map((_, index) => (
											<TrashItemSkeleton key={`next-${index}`} />
										))}
									</div>
								) : null}

								<div ref={sentinelRef} aria-hidden="true" className="h-1" />

								{!hasNextPage ? <p className="py-2 text-center text-xs text-[var(--text-tertiary)]">No more items</p> : null}
							</div>
						)}
					</div>

					<div
						className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-4 pt-8"
						style={{ background: "linear-gradient(to top, var(--bg-sidebar) 40%, transparent 100%)" }}>
						<Button
							type="button"
							variant="destructive"
							onClick={() => setConfirmOpen(true)}
							disabled={items.length === 0 || isEmptying}
							className="pointer-events-auto h-10 w-full rounded-xl bg-rose-500/10 px-3 text-sm font-medium text-rose-300 hover:bg-rose-500/20 focus-visible:ring-[#7c6aff]">
							Empty Trash
						</Button>
					</div>
				</div>
			</div>

			<AlertDialog
				open={deleteConfirmItem !== null}
				onOpenChange={(nextOpen) => {
					if (!nextOpen) {
						setDeleteConfirmItem(null);
					}
				}}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{deleteConfirmTitle}</AlertDialogTitle>
						<AlertDialogDescription>{deleteConfirmDescription}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel onClick={() => setDeleteConfirmItem(null)}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (!deleteConfirmItem) {
									return;
								}

								const item = deleteConfirmItem;
								setDeleteConfirmItem(null);
								void permanentlyDeleteItem(item);
							}}>
							Delete permanently
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Empty trash?</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently deletes every item currently in your trash. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								void emptyTrash();
							}}>
							Empty Trash
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
