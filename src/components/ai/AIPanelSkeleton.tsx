"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function AIPanelSkeleton() {
	return (
		<div className="flex h-full w-full min-w-0 flex-col overflow-hidden border-l border-neutral-900 bg-black">
			<div className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-900 px-3">
				<div className="flex items-center gap-2">
					<Skeleton className="h-5 w-5 rounded-full" />
					<Skeleton className="h-4 w-16 rounded-[6px]" />
				</div>
				<Skeleton className="h-7 w-7 rounded-[6px]" />
			</div>

			<div className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-900 px-3 py-2">
				<Skeleton className="h-8 w-32 rounded-[10px]" />
				<Skeleton className="h-6 w-20 rounded-full" />
			</div>

			<div className="shrink-0 border-b border-neutral-900 px-3 py-3">
				<div className="flex items-center justify-between gap-3">
					<div className="min-w-0 flex-1 space-y-2">
						<Skeleton className="h-3 w-24 rounded-[6px]" />
						<Skeleton className="h-3 w-40 rounded-[6px]" />
					</div>
					<div className="flex items-center gap-1">
						<Skeleton className="h-7 w-14 rounded-[6px]" />
						<Skeleton className="h-7 w-12 rounded-[6px]" />
					</div>
				</div>
			</div>

			<div className="shrink-0 border-b border-neutral-900 px-3 py-3">
				<div className="mb-3 flex items-center justify-between gap-3">
					<div className="min-w-0 flex-1 space-y-2">
						<Skeleton className="h-3 w-20 rounded-[6px]" />
						<Skeleton className="h-3 w-32 rounded-[6px]" />
					</div>
					<Skeleton className="h-7 w-14 rounded-[6px]" />
				</div>
				<div className="flex gap-2">
					<Skeleton className="h-7 w-16 rounded-[6px]" />
					<Skeleton className="h-7 w-12 rounded-[6px]" />
					<Skeleton className="h-7 w-14 rounded-[6px]" />
				</div>
			</div>

			<div className="flex-1 space-y-4 overflow-hidden p-3">
				<div className="flex gap-3">
					<Skeleton className="mt-1 h-7 w-7 shrink-0 rounded-full" />
					<div className="flex-1 space-y-2">
						<Skeleton className="h-3 w-24 rounded-[6px]" />
						<Skeleton className="h-3 w-full rounded-[6px]" />
						<Skeleton className="h-3 w-4/5 rounded-[6px]" />
						<Skeleton className="h-3 w-2/3 rounded-[6px]" />
					</div>
				</div>

				<div className="flex justify-end">
					<div className="w-[78%] space-y-2 rounded-[14px] border border-neutral-900 bg-black px-3 py-3">
						<Skeleton className="h-3 w-20 rounded-[6px]" />
						<Skeleton className="h-3 w-full rounded-[6px]" />
						<Skeleton className="h-3 w-3/4 rounded-[6px]" />
					</div>
				</div>

				<div className="flex gap-3">
					<Skeleton className="mt-1 h-7 w-7 shrink-0 rounded-full" />
					<div className="flex-1 space-y-2">
						<Skeleton className="h-3 w-16 rounded-[6px]" />
						<Skeleton className="h-3 w-11/12 rounded-[6px]" />
						<Skeleton className="h-3 w-3/5 rounded-[6px]" />
					</div>
				</div>
			</div>

			<div className="shrink-0 border-t border-neutral-900 p-3">
				<div className="mb-2 flex items-center justify-between gap-2">
					<Skeleton className="h-7 w-24 rounded-[6px]" />
					<Skeleton className="h-3 w-28 rounded-[6px]" />
				</div>
				<div className="flex gap-2">
					<Skeleton className="h-[38px] flex-1 rounded-[10px]" />
					<Skeleton className="h-[38px] w-[38px] shrink-0 rounded-[10px]" />
				</div>
			</div>
		</div>
	);
}
