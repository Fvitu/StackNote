CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "notes"
ADD COLUMN IF NOT EXISTS "embedding" vector(768),
ADD COLUMN IF NOT EXISTS "embeddedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "notes_embedding_idx" ON "notes" USING hnsw ("embedding" vector_cosine_ops) WHERE "embedding" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "notes_updated_idx" ON "notes" ("workspaceId", "updatedAt" DESC) WHERE "isArchived" = false;
CREATE INDEX IF NOT EXISTS "folders_workspace_idx" ON "folders" ("workspaceId");
CREATE INDEX IF NOT EXISTS "flashcards_due_idx" ON "flashcards" ("deckId", "dueDate");
