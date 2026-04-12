"use client";

import { differenceInCalendarDays } from "date-fns";
import { FileText, Folder, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TrashedItem } from "@/types/trash";

interface TrashItemProps {
	item: TrashedItem;
	disabled?: boolean;
	onRestore: () => void;
	onDelete: () => void;
}

function formatDeletedLabel(deletedAt: string) {
	const deletedDate = new Date(deletedAt);
	const deletedDays = differenceInCalendarDays(new Date(), deletedDate);

	if (deletedDays <= 0) {
		return "Deleted today";
	}

	return `Deleted ${deletedDays} day${deletedDays === 1 ? "" : "s"} ago`;
}

function formatExpiryLabel(expiresAt: string) {
	const expiryDays = differenceInCalendarDays(new Date(expiresAt), new Date());

	if (expiryDays <= 0) {
		return "Expires today";
	}

	return `Expires in ${expiryDays} day${expiryDays === 1 ? "" : "s"}`;
}

export function TrashItem({ item, disabled = false, onRestore, onDelete }: TrashItemProps) {
	const expiryDays = differenceInCalendarDays(new Date(item.expiresAt), new Date());
	const showExpiryWarning = expiryDays <= 3;

	return (
		<div
			role="listitem"
			className="group flex items-center gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 transition-colors hover:bg-[#151515]"
			onClick={() => {
				toast("Restore this item first to open it");
			}}
		>
			<div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border-default)] bg-[#121212]">
				{item.type === "folder" ? (
					<Folder className="h-4 w-4 text-[var(--text-secondary)]" />
				) : item.coverImage ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img src={item.coverImage} alt="" className="h-full w-full object-cover" />
				) : item.emoji ? (
					<span className="text-base">{item.emoji}</span>
				) : (
					<FileText className="h-4 w-4 text-[var(--text-secondary)]" />
				)}
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex min-w-0 items-center gap-2">
					<p className="truncate text-sm font-medium text-[var(--text-primary)]">{item.name}</p>
					{showExpiryWarning ? (
						<span className="shrink-0 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300">
							{formatExpiryLabel(item.expiresAt)}
						</span>
					) : null}
				</div>

				<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
					<span>{formatDeletedLabel(item.deletedAt)}</span>
					{item.type === "folder" ? (
						<span className="text-[var(--text-tertiary)]">{item.childCount ?? 0} item{item.childCount === 1 ? "" : "s"} inside</span>
					) : null}
				</div>
			</div>

			<div className="flex items-center gap-2">
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							disabled={disabled}
							onClick={(event) => {
								event.stopPropagation();
								onRestore();
							}}
							aria-label="Restore"
							className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[#121212] text-[var(--text-secondary)] transition-colors hover:bg-[#1a1a1a] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6aff] disabled:cursor-not-allowed disabled:opacity-50">
							<RotateCcw className="h-4 w-4" />
						</button>
					</TooltipTrigger>
					<TooltipContent className="bg-[#0f0f0f] text-[#e8e8e8]">Restore</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							disabled={disabled}
							onClick={(event) => {
								event.stopPropagation();
								onDelete();
							}}
							aria-label="Delete permanently"
							className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-300 transition-colors hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6aff] disabled:cursor-not-allowed disabled:opacity-50">
							<Trash2 className="h-4 w-4" />
						</button>
					</TooltipTrigger>
					<TooltipContent className="bg-[#0f0f0f] text-[#e8e8e8]">Delete permanently</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
