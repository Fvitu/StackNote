"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Circle, WifiOff, X } from "lucide-react";
import { useSyncEngine } from "@/contexts/SyncEngineContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

function SyncFailedModal({ open, onClose }: { open: boolean; onClose: () => void }) {
	const { failedEntries } = useSyncEngine();
	if (!open) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-[190] flex items-end justify-center bg-black/60 p-4 sm:items-center">
			<div className="w-full max-w-xl rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-4 text-[#e6e6e6] shadow-2xl">
				<div className="mb-3 flex items-center justify-between">
					<h3 className="text-sm font-semibold">Failed sync operations</h3>
					<button type="button" onClick={onClose} className="rounded p-1 hover:bg-[#1a1a1a]" aria-label="Close sync failures">
						<X className="h-4 w-4" />
					</button>
				</div>
				<div className="max-h-64 space-y-2 overflow-auto pr-1">
					{failedEntries.map((entry) => (
						<div key={`${entry.id}-${entry.pk}`} className="rounded-lg border border-[#252525] bg-[#121212] p-3 text-xs">
							<p className="font-medium text-[#f5f5f5]">
								{entry.operation} {entry.entity}
							</p>
							<p className="mt-1 text-[#b8b8b8]">Target: {entry.entityId}</p>
							<p className="text-[#9a9a9a]">Retries: {entry.retries}</p>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

export function SyncStatusBar() {
	const { isOnline } = useOnlineStatus();
	const { isSyncing, hasFailedEntries } = useSyncEngine();
	const [isModalOpen, setIsModalOpen] = useState(false);

	const barState = useMemo(() => {
		if (!isOnline) {
			return "offline" as const;
		}
		if (hasFailedEntries) {
			return "error" as const;
		}
		if (isSyncing) {
			return "syncing" as const;
		}
		return "hidden" as const;
	}, [hasFailedEntries, isOnline, isSyncing]);

	if (barState === "hidden") {
		return null;
	}

	return (
		<>
			<div className="pointer-events-none fixed inset-x-0 bottom-4 z-[150] flex justify-center px-4">
				<div
					className="pointer-events-none flex w-full max-w-3xl items-center gap-2 rounded-lg border-l-4 bg-[#0f0f0f]/95 px-4 py-2 text-sm text-[#d8d8d8] shadow-lg"
					style={{
						borderLeftColor: barState === "offline" ? "#f59e0b" : barState === "error" ? "#ef4444" : "#7c6aff",
					}}>
					{barState === "offline" ? <WifiOff className="h-4 w-4 text-[#f59e0b]" /> : null}
					{barState === "syncing" ? <Circle className="h-3 w-3 animate-pulse fill-[#7c6aff] text-[#7c6aff]" /> : null}
					{barState === "error" ? <AlertCircle className="h-4 w-4 text-[#ef4444]" /> : null}

					{barState === "offline" ? <span>You're offline - edits are saved locally and will sync when you reconnect</span> : null}
					{barState === "syncing" ? <span>Syncing changes...</span> : null}
					{barState === "error" ? (
						<button type="button" onClick={() => setIsModalOpen(true)} className="pointer-events-auto rounded px-1 text-left underline-offset-2 hover:underline">
							Some changes failed to sync - tap to review
						</button>
					) : null}
				</div>
			</div>
			<SyncFailedModal open={isModalOpen} onClose={() => setIsModalOpen(false)} />
		</>
	);
}
