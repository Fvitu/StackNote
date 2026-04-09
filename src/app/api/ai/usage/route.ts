import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAiUsage } from "@/lib/server-data";

export async function GET() {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const stats = await getAiUsage(session.user.id);

		return NextResponse.json(stats, {
			headers: {
				"Cache-Control": "private, max-age=30",
			},
		});
	} catch (error) {
		console.error("Failed to load AI usage stats:", error);
		return NextResponse.json({ error: "Failed to load AI usage stats" }, { status: 500 });
	}
}
