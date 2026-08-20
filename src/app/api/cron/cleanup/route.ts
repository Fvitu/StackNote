import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { cleanupExpiredGuestUsers } from "@/lib/guest-session";
import { purgeExpiredTrash } from "@/lib/trash";

export const dynamic = "force-dynamic";

const CRON_LOCK_KEY = "stacknote:cron:cleanup";
const CRON_LOCK_TTL_SECONDS = 60 * 10;
const MUTABLE_CACHE_CONTROL = "private, max-age=0, must-revalidate";

function readBearerToken(request: NextRequest): string {
	const header = request.headers.get("authorization")?.trim() ?? "";
	const match = /^Bearer\s+(.+)$/i.exec(header);
	return match?.[1]?.trim() ?? "";
}

function isVercelCronRequest(request: NextRequest): boolean {
	return request.headers.get("x-vercel-cron") === "1";
}

export async function GET(request: NextRequest) {
	const cronSecret = process.env.CRON_SECRET?.trim();
	const isDev = process.env.NODE_ENV === "development";

	// Validate authorization: allowed from Vercel Cron, matching CRON_SECRET, or development mode
	const isAuthorized =
		isDev ||
		isVercelCronRequest(request) ||
		(cronSecret && readBearerToken(request) === cronSecret) ||
		!cronSecret;

	if (!isAuthorized) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let lockAcquired = false;

	try {
		if (redis) {
			const result = await redis.set(CRON_LOCK_KEY, "1", "EX", CRON_LOCK_TTL_SECONDS, "NX");
			lockAcquired = result === "OK";

			if (!lockAcquired) {
				return NextResponse.json({ error: "Cleanup job already running" }, { status: 409 });
			}
		}

		// 1. Purge expired guest accounts (>24h inactivity)
		const guestResult = await cleanupExpiredGuestUsers();

		// 2. Purge soft-deleted trash items (>30 days retention)
		const trashResult = await purgeExpiredTrash(prisma);

		console.log("[cleanup] Maintenance cron executed successfully", {
			guests: guestResult,
			trash: trashResult,
		});

		return NextResponse.json(
			{
				success: true,
				timestamp: new Date().toISOString(),
				guests: guestResult,
				trash: trashResult,
			},
			{
				headers: {
					"Cache-Control": MUTABLE_CACHE_CONTROL,
				},
			},
		);
	} catch (error) {
		console.error("[cleanup] Maintenance cron failed:", error);
		return NextResponse.json({ error: "Failed to execute cleanup cron" }, { status: 500 });
	} finally {
		if (redis && lockAcquired) {
			await redis.del(CRON_LOCK_KEY).catch(() => undefined);
		}
	}
}
