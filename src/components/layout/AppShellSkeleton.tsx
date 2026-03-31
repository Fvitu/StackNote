import type { CSSProperties } from "react";
import { FileText, PanelLeftOpen } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function getInitials(userName?: string | null, userEmail?: string | null) {
	const source = userName?.trim() || userEmail?.trim() || "WU";
	return source
		.split(/\s+/)
		.map((chunk) => chunk[0] ?? "")
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

function SkeletonLine({ width, height = 12, rounded = 8 }: { width: string; height?: number; rounded?: number }) {
	return <Skeleton className="shrink-0" style={{ width, height, borderRadius: rounded } as CSSProperties} />;
}

export function SidebarTreeSkeleton() {
	return (
		<div className="flex-1 space-y-2 px-3 py-2">
			<div className="flex items-center gap-2">
				<Skeleton className="h-4 w-4 rounded-[6px]" />
				<SkeletonLine width="60%" height={14} rounded={8} />
			</div>
			<div className="flex items-center gap-2">
				<Skeleton className="h-4 w-4 rounded-[6px]" />
				<SkeletonLine width="80%" height={14} rounded={8} />
			</div>
			<div className="flex items-center gap-2">
				<Skeleton className="h-4 w-4 rounded-[6px]" />
				<SkeletonLine width="45%" height={14} rounded={8} />
			</div>
			<div className="flex items-center gap-2">
				<Skeleton className="h-4 w-4 rounded-[6px]" />
				<SkeletonLine width="70%" height={14} rounded={8} />
			</div>
			<div className="flex items-center gap-2">
				<Skeleton className="h-4 w-4 rounded-[6px]" />
				<SkeletonLine width="55%" height={14} rounded={8} />
			</div>
			<div className="flex items-center gap-2">
				<Skeleton className="h-4 w-4 rounded-[6px]" />
				<SkeletonLine width="74%" height={14} rounded={8} />
			</div>
		</div>
	);
}

export function EmojiPickerSkeleton() {
	return (
		<div className="p-2">
			<div className="grid h-[320px] grid-cols-8 gap-2 rounded-[var(--sn-radius-lg)] bg-black/40 p-2">
				{Array.from({ length: 40 }).map((_, index) => (
					<Skeleton key={index} className="aspect-square rounded-[6px]" />
				))}
			</div>
		</div>
	);
}

export function EditorSkeleton({ title }: { title?: string | null }) {
	return (
		<div className="flex flex-1 overflow-hidden" style={{ backgroundColor: "var(--bg-app)" }}>
			<div className="flex flex-1 flex-col overflow-hidden">
				<div className="flex h-9 shrink-0 items-center justify-between px-4" style={{ borderBottom: "1px solid var(--border-default)" }}>
					<div className="flex items-center gap-2">
						<button className="flex h-6 w-6 items-center justify-center rounded-[var(--sn-radius-sm)]" type="button" aria-hidden="true">
							<PanelLeftOpen className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
						</button>
						<div className="flex items-center gap-2">
							<SkeletonLine width="120px" height={10} rounded={999} />
							<SkeletonLine width="96px" height={10} rounded={999} />
						</div>
					</div>
					<div className="flex items-center gap-2">
						<SkeletonLine width="56px" height={20} rounded={999} />
						<Skeleton className="h-6 w-6 rounded-[8px]" />
						<Skeleton className="h-6 w-6 rounded-[8px]" />
						<SkeletonLine width="44px" height={24} rounded={8} />
					</div>
				</div>

				<div className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col gap-6 px-6 py-8">
					<div className="flex items-start gap-3">
						<Skeleton className="h-10 w-10 rounded-[14px]" />
						<div className="flex-1 space-y-3">
							{title ? (
								<div className="text-4xl font-semibold" style={{ color: "var(--text-primary)" }}>
									{title}
								</div>
							) : (
								<SkeletonLine width="40%" height={34} rounded={12} />
							)}
							<div className="flex gap-3">
								<SkeletonLine width="140px" height={12} rounded={999} />
								<SkeletonLine width="156px" height={12} rounded={999} />
							</div>
						</div>
					</div>

					<div className="mx-auto flex min-h-[70vh] w-full max-w-[720px] flex-col gap-4">
						<SkeletonLine width="100%" height={22} rounded={12} />
						<SkeletonLine width="80%" height={16} rounded={10} />
						<SkeletonLine width="60%" height={16} rounded={10} />
						<SkeletonLine width="75%" height={16} rounded={10} />
						<SkeletonLine width="92%" height={16} rounded={10} />
						<SkeletonLine width="70%" height={16} rounded={10} />
					</div>
				</div>
			</div>
		</div>
	);
}

export function AppShellSkeleton({
	workspaceName,
	userName,
	userEmail,
}: {
	workspaceName?: string | null;
	userName?: string | null;
	userEmail?: string | null;
}) {
	const initials = getInitials(userName, userEmail);
	const resolvedWorkspaceName = workspaceName ?? "Workspace";
	const resolvedUserName = userName?.trim() || (userEmail?.trim() ? userEmail : "Workspace user");

	return (
		<div className="relative flex h-screen overflow-hidden" style={{ backgroundColor: "#000000" }}>
			<div
				className="hidden md:flex md:h-full md:w-[240px] md:flex-col"
				style={{ backgroundColor: "var(--bg-sidebar)", borderRight: "1px solid var(--border-default)" }}>
				<div className="flex h-12 items-center gap-2 px-3" style={{ borderBottom: "1px solid var(--border-default)" }}>
					<div
						className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-semibold"
						style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }}>
						{resolvedWorkspaceName.slice(0, 2).toUpperCase()}
					</div>
					<div className="min-w-0 flex-1">
						<div className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
							{resolvedWorkspaceName}
						</div>
						<div className="truncate text-[11px]" style={{ color: "var(--text-tertiary)" }}>
							{resolvedUserName}
						</div>
					</div>
					<div
						className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
						style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }}>
						{initials}
					</div>
				</div>
				<div className="space-y-2 p-3">
					<SkeletonLine width="100%" height={32} rounded={10} />
					<SkeletonLine width="100%" height={32} rounded={10} />
				</div>
				<SidebarTreeSkeleton />
			</div>

			<div className="flex flex-1 flex-col overflow-hidden" style={{ backgroundColor: "var(--bg-app)" }}>
				<div className="flex h-9 items-center justify-between px-4" style={{ borderBottom: "1px solid var(--border-default)" }}>
					<div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
						<PanelLeftOpen className="h-4 w-4" />
						<span>{resolvedWorkspaceName}</span>
					</div>
					<div className="flex items-center gap-2">
						<SkeletonLine width="54px" height={20} rounded={999} />
						<Skeleton className="h-6 w-6 rounded-[8px]" />
						<Skeleton className="h-6 w-6 rounded-[8px]" />
					</div>
				</div>

				<div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 fade-in">
					<div className="flex h-16 w-16 items-center justify-center rounded-2xl smooth-bg" style={{ backgroundColor: "var(--bg-surface)" }}>
						<FileText className="h-8 w-8" style={{ color: "var(--text-tertiary)" }} />
					</div>
					<div className="max-w-[32rem] text-center">
						<h1
							className="text-[clamp(1.875rem,4vw,2.75rem)] font-semibold leading-tight tracking-[-0.02em]"
							style={{ color: "var(--text-primary)" }}>
							{resolvedWorkspaceName}
						</h1>
						<p className="text-sm" style={{ color: "var(--text-secondary)" }}>
							Select a note or create a new one
						</p>
					</div>
					<div
						className="flex items-center gap-2 rounded-[var(--sn-radius-md)] px-4 py-2 text-sm"
						style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-secondary)" }}>
						<FileText className="h-4 w-4" />
						Create your first note
					</div>
				</div>
			</div>
		</div>
	);
}
