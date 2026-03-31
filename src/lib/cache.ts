import type Redis from "ioredis";
import { redis } from "@/lib/redis";

type MemoryCacheEntry = {
	value: string;
	expiresAt: number;
};

type GlobalMemoryCacheState = {
	stacknoteMemoryCache?: Map<string, MemoryCacheEntry>;
};

const globalForCache = globalThis as typeof globalThis & GlobalMemoryCacheState;
const memoryCache = globalForCache.stacknoteMemoryCache ?? new Map<string, MemoryCacheEntry>();

if (!globalForCache.stacknoteMemoryCache) {
	globalForCache.stacknoteMemoryCache = memoryCache;
}

function cleanupMemoryEntry(key: string) {
	const entry = memoryCache.get(key);
	if (!entry) {
		return null;
	}

	if (entry.expiresAt <= Date.now()) {
		memoryCache.delete(key);
		return null;
	}

	return entry.value;
}

async function getRedisClient(): Promise<Redis | null> {
	if (!redis) {
		return null;
	}

	try {
		if (redis.status === "wait") {
			await redis.connect();
		}

		return redis;
	} catch (error) {
		console.error("[redis] Failed to connect, falling back to in-memory cache:", error);
		return null;
	}
}

export function buildCacheKey(...parts: Array<string | number | null | undefined>) {
	return parts
		.filter((part): part is string | number => part !== null && part !== undefined && String(part).length > 0)
		.map((part) => String(part))
		.join(":");
}

export function secondsUntil(target: Date | string | number) {
	const targetMs = typeof target === "number" ? target : new Date(target).getTime();
	return Math.max(1, Math.floor((targetMs - Date.now()) / 1000));
}

export async function cacheGet(key: string) {
	const client = await getRedisClient();
	if (!client) {
		return cleanupMemoryEntry(key);
	}

	return client.get(key);
}

export async function cacheSet(key: string, value: string, ttlSeconds: number) {
	const ttl = Math.max(1, Math.floor(ttlSeconds));
	const client = await getRedisClient();
	if (!client) {
		memoryCache.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
		return;
	}

	await client.set(key, value, "EX", ttl);
}

export async function cacheDelete(...keys: string[]) {
	if (keys.length === 0) {
		return;
	}

	const client = await getRedisClient();
	if (!client) {
		for (const key of keys) {
			memoryCache.delete(key);
		}
		return;
	}

	await client.del(...keys);
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
	const raw = await cacheGet(key);
	if (!raw) {
		return null;
	}

	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

export async function cacheSetJson(key: string, value: unknown, ttlSeconds: number) {
	await cacheSet(key, JSON.stringify(value), ttlSeconds);
}
