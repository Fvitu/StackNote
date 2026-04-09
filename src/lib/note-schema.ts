import { prisma } from "@/lib/prisma";

export type NoteSchemaCapabilities = {
	hasSearchableTextColumn: boolean;
	hasEmbeddingColumn: boolean;
	hasVectorUpdatedAtColumn: boolean;
};

type ColumnRow = {
	column_name: string;
};

const NOTE_SCHEMA_CACHE_TTL_MS = 30_000;
let cachedCapabilities: { value: NoteSchemaCapabilities; expiresAt: number } | null = null;

export async function getNoteSchemaCapabilities(forceRefresh = false): Promise<NoteSchemaCapabilities> {
	const now = Date.now();
	if (!forceRefresh && cachedCapabilities && cachedCapabilities.expiresAt > now) {
		return cachedCapabilities.value;
	}

	const rows = await prisma.$queryRaw<ColumnRow[]>`
		SELECT column_name
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'notes'
			AND column_name IN ('searchableText', 'searchable_text', 'embedding', 'vectorUpdatedAt', 'vector_updated_at')
	`;

	const columns = new Set(rows.map((row) => row.column_name));
	const value: NoteSchemaCapabilities = {
		hasSearchableTextColumn: columns.has("searchableText") || columns.has("searchable_text"),
		hasEmbeddingColumn: columns.has("embedding"),
		hasVectorUpdatedAtColumn: columns.has("vectorUpdatedAt") || columns.has("vector_updated_at"),
	};

	cachedCapabilities = {
		value,
		expiresAt: now + NOTE_SCHEMA_CACHE_TTL_MS,
	};

	return value;
}
