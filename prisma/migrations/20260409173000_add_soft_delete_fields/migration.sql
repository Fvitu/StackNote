ALTER TABLE "folders"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "originalParentId" TEXT;

ALTER TABLE "notes"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "originalParentId" TEXT;

CREATE INDEX "folders_workspaceId_deletedAt_idx" ON "folders"("workspaceId", "deletedAt");
CREATE INDEX "folders_parentId_deletedAt_idx" ON "folders"("parentId", "deletedAt");
CREATE INDEX "notes_workspaceId_deletedAt_idx" ON "notes"("workspaceId", "deletedAt");
CREATE INDEX "notes_folderId_deletedAt_idx" ON "notes"("folderId", "deletedAt");
