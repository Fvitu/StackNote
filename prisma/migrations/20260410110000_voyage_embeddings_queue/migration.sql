CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmbeddingStatus') THEN
		CREATE TYPE "EmbeddingStatus" AS ENUM ('NONE', 'QUEUED', 'PROCESSING', 'DONE', 'STALE');
	END IF;
END $$;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QueueItemStatus') THEN
		CREATE TYPE "QueueItemStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');
	END IF;
END $$;

DO $$
DECLARE
	embedding_type text;
BEGIN
	SELECT format_type(a.atttypid, a.atttypmod)
	INTO embedding_type
	FROM pg_attribute a
	JOIN pg_class c ON c.oid = a.attrelid
	JOIN pg_namespace n ON n.oid = c.relnamespace
	WHERE n.nspname = 'public'
		AND c.relname = 'notes'
		AND a.attname = 'embedding'
		AND a.attnum > 0
		AND NOT a.attisdropped;

	IF embedding_type IS NULL THEN
		ALTER TABLE "notes" ADD COLUMN "embedding" vector(1024);
	ELSIF embedding_type <> 'vector(1024)' THEN
		ALTER TABLE "notes" DROP COLUMN "embedding";
		ALTER TABLE "notes" ADD COLUMN "embedding" vector(1024);
	END IF;
END $$;

ALTER TABLE "notes"
	ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT,
	ADD COLUMN IF NOT EXISTS "embeddingStatus" "EmbeddingStatus" NOT NULL DEFAULT 'NONE',
	ADD COLUMN IF NOT EXISTS "embeddingQueuedAt" TIMESTAMP(3),
	ADD COLUMN IF NOT EXISTS "embeddingUpdatedAt" TIMESTAMP(3),
	ADD COLUMN IF NOT EXISTS "lastEditedAt" TIMESTAMP(3);

ALTER TABLE "users"
	ADD COLUMN IF NOT EXISTS "lastEmbeddingRequestAt" TIMESTAMP(3),
	ADD COLUMN IF NOT EXISTS "embeddingRequestsToday" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "notes" DROP COLUMN IF EXISTS "embeddedAt";
ALTER TABLE "notes" DROP COLUMN IF EXISTS "vectorUpdatedAt";

CREATE TABLE IF NOT EXISTS "embedding_queue_items" (
	"id" TEXT NOT NULL,
	"noteId" TEXT NOT NULL,
	"userId" TEXT NOT NULL,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"status" "QueueItemStatus" NOT NULL DEFAULT 'PENDING',
	"attempts" INTEGER NOT NULL DEFAULT 0,
	"tokensUsed" INTEGER,
	"lastError" TEXT,
	CONSTRAINT "embedding_queue_items_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'embedding_queue_items_noteId_fkey'
	) THEN
		ALTER TABLE "embedding_queue_items"
			ADD CONSTRAINT "embedding_queue_items_noteId_fkey"
			FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
	END IF;
END $$;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'embedding_queue_items_userId_fkey'
	) THEN
		ALTER TABLE "embedding_queue_items"
			ADD CONSTRAINT "embedding_queue_items_userId_fkey"
			FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
	END IF;
END $$;

CREATE INDEX IF NOT EXISTS "embedding_queue_items_status_createdAt_idx"
	ON "embedding_queue_items" ("status", "createdAt");

CREATE INDEX IF NOT EXISTS "embedding_queue_items_noteId_status_createdAt_idx"
	ON "embedding_queue_items" ("noteId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "embedding_queue_items_userId_createdAt_idx"
	ON "embedding_queue_items" ("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "notes_embedding_hnsw"
	ON "notes" USING hnsw ("embedding" vector_cosine_ops);
