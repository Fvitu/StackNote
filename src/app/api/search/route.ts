import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { generateQueryEmbedding, isEmbeddingsConfigured } from "@/lib/embeddings";
import { getNoteSchemaCapabilities } from "@/lib/note-schema";
import { prisma } from "@/lib/prisma";
import type { SearchResponse, SearchResult } from "@/types/search";

type SearchRow = {
	id: string;
	title: string;
	emoji: string | null;
	parentId: string | null;
	snippet: string;
	matchType: "semantic" | "fulltext" | "hybrid";
	score: number;
	updatedAt: Date;
	signalCount: number;
	bestRank: number;
};

type LexicalSearchRow = {
	id: string;
	title: string;
	emoji: string | null;
	parentId: string | null;
	snippet: string;
	updatedAt: Date;
	rank: number;
};

type SemanticSearchRow = {
	id: string;
	title: string;
	emoji: string | null;
	parentId: string | null;
	snippet: string;
	updatedAt: Date;
	rank: number;
};

type RawRank = number | bigint | string | null | undefined;

function escapeHtml(value: string) {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sanitizeSnippet(snippet: string) {
	return escapeHtml(snippet)
		.replace(/&lt;mark&gt;/g, "<mark>")
		.replace(/&lt;\/mark&gt;/g, "</mark>");
}

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

function buildNormalizedMap(value: string) {
	const sourceChars = Array.from(value);
	const normalizedChars: string[] = [];
	const indexMap: number[] = [];

	sourceChars.forEach((char, index) => {
		const normalizedChar = char.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
		for (const piece of Array.from(normalizedChar)) {
			normalizedChars.push(piece);
			indexMap.push(index);
		}
	});

	return {
		normalized: normalizedChars.join(""),
		indexMap,
		sourceChars,
	};
}

function collectAccentInsensitiveRanges(value: string, queryTokens: string[]) {
	const normalizedTokens = Array.from(new Set(queryTokens.map(normalizeSearchText).filter(Boolean))).sort((a, b) => b.length - a.length);
	if (normalizedTokens.length === 0) {
		return [];
	}

	const { normalized, indexMap } = buildNormalizedMap(value);
	const ranges: Array<{ start: number; end: number }> = [];

	for (const token of normalizedTokens) {
		let searchIndex = 0;
		while (searchIndex < normalized.length) {
			const matchIndex = normalized.indexOf(token, searchIndex);
			if (matchIndex === -1) {
				break;
			}

			const start = indexMap[matchIndex];
			const end = indexMap[matchIndex + token.length - 1];
			if (start !== undefined && end !== undefined) {
				ranges.push({ start, end });
			}

			searchIndex = matchIndex + Math.max(1, token.length);
		}
	}

	if (ranges.length === 0) {
		return [];
	}

	ranges.sort((left, right) => left.start - right.start || left.end - right.end);

	const merged: Array<{ start: number; end: number }> = [];
	for (const range of ranges) {
		const last = merged[merged.length - 1];
		if (!last || range.start > last.end + 1) {
			merged.push({ ...range });
			continue;
		}

		last.end = Math.max(last.end, range.end);
	}

	return merged;
}

function wrapRangesWithMark(value: string, queryTokens: string[]) {
	const ranges = collectAccentInsensitiveRanges(value, queryTokens);
	if (ranges.length === 0) {
		return escapeHtml(value);
	}

	const sourceChars = Array.from(value);
	let cursor = 0;
	let output = "";

	for (const range of ranges) {
		const safeStart = Math.max(cursor, range.start);
		if (safeStart > cursor) {
			output += escapeHtml(sourceChars.slice(cursor, safeStart).join(""));
		}

		output += `<mark>${escapeHtml(sourceChars.slice(safeStart, range.end + 1).join(""))}</mark>`;
		cursor = range.end + 1;
	}

	if (cursor < sourceChars.length) {
		output += escapeHtml(sourceChars.slice(cursor).join(""));
	}

	return output;
}

function highlightSnippet(snippet: string, queryTokens: string[]) {
	if (!snippet || queryTokens.length === 0) {
		return snippet;
	}

	return snippet
		.split(/(<mark>[\s\S]*?<\/mark>)/gi)
		.map((segment) => (segment.startsWith("<mark>") ? segment : wrapRangesWithMark(segment, queryTokens)))
		.join("");
}

function joinConditionsWithOr(conditions: Prisma.Sql[]) {
	return conditions.reduce<Prisma.Sql | null>((current, condition) => {
		if (current === null) {
			return condition;
		}

		return Prisma.sql`${current} OR ${condition}`;
	}, null);
}

function mapSearchRow(row: SearchRow, queryTokens: string[]): SearchResult {
	const sanitizedSnippet = sanitizeSnippet(row.snippet);
	const highlightedSnippet = highlightSnippet(sanitizedSnippet, queryTokens);

	return {
		id: row.id,
		title: row.title,
		snippet: highlightedSnippet,
		matchType: row.matchType,
		score: Number(row.score),
		updatedAt: row.updatedAt.toISOString(),
		parentId: row.parentId,
		emoji: row.emoji,
	};
}

function toSafeRank(value: RawRank): number | null {
	if (value == null) {
		return null;
	}

	const parsed = typeof value === "bigint" ? Number(value) : Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

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
				folderId: true,
				updatedAt: true,
			},
		});

		const response: SearchResponse = {
			mode: "recent",
			results: recent.map((note) => ({
				id: note.id,
				title: note.title,
				snippet: "",
				matchType: "fulltext",
				score: 0,
				updatedAt: note.updatedAt.toISOString(),
				parentId: note.folderId,
				emoji: note.emoji,
			})),
		};

		return NextResponse.json(response);
	}

	const queryTokens = tokenizeQuery(query);
	const normalizedQuery = normalizeSearchText(query);
	const sqlQuery = query.toLowerCase().trim();
	const sqlQueryTokens = sqlQuery.match(/[\p{L}\p{N}]+/gu) ?? [];
	const prefixTsQuery = buildPrefixTsQuery(sqlQueryTokens.length > 0 ? sqlQueryTokens : queryTokens);

	if (!normalizedQuery || !sqlQuery || queryTokens.length === 0 || !prefixTsQuery) {
		return NextResponse.json<SearchResponse>({
			mode: "search",
			results: [],
		});
	}

	let queryEmbedding: number[] | null = null;
	if (isEmbeddingsConfigured()) {
		try {
			queryEmbedding = await generateQueryEmbedding(query);
		} catch (error) {
			console.error("[search] semantic embedding failed", error);
		}
	}
	const noteSchemaCapabilities = await getNoteSchemaCapabilities();

	const noteSearchableTextExpr = Prisma.sql`
		COALESCE(
			NULLIF(to_jsonb(n) ->> 'searchableText', ''),
			NULLIF(to_jsonb(n) ->> 'searchable_text', ''),
			COALESCE(n."content"::text, ''),
			''
		)
	`;

	const titlePrefixConditions = joinConditionsWithOr(sqlQueryTokens.map((token) => Prisma.sql`lower(c."title") LIKE ${`${token}%`}`));
	const textPrefixConditions = joinConditionsWithOr(sqlQueryTokens.map((token) => Prisma.sql`lower(COALESCE(c."searchable_text", '')) LIKE ${`%${token}%`}`));

	const lexicalRows = await prisma.$queryRaw<LexicalSearchRow[]>(Prisma.sql`
		WITH query_input AS (
			SELECT
				${sqlQuery} AS normalized_query,
				to_tsquery('simple', ${prefixTsQuery}) AS prefix_ts_query
		),
		lexical_candidates AS (
			SELECT
				n."id",
				n."title",
				n."emoji",
				n."folderId" AS "parentId",
				n."updatedAt",
				${noteSearchableTextExpr} AS "searchable_text",
				lower(n."title") AS "normalizedTitle",
				lower(${noteSearchableTextExpr}) AS "normalized_searchable_text",
				setweight(to_tsvector('simple', lower(COALESCE(n."title", ''))), 'A') ||
				setweight(to_tsvector('simple', lower(${noteSearchableTextExpr})), 'B') AS "searchVector"
			FROM "notes" n
			WHERE
				n."workspaceId" = ${workspaceId}
				AND n."isArchived" = false
		),
		lexical_ranked AS (
			SELECT
				c."id",
				c."title",
				c."emoji",
				c."parentId",
				c."updatedAt",
				ts_headline(
					'simple',
					COALESCE(c."title", '') || E'\n' || COALESCE(c."searchable_text", ''),
					query_input.prefix_ts_query,
					'MaxWords=30, MinWords=15, MaxFragments=2, StartSel=<mark>, StopSel=</mark>'
				) AS "snippet",
				GREATEST(
					ts_rank_cd(c."searchVector", query_input.prefix_ts_query) * 3.0,
					CASE WHEN c."normalizedTitle" LIKE query_input.normalized_query || '%' THEN 1.8 ELSE 0 END,
					CASE WHEN c."normalized_searchable_text" LIKE '%' || query_input.normalized_query || '%' THEN 1.2 ELSE 0 END
				) AS lexical_score
			FROM lexical_candidates c
			CROSS JOIN query_input
			WHERE
				c."searchVector" @@ query_input.prefix_ts_query
				OR c."normalizedTitle" LIKE '%' || query_input.normalized_query || '%'
				OR c."normalized_searchable_text" LIKE '%' || query_input.normalized_query || '%'
				OR (${titlePrefixConditions ?? Prisma.sql`FALSE`})
				OR (${textPrefixConditions ?? Prisma.sql`FALSE`})
		)
		SELECT
			"id",
			"title",
			"emoji",
			"parentId",
			"updatedAt",
			"snippet",
			row_number() OVER (ORDER BY lexical_score DESC, "updatedAt" DESC)::int AS "rank"
		FROM (
			SELECT
				"id",
				"title",
				"emoji",
				"parentId",
				"updatedAt",
				"snippet",
				lexical_score
			FROM lexical_ranked
			WHERE lexical_score >= 0.12
		) ranked
		ORDER BY lexical_score DESC, "updatedAt" DESC
		LIMIT 20
	`);

	const semanticRows =
		queryEmbedding !== null && noteSchemaCapabilities.hasEmbeddingColumn
			? await prisma.$queryRaw<SemanticSearchRow[]>(Prisma.sql`
					SELECT
						n."id",
						n."title",
						n."emoji",
						n."folderId" AS "parentId",
						n."updatedAt",
						LEFT(${noteSearchableTextExpr}, 220) AS "snippet",
						row_number() OVER (
							ORDER BY n."embedding" <=> ${JSON.stringify(queryEmbedding)}::vector
						)::int AS "rank"
					FROM "notes" n
					WHERE
						n."workspaceId" = ${workspaceId}
						AND n."isArchived" = false
						AND n."embedding" IS NOT NULL
					ORDER BY n."embedding" <=> ${JSON.stringify(queryEmbedding)}::vector, n."updatedAt" DESC
					LIMIT 20
				`)
			: [];

	const mergedById = new Map<
		string,
		{
			id: string;
			title: string;
			emoji: string | null;
			parentId: string | null;
			updatedAt: Date;
			lexicalSnippet: string;
			semanticSnippet: string;
			lexicalRank: number | null;
			semanticRank: number | null;
		}
	>();

	for (const row of lexicalRows) {
		mergedById.set(row.id, {
			id: row.id,
			title: row.title,
			emoji: row.emoji,
			parentId: row.parentId,
			updatedAt: row.updatedAt,
			lexicalSnippet: row.snippet,
			semanticSnippet: "",
			lexicalRank: toSafeRank(row.rank),
			semanticRank: null,
		});
	}

	for (const row of semanticRows) {
		const existing = mergedById.get(row.id);
		if (existing) {
			existing.semanticRank = toSafeRank(row.rank);
			existing.semanticSnippet = row.snippet;
			existing.updatedAt = existing.updatedAt > row.updatedAt ? existing.updatedAt : row.updatedAt;
			continue;
		}

		mergedById.set(row.id, {
			id: row.id,
			title: row.title,
			emoji: row.emoji,
			parentId: row.parentId,
			updatedAt: row.updatedAt,
			lexicalSnippet: "",
			semanticSnippet: row.snippet,
			lexicalRank: null,
			semanticRank: toSafeRank(row.rank),
		});
	}

	const rows: SearchRow[] = Array.from(mergedById.values())
		.map((row) => {
			const lexicalScore = row.lexicalRank !== null ? 1 / (60 + row.lexicalRank) : 0;
			const semanticScore = row.semanticRank !== null ? 1 / (60 + row.semanticRank) : 0;
			const signalCount = Number(row.lexicalRank !== null) + Number(row.semanticRank !== null);
			const bestRank = Math.min(row.lexicalRank ?? Number.POSITIVE_INFINITY, row.semanticRank ?? Number.POSITIVE_INFINITY);
			const matchType: SearchRow["matchType"] =
				row.lexicalRank !== null && row.semanticRank !== null ? "hybrid" : row.lexicalRank !== null ? "fulltext" : "semantic";
			const tieBreakerBonus = signalCount === 2 ? 0.0002 : row.semanticRank !== null ? 0.0001 : 0;

			return {
				id: row.id,
				title: row.title,
				emoji: row.emoji,
				parentId: row.parentId,
				snippet: row.lexicalSnippet || row.semanticSnippet,
				matchType,
				score: lexicalScore + semanticScore + tieBreakerBonus,
				updatedAt: row.updatedAt,
				signalCount,
				bestRank: Number.isFinite(bestRank) ? bestRank : 9999,
			};
		})
		.sort((a, b) => {
			if (b.score !== a.score) {
				return b.score - a.score;
			}
			if (b.signalCount !== a.signalCount) {
				return b.signalCount - a.signalCount;
			}
			if (a.bestRank !== b.bestRank) {
				return a.bestRank - b.bestRank;
			}
			return b.updatedAt.getTime() - a.updatedAt.getTime();
		})
		.slice(0, 10);

	const response: SearchResponse = {
		mode: "search",
		results: rows.map((row) => mapSearchRow(row, queryTokens)),
	};

	return NextResponse.json(response);
}
