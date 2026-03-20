ALTER TABLE "note_versions"
ADD COLUMN "manual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "label" TEXT;

CREATE INDEX "note_versions_noteId_createdAt_idx"
ON "note_versions"("noteId", "createdAt");
