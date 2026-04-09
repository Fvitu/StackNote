import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getWorkspaceTree } from "@/lib/server-data";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;

	const tree = await getWorkspaceTree(session.user.id, id);
	if (!tree) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	return NextResponse.json(tree, {
		headers: {
			"Cache-Control": "private, max-age=15, stale-while-revalidate=60",
		},
	});
}
