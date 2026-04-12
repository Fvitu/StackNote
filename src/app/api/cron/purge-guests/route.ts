import { NextRequest, NextResponse } from "next/server";
import { cleanupExpiredGuestUsers } from "@/lib/guest-session";
import { redis } from "@/lib/redis";

const CRON_LOCK_KEY = "stacknote:cron:purge-guests";
const CRON_LOCK_TTL_SECONDS = 60 * 10;
const MUTABLE_CACHE_CONTROL = "private, max-age=0, must-revalidate";

function readBearerToken(request: NextRequest) {
	const header = request.headers.get("authorization")?.trim() ?? "";
	const match = /^Bearer\s+(.+)$/i.exec(header);
	return match?.[1]?.trim() ?? "";
}

function isVercelCronRequest(request: NextRequest) {
	return request.headers.get("x-vercel-cron") === "1";
}

export async function GET(request: NextRequest) {
	const cronSecret = process.env.CRON_SECRET?.trim();
	if (!isVercelCronRequest(request) && (!cronSecret || readBearerToken(request) !== cronSecret)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let lockAcquired = false;

	try {
		if (redis) {
			const result = await redis.set(CRON_LOCK_KEY, "1", "EX", CRON_LOCK_TTL_SECONDS, "NX");
			lockAcquired = result === "OK";

			if (!lockAcquired) {
				return NextResponse.json({ error: "Guest purge already running" }, { status: 409 });
			}
		}

		await cleanupExpiredGuestUsers();

		return NextResponse.json(
			{ success: true },
			{
				headers: {
					"Cache-Control": MUTABLE_CACHE_CONTROL,
				},
			},
		);
	} catch (error) {
		console.error("Failed to purge expired guest users:", error);
		return NextResponse.json({ error: "Failed to purge guests" }, { status: 500 });
	} finally {
		if (redis && lockAcquired) {
			await redis.del(CRON_LOCK_KEY).catch(() => undefined);
		}
	}
}
