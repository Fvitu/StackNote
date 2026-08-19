import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

	if (!isDev && !isVercelCronRequest(request) && (!cronSecret || readBearerToken(request) !== cronSecret)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const startTime = Date.now();
	let dbStatus = "unknown";
	let dbError: string | null = null;
	let supabaseStatus = "skipped";
	let supabaseError: string | null = null;

	try {
		await prisma.$queryRaw`SELECT 1 as ping`;
		dbStatus = "connected";
	} catch (error) {
		dbStatus = "error";
		dbError = error instanceof Error ? error.message : String(error);
		console.error("[keep-alive] Database ping failed:", error);
	}

	if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
		try {
			const supabase = createAdminClient();
			const { error } = await supabase.from("users").select("id").limit(1);
			if (error) {
				supabaseStatus = "error";
				supabaseError = error.message;
				console.error("[keep-alive] Supabase REST ping failed:", error);
			} else {
				supabaseStatus = "connected";
			}
		} catch (error) {
			supabaseStatus = "error";
			supabaseError = error instanceof Error ? error.message : String(error);
			console.error("[keep-alive] Supabase client exception:", error);
		}
	}

	const success = dbStatus === "connected" && (supabaseStatus === "connected" || supabaseStatus === "skipped");

	return NextResponse.json(
		{
			success,
			timestamp: new Date().toISOString(),
			durationMs: Date.now() - startTime,
			ping: {
				database: {
					status: dbStatus,
					...(dbError ? { error: dbError } : {}),
				},
				supabaseRest: {
					status: supabaseStatus,
					...(supabaseError ? { error: supabaseError } : {}),
				},
			},
		},
		{
			status: 200,
			headers: {
				"Cache-Control": MUTABLE_CACHE_CONTROL,
			},
		},
	);
}
