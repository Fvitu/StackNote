CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "notes"
ADD COLUMN IF NOT EXISTS "searchableText" TEXT;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'notes'
			AND column_name = 'embeddedAt'
	) THEN
		ALTER TABLE "notes" RENAME COLUMN "embeddedAt" TO "vectorUpdatedAt";
	END IF;
END $$;

ALTER TABLE "notes"
ADD COLUMN IF NOT EXISTS "vectorUpdatedAt" TIMESTAMP(3);

CREATE OR REPLACE FUNCTION update_notes_search_vector()
RETURNS TRIGGER AS $$
BEGIN
	NEW.search_vector :=
		setweight(to_tsvector('simple', unaccent(lower(COALESCE(NEW.title, '')))), 'A') ||
		setweight(to_tsvector('simple', unaccent(lower(COALESCE(NEW."searchableText", '')))), 'B');
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notes_search_vector_update ON "notes";
CREATE TRIGGER notes_search_vector_update
BEFORE INSERT OR UPDATE ON "notes"
FOR EACH ROW
EXECUTE FUNCTION update_notes_search_vector();

UPDATE "notes"
SET "search_vector" =
	setweight(to_tsvector('simple', unaccent(lower(COALESCE("title", '')))), 'A') ||
	setweight(to_tsvector('simple', unaccent(lower(COALESCE("searchableText", '')))), 'B');

DROP INDEX IF EXISTS "notes_embedding_idx";
CREATE INDEX IF NOT EXISTS "notes_embedding_hnsw"
ON "notes" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "notes_title_trgm_idx"
ON "notes" USING gin (unaccent(lower("title")) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "notes_searchable_text_trgm_idx"
ON "notes" USING gin (unaccent(lower(COALESCE("searchableText", ''))) gin_trgm_ops);
