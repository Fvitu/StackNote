-- Remove Voyage embeddings and queue artifacts
DROP INDEX IF EXISTS "notes_embedding_hnsw";
DROP INDEX IF EXISTS "notes_embedding_idx";

DROP TABLE IF EXISTS "embedding_queue_items";

ALTER TABLE "users"
  DROP COLUMN IF EXISTS "lastEmbeddingRequestAt",
  DROP COLUMN IF EXISTS "embeddingRequestsToday";

ALTER TABLE "notes"
  DROP COLUMN IF EXISTS "embedding",
  DROP COLUMN IF EXISTS "embeddingModel",
  DROP COLUMN IF EXISTS "embeddingStatus",
  DROP COLUMN IF EXISTS "embeddingQueuedAt",
  DROP COLUMN IF EXISTS "embeddingUpdatedAt",
  DROP COLUMN IF EXISTS "vectorUpdatedAt";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmbeddingStatus') THEN
    DROP TYPE "EmbeddingStatus";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QueueItemStatus') THEN
    DROP TYPE "QueueItemStatus";
  END IF;
END $$;
