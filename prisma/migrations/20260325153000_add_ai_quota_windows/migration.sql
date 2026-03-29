CREATE TABLE "ai_quota_windows" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "windowEndsAt" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "flashcardCount" INTEGER NOT NULL DEFAULT 0,
    "audioSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_quota_windows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_quota_windows_userId_category_modelKey_key" ON "ai_quota_windows"("userId", "category", "modelKey");
CREATE INDEX "ai_quota_windows_userId_category_modelKey_windowEndsAt_idx" ON "ai_quota_windows"("userId", "category", "modelKey", "windowEndsAt");

ALTER TABLE "ai_quota_windows"
ADD CONSTRAINT "ai_quota_windows_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
