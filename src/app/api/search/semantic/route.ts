import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { semanticSearch } from "@/lib/semantic-search";

export async function GET(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const searchParams = request.nextUrl.searchParams;
	const workspaceId = searchParams.get("workspaceId")?.trim() ?? "";
	const query = searchParams.get("q")?.trim() ?? "";
	const requestedLimit = Number(searchParams.get("limit") ?? "10");
	const limit = Number.isFinite(requestedLimit) ? Math.min(25, Math.max(1, requestedLimit)) : 10;

	if (!workspaceId) {
		return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
	}

	if (!query) {
		return NextResponse.json({ error: "q is required" }, { status: 400 });
	}

	const workspace = await prisma.workspace.findFirst({
		where: {
			id: workspaceId,
			userId: session.user.id,
		},
		select: { id: true },
	});

	if (!workspace) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const results = await semanticSearch(query, workspaceId, limit);
	return NextResponse.json({ results });
}
