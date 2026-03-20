import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type SearchRow = {
	id: string;
	title: string;
	emoji: string | null;
	folderId: string | null;
	updatedAt: Date;
	excerpt: string;
};

export async function GET(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const searchParams = request.nextUrl.searchParams;
	const query = searchParams.get("q")?.trim() ?? "";
	const workspaceId = searchParams.get("workspaceId")?.trim() ?? "";

	if (!workspaceId) {
		return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
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

	if (!query) {
		const recent = await prisma.note.findMany({
			where: {
				workspaceId,
				isArchived: false,
			},
			orderBy: { updatedAt: "desc" },
			take: 5,
			select: {
				id: true,
				title: true,
				emoji: true,
				updatedAt: true,
			},
		});

		return NextResponse.json({
			mode: "recent",
			results: recent.map((note) => ({
				id: note.id,
				title: note.title,
				emoji: note.emoji,
				excerpt: "",
				updatedAt: note.updatedAt,
			})),
		});
	}

	const results = await prisma.$queryRaw<SearchRow[]>(Prisma.sql`
    SELECT
      id,
      title,
      emoji,
      "folderId",
      "updatedAt",
      ts_headline(
        'english',
        COALESCE(content::text, ''),
        plainto_tsquery('english', ${query}),
        'MaxWords=20, MinWords=10, StartSel=<mark>, StopSel=</mark>'
      ) as excerpt
    FROM notes
    WHERE
      "workspaceId" = ${workspaceId}
      AND "isArchived" = false
      AND search_vector @@ plainto_tsquery('english', ${query})
    ORDER BY
      ts_rank(search_vector, plainto_tsquery('english', ${query})) DESC
    LIMIT 20
  `);

	return NextResponse.json({ mode: "search", results });
}
