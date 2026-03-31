import Redis from "ioredis";

type GlobalRedisState = {
	stacknoteRedis?: Redis | null;
};

const globalForRedis = globalThis as typeof globalThis & GlobalRedisState;

function readRedisUrl() {
	const value = process.env.REDIS_URL?.trim();
	return value && value.length > 0 ? value : null;
}

function createRedisClient() {
	const redisUrl = readRedisUrl();
	if (!redisUrl) {
		return null;
	}

	const client = new Redis(redisUrl, {
		lazyConnect: true,
		enableAutoPipelining: true,
		maxRetriesPerRequest: 3,
	});

	client.on("error", (error) => {
		console.error("[redis] Client error:", error);
	});

	return client;
}

export const redis = globalForRedis.stacknoteRedis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") {
	globalForRedis.stacknoteRedis = redis;
}
