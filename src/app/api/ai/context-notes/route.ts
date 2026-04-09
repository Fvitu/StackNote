import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getWorkspaceContextNotes } from "@/lib/server-data";

export async function GET(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const workspaceId = request.nextUrl.searchParams.get("workspaceId")?.trim();
	if (!workspaceId) {
		return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
	}

	try {
		const notes = await getWorkspaceContextNotes(session.user.id, workspaceId);
		if (!notes) {
			return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
		}

		return NextResponse.json(
			{ notes },
			{
				headers: {
					"Cache-Control": "private, max-age=30, stale-while-revalidate=60",
				},
			},
		);
	} catch (error) {
		console.error("Failed to load AI context notes:", error);
		return NextResponse.json({ error: "Failed to load AI context notes" }, { status: 500 });
	}
}
