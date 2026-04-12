import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { SearchResponse, SearchResult } from "@/types/search";

type FullTextSearchRow = {
	id: string;
	title: string;
	parentId: string | null;
	snippet: string;
	updatedAt: Date;
	score: number;
};

const SEARCH_CONFIG = {
	MIN_TOKEN_LENGTH: 2,
	MAX_FALLBACK_TOKENS: 6,
	MAX_RESULTS: 10,
	SNIPPET_MAX_WORDS: 30,
	SNIPPET_MIN_WORDS: 15,
	SNIPPET_START_SEL: "__STACKNOTE_HL_START__",
	SNIPPET_STOP_SEL: "__STACKNOTE_HL_END__",
} as const;
const MUTABLE_CACHE_CONTROL = "private, max-age=0, must-revalidate";

function normalizeSearchText(value: string) {
	return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

function tokenizeQuery(query: string) {
	return normalizeSearchText(query).match(/[\p{L}\p{N}]+/gu) ?? [];
}

function buildPrefixTsQuery(tokens: string[]) {
	return tokens
		.filter((token) => token.length > 0)
		.map((token) => `${token}:*`)
		.join(" & ");
}
function mapSearchRow(row: FullTextSearchRow): SearchResult {
	return {
		id: row.id,
		title: row.title,
		snippet: row.snippet,
		score: Number(row.score),
		updatedAt: row.updatedAt.toISOString(),
		parentId: row.parentId,
	};
}

export async function GET(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const searchParams = request.nextUrl.searchParams;
	const query = searchParams.get("query") ?? searchParams.get("q") ?? "";
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

	if (!query || query.trim().length === 0) {
		return NextResponse.json({ error: "query_required" }, { status: 400 });
	}

	if (query.length > 500) {
		return NextResponse.json({ error: "query_too_long" }, { status: 400 });
	}

	const queryTokens = tokenizeQuery(query);
	const effectiveSqlQueryTokens = queryTokens.filter((token) => token.length >= SEARCH_CONFIG.MIN_TOKEN_LENGTH).slice(0, SEARCH_CONFIG.MAX_FALLBACK_TOKENS);
	const prefixTsQuery = buildPrefixTsQuery(effectiveSqlQueryTokens);

	if (queryTokens.length === 0 || !prefixTsQuery) {
		return NextResponse.json<SearchResponse>({
			results: [],
		});
	}

	const noteSearchableTextExpr = Prisma.sql`
		COALESCE(
			NULLIF(to_jsonb(n) ->> 'searchableText', ''),
			NULLIF(to_jsonb(n) ->> 'searchable_text', ''),
			COALESCE(n."content"::text, ''),
			''
		)
	`;

	const rows = await prisma.$queryRaw<FullTextSearchRow[]>(Prisma.sql`
		WITH query_input AS (
			SELECT
				to_tsquery('english', ${prefixTsQuery}) AS ts_query
		),
		ranked AS (
			SELECT
				n."id",
				n."title",
				n."folderId" AS "parentId",
				n."updatedAt",
					replace(
						replace(
							ts_headline(
								'english',
								COALESCE(n."title", '') || E'\n' || ${noteSearchableTextExpr},
								query_input.ts_query,
								${`MaxWords=${SEARCH_CONFIG.SNIPPET_MAX_WORDS}, MinWords=${SEARCH_CONFIG.SNIPPET_MIN_WORDS}, MaxFragments=2, StartSel=${SEARCH_CONFIG.SNIPPET_START_SEL}, StopSel=${SEARCH_CONFIG.SNIPPET_STOP_SEL}`}
							),
							${SEARCH_CONFIG.SNIPPET_START_SEL},
							''
						),
						${SEARCH_CONFIG.SNIPPET_STOP_SEL},
						''
					) AS "snippet",
				ts_rank_cd(
					setweight(to_tsvector('english', lower(COALESCE(n."title", ''))), 'A') ||
					setweight(to_tsvector('english', lower(${noteSearchableTextExpr})), 'B'),
					query_input.ts_query
				) AS score
			FROM "notes" n
			CROSS JOIN query_input
			WHERE
				n."workspaceId" = ${workspaceId}
				AND n."isArchived" = false
				AND n."deletedAt" IS NULL
				AND (
					setweight(to_tsvector('english', lower(COALESCE(n."title", ''))), 'A') ||
					setweight(to_tsvector('english', lower(${noteSearchableTextExpr})), 'B')
				) @@ query_input.ts_query
		)
		SELECT
			"id",
			"title",
			"parentId",
			"updatedAt",
			"snippet",
			score
		FROM ranked
		ORDER BY score DESC, "updatedAt" DESC
		LIMIT ${SEARCH_CONFIG.MAX_RESULTS}
	`);

	const response: SearchResponse = {
		results: rows.map((row) => mapSearchRow(row)),
	};

	return NextResponse.json(response, {
		headers: {
			"Cache-Control": MUTABLE_CACHE_CONTROL,
		},
	});
}
