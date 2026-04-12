import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { normalizeBlockNoteContent } from "@/lib/blocknote-normalize";

export type SyncStatus = "synced" | "pending" | "conflict";
export type QueueOperation = "CREATE" | "UPDATE" | "DELETE";
export type QueueEntity = "note" | "block";
export type QueueStatus = "pending" | "failed";

export interface LocalNoteRecord {
	id: string;
	title: string;
	emoji?: string | null;
	workspaceId?: string | null;
	folderId?: string | null;
	coverImage?: string | null;
	coverImageMeta?: unknown;
	content: unknown;
	createdAt: string;
	updatedAt: string;
	deletedAt?: string | null;
	_deletedAt?: string | null;
	order?: number | null;
	originalParentId?: string | null;
	searchableText?: string | null;
	editorWidth?: number | null;
	_syncStatus: SyncStatus;
}

export interface SyncQueueRecord {
	pk?: number;
	id: string;
	operation: QueueOperation;
	entity: QueueEntity;
	entityId: string;
	payload: unknown;
	timestamp: number;
	retries: number;
	status: QueueStatus;
}

interface StackNoteLocalSchema extends DBSchema {
	notes: {
		key: string;
		value: LocalNoteRecord;
		indexes: {
			"by-parentId": string;
			"by-updatedAt": string;
		};
	};
	syncQueue: {
		key: number;
		value: SyncQueueRecord;
		indexes: {
			"by-status": QueueStatus;
			"by-timestamp": number;
		};
	};
}

const DB_NAME = "stacknote-local";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<StackNoteLocalSchema>> | null = null;

function getDb() {
	if (!dbPromise) {
		dbPromise = openDB<StackNoteLocalSchema>(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains("notes")) {
					const notesStore = db.createObjectStore("notes", { keyPath: "id" });
					notesStore.createIndex("by-parentId", "folderId");
					notesStore.createIndex("by-updatedAt", "updatedAt");
				}

				if (!db.objectStoreNames.contains("syncQueue")) {
					const queueStore = db.createObjectStore("syncQueue", { keyPath: "pk", autoIncrement: true });
					queueStore.createIndex("by-status", "status");
					queueStore.createIndex("by-timestamp", "timestamp");
				}
			},
		});
	}

	return dbPromise;
}

function nowTimestamp() {
	return Date.now();
}

function createQueueRecord(input: Omit<SyncQueueRecord, "pk" | "id" | "retries" | "status" | "timestamp">): SyncQueueRecord {
	const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
	return {
		id,
		operation: input.operation,
		entity: input.entity,
		entityId: input.entityId,
		payload: input.payload,
		timestamp: nowTimestamp(),
		retries: 0,
		status: "pending",
	};
}

async function enqueueOperation(input: Omit<SyncQueueRecord, "pk" | "id" | "retries" | "status" | "timestamp">) {
	const db = await getDb();
	await db.add("syncQueue", createQueueRecord(input));
}

function normalizeIncomingNote(note: LocalNoteRecord): LocalNoteRecord {
	return {
		...note,
		content: normalizeBlockNoteContent(note.content),
		_syncStatus: note._syncStatus,
	};
}

export const syncQueue = {
	async getPendingOrdered(): Promise<SyncQueueRecord[]> {
		const db = await getDb();
		const all = await db.getAll("syncQueue");
		return all.filter((entry) => entry.status === "pending").sort((a, b) => a.timestamp - b.timestamp);
	},
	async getFailed(): Promise<SyncQueueRecord[]> {
		const db = await getDb();
		const all = await db.getAll("syncQueue");
		return all.filter((entry) => entry.status === "failed").sort((a, b) => a.timestamp - b.timestamp);
	},
	async update(entry: SyncQueueRecord) {
		const db = await getDb();
		await db.put("syncQueue", entry);
	},
	async remove(pk: number) {
		const db = await getDb();
		await db.delete("syncQueue", pk);
	},
	async enqueue(entry: Omit<SyncQueueRecord, "pk" | "id" | "retries" | "status" | "timestamp">) {
		await enqueueOperation(entry);
	},
};

export const localNotes = {
	async getAll() {
		const db = await getDb();
		const notes = await db.getAll("notes");
		return notes.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
	},
	async getById(id: string) {
		const db = await getDb();
		return db.get("notes", id);
	},
	async upsert(note: LocalNoteRecord) {
		const db = await getDb();
		const next = normalizeIncomingNote({ ...note, _syncStatus: "synced" });
		await db.put("notes", next);
		return next;
	},
	async create(note: LocalNoteRecord) {
		const db = await getDb();
		const next = normalizeIncomingNote({ ...note, _syncStatus: "pending" });
		await db.put("notes", next);
		await enqueueOperation({
			operation: "CREATE",
			entity: "note",
			entityId: note.id,
			payload: next,
		});
		return next;
	},
	async update(id: string, patch: Partial<LocalNoteRecord>) {
		const db = await getDb();
		const current = await db.get("notes", id);
		if (!current) {
			return null;
		}

		if (patch.updatedAt && current.updatedAt) {
			const incoming = Date.parse(patch.updatedAt);
			const local = Date.parse(current.updatedAt);
			if (Number.isFinite(incoming) && Number.isFinite(local) && incoming > local) {
				const conflict = { ...current, _syncStatus: "conflict" as const };
				await db.put("notes", conflict);
				return conflict;
			}
		}

		const next = normalizeIncomingNote({
			...current,
			...patch,
			content: patch.content !== undefined ? patch.content : current.content,
			_syncStatus: "pending",
		});
		await db.put("notes", next);
		await enqueueOperation({
			operation: "UPDATE",
			entity: "note",
			entityId: id,
			payload: patch,
		});
		return next;
	},
	async delete(id: string) {
		const db = await getDb();
		const current = await db.get("notes", id);
		if (!current) {
			return null;
		}

		const deletedAt = new Date().toISOString();
		const next = {
			...current,
			_deletedAt: deletedAt,
			_syncStatus: "pending" as const,
		};
		await db.put("notes", next);
		await enqueueOperation({
			operation: "DELETE",
			entity: "note",
			entityId: id,
			payload: { _deletedAt: deletedAt },
		});
		return next;
	},
	async markSynced(id: string, updatedAt?: string) {
		const db = await getDb();
		const current = await db.get("notes", id);
		if (!current) {
			return;
		}

		await db.put("notes", {
			...current,
			updatedAt: updatedAt ?? current.updatedAt,
			_syncStatus: "synced",
		});
	},
};
