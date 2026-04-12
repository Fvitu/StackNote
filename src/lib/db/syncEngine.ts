import { localNotes, syncQueue, type QueueStatus, type SyncQueueRecord } from "@/lib/db/local";

type Listener = () => void;

type ReplayResponse = {
	ok: boolean;
	status: number;
	updatedAt?: string;
};

export class SyncEngine {
	private listeners = new Set<Listener>();
	private started = false;
	private syncing = false;
	private failedCount = 0;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;

	subscribe(listener: Listener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	get isSyncing() {
		return this.syncing;
	}

	get hasFailedEntries() {
		return this.failedCount > 0;
	}

	async getFailedEntries() {
		return syncQueue.getFailed();
	}

	private notify() {
		for (const listener of this.listeners) {
			listener();
		}
	}

	private async refreshFailedCount() {
		const failedEntries = await syncQueue.getFailed();
		this.failedCount = failedEntries.length;
	}

	start() {
		if (this.started || typeof window === "undefined") {
			return;
		}

		this.started = true;
		window.addEventListener("online", this.handleOnline);
		window.addEventListener("offline", this.handleOffline);
		void this.refreshFailedCount().then(() => this.notify());
		if (navigator.onLine) {
			void this.flush();
		}
	}

	stop() {
		if (!this.started || typeof window === "undefined") {
			return;
		}

		window.removeEventListener("online", this.handleOnline);
		window.removeEventListener("offline", this.handleOffline);
		this.started = false;
		if (this.retryTimer) {
			clearTimeout(this.retryTimer);
			this.retryTimer = null;
		}
	}

	private handleOnline = () => {
		void this.flush();
	};

	private handleOffline = () => {
		if (this.retryTimer) {
			clearTimeout(this.retryTimer);
			this.retryTimer = null;
		}
	};

	private scheduleRetry(delayMs: number) {
		if (this.retryTimer) {
			clearTimeout(this.retryTimer);
		}

		this.retryTimer = setTimeout(() => {
			void this.flush();
		}, delayMs);
	}

	private async replay(entry: SyncQueueRecord): Promise<ReplayResponse> {
		if (entry.entity === "note") {
			if (entry.operation === "CREATE") {
				const response = await fetch("/api/notes", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(entry.payload),
				});
				return { ok: response.ok, status: response.status };
			}

			if (entry.operation === "UPDATE") {
				const response = await fetch(`/api/notes/${encodeURIComponent(entry.entityId)}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(entry.payload),
				});
				const updated = response.ok ? ((await response.json()) as { updatedAt?: string }) : null;
				return { ok: response.ok, status: response.status, updatedAt: updated?.updatedAt };
			}

			const response = await fetch(`/api/notes/${encodeURIComponent(entry.entityId)}`, {
				method: "DELETE",
			});
			return { ok: response.ok, status: response.status };
		}

		const response = await fetch(`/api/notes/${encodeURIComponent(entry.entityId)}/blocks`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(entry.payload),
		});
		return { ok: response.ok, status: response.status };
	}

	private async markEntryStatus(entry: SyncQueueRecord, status: QueueStatus) {
		await syncQueue.update({
			...entry,
			status,
		});
	}

	async flush() {
		if (this.syncing || typeof navigator === "undefined" || !navigator.onLine) {
			return;
		}

		this.syncing = true;
		this.notify();

		try {
			const pendingEntries = await syncQueue.getPendingOrdered();
			for (const entry of pendingEntries) {
				if (typeof entry.pk !== "number") {
					continue;
				}

				try {
					const replay = await this.replay(entry);
					if (replay.ok) {
						await syncQueue.remove(entry.pk);
						if (entry.entity === "note") {
							await localNotes.markSynced(entry.entityId, replay.updatedAt);
						}
						continue;
					}

					if (replay.status >= 400 && replay.status < 500) {
						await this.markEntryStatus(entry, "failed");
						continue;
					}

					const retries = entry.retries + 1;
					if (retries > 5) {
						await this.markEntryStatus({ ...entry, retries }, "failed");
						continue;
					}

					await syncQueue.update({
						...entry,
						retries,
						timestamp: Date.now(),
						status: "pending",
					});
					this.scheduleRetry(2 ** retries * 1000);
					break;
				} catch {
					const retries = entry.retries + 1;
					if (retries > 5) {
						await this.markEntryStatus({ ...entry, retries }, "failed");
						continue;
					}

					await syncQueue.update({
						...entry,
						retries,
						timestamp: Date.now(),
						status: "pending",
					});
					this.scheduleRetry(2 ** retries * 1000);
					break;
				}
			}
			// TODO: Replace online-event flush with Supabase Realtime subscriptions for push-based sync.
		} finally {
			await this.refreshFailedCount();
			this.syncing = false;
			this.notify();
		}
	}
}

export const syncEngine = new SyncEngine();
