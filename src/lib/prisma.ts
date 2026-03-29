import { PrismaClient } from "@/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const POOLED_DATABASE_ENV_KEYS = ["DATABASE_URL_POOLED", "DATABASE_POOLER_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL"] as const;

function getEnvValue(key: string): string | undefined {
	const value = process.env[key];
	if (!value) {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function isLikelyDirectSupabaseUrl(connectionString: string): boolean {
	try {
		const parsed = new URL(connectionString);
		const isSupabaseHost = parsed.hostname.endsWith(".supabase.co");
		const isDirectHost = parsed.hostname.startsWith("db.");
		const port = parsed.port || "5432";
		return isSupabaseHost && isDirectHost && port === "5432";
	} catch {
		return false;
	}
}

function resolveDatabaseConnectionString(): string {
	const isVercelRuntime = process.env.VERCEL === "1" || typeof process.env.VERCEL_ENV === "string";
	const pooledUrl = POOLED_DATABASE_ENV_KEYS.map((key) => getEnvValue(key)).find(Boolean);
	const directUrl = getEnvValue("DATABASE_URL");

	const connectionString = isVercelRuntime ? (pooledUrl ?? directUrl) : (directUrl ?? pooledUrl);

	if (!connectionString) {
		throw new Error("Missing database URL. Set DATABASE_URL for local development and DATABASE_URL_POOLED (or POSTGRES_PRISMA_URL) for Vercel.");
	}

	if (isVercelRuntime && isLikelyDirectSupabaseUrl(connectionString)) {
		console.warn(
			"[prisma] DATABASE_URL points to a direct Supabase host (db.*:5432). On Vercel, use a pooled connection string (DATABASE_URL_POOLED or POSTGRES_PRISMA_URL).",
		);
	}

	return connectionString;
}

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: resolveDatabaseConnectionString() });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
