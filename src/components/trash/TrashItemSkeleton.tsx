export function TrashItemSkeleton() {
	return (
		<div
			aria-hidden="true"
			className="flex items-center gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3"
		>
			<div className="h-10 w-10 animate-pulse rounded-xl bg-[#1a1a1a]" />
			<div className="min-w-0 flex-1 space-y-2">
				<div className="h-4 w-40 animate-pulse rounded bg-[#1a1a1a]" />
				<div className="h-3 w-32 animate-pulse rounded bg-[#1a1a1a]" />
			</div>
			<div className="flex items-center gap-2">
				<div className="h-8 w-8 animate-pulse rounded-lg bg-[#1a1a1a]" />
				<div className="h-8 w-8 animate-pulse rounded-lg bg-[#1a1a1a]" />
			</div>
		</div>
	);
}
