import { PrismaClient } from "@/generated/prisma/client"

let dbReadyPromise: Promise<void> | null = null;

async function ensureFilesSchema(prisma: PrismaClient) {
	// Create files table if missing
	await prisma.$executeRawUnsafe(
		`CREATE TABLE IF NOT EXISTS "files" (
      "id" TEXT NOT NULL,
      "noteId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "mimeType" TEXT NOT NULL,
      "size" INTEGER NOT NULL,
      "path" TEXT NOT NULL,
      "url" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "files_pkey" PRIMARY KEY ("id")
    );`,
	);

	// Add foreign keys for files if not present
	await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'files_noteId_fkey') THEN
        ALTER TABLE "files" ADD CONSTRAINT "files_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'files_userId_fkey') THEN
        ALTER TABLE "files" ADD CONSTRAINT "files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END$$;
  `);
}

async function ensureAiSchema(prisma: PrismaClient) {
	await prisma.$executeRawUnsafe(
		`CREATE TABLE IF NOT EXISTS "ai_usage" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "date" TEXT NOT NULL,
      "textTokens" INTEGER NOT NULL DEFAULT 0,
      "sttMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "messageCount" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
    );`,
	);

	await prisma.$executeRawUnsafe(
		`CREATE TABLE IF NOT EXISTS "ai_messages" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "sessionId" TEXT,
      "noteId" TEXT,
      "role" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "model" TEXT NOT NULL,
      "tokensUsed" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
    );`,
	);
  await prisma.$executeRawUnsafe(`ALTER TABLE "ai_messages" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;`);

	await prisma.$executeRawUnsafe(
		`CREATE TABLE IF NOT EXISTS "ai_chat_sessions" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "workspaceId" TEXT NOT NULL,
      "noteId" TEXT,
      "title" TEXT NOT NULL DEFAULT 'New chat',
      "contextNoteIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      "lastMessageAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ai_chat_sessions_pkey" PRIMARY KEY ("id")
    );`,
	);
  await prisma.$executeRawUnsafe(`ALTER TABLE "ai_chat_sessions" ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT 'New chat';`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "ai_chat_sessions" ADD COLUMN IF NOT EXISTS "contextNoteIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "ai_chat_sessions" ADD COLUMN IF NOT EXISTS "lastMessageAt" TIMESTAMP(3);`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "ai_chat_sessions" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "ai_chat_sessions" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`);

	await prisma.$executeRawUnsafe(
		`CREATE TABLE IF NOT EXISTS "flashcard_decks" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "noteId" TEXT,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "cardCount" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "flashcard_decks_pkey" PRIMARY KEY ("id")
    );`,
	);

	await prisma.$executeRawUnsafe(
		`CREATE TABLE IF NOT EXISTS "flashcards" (
      "id" TEXT NOT NULL,
      "deckId" TEXT NOT NULL,
      "front" TEXT NOT NULL,
      "back" TEXT NOT NULL,
      "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "reps" INTEGER NOT NULL DEFAULT 0,
      "lapses" INTEGER NOT NULL DEFAULT 0,
      "state" INTEGER NOT NULL DEFAULT 0,
      "dueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "flashcards_pkey" PRIMARY KEY ("id")
    );`,
	);

	await prisma.$executeRawUnsafe(
		`CREATE TABLE IF NOT EXISTS "user_settings" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "preferredTextModel" TEXT NOT NULL DEFAULT 'openai/gpt-oss-120b',
        "preferredSttModel" TEXT NOT NULL DEFAULT 'whisper-large-v3',
        CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
      );`,
	);
	await prisma.$executeRawUnsafe(
		`CREATE TABLE IF NOT EXISTS "ai_quota_windows" (
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
    );`,
	);

	await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ai_usage_userId_date_key" ON "ai_usage"("userId", "date");`);
	await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "user_settings_userId_key" ON "user_settings"("userId");`);
	await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ai_quota_windows_userId_category_modelKey_key" ON "ai_quota_windows"("userId", "category", "modelKey");`);
	await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ai_quota_windows_userId_category_modelKey_windowEndsAt_idx" ON "ai_quota_windows"("userId", "category", "modelKey", "windowEndsAt");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ai_messages_sessionId_idx" ON "ai_messages"("sessionId");`);
	await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ai_messages_sessionId_createdAt_idx" ON "ai_messages"("sessionId", "createdAt");`);
	await prisma.$executeRawUnsafe(
		`CREATE INDEX IF NOT EXISTS "ai_chat_sessions_userId_workspaceId_noteId_lastMessageAt_idx" ON "ai_chat_sessions"("userId", "workspaceId", "noteId", "lastMessageAt");`,
	);

	await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_userId_fkey') THEN
        ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_quota_windows_userId_fkey') THEN
        ALTER TABLE "ai_quota_windows" ADD CONSTRAINT "ai_quota_windows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_messages_userId_fkey') THEN
        ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_messages_sessionId_fkey') THEN
        ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ai_chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_messages_noteId_fkey') THEN
        ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_chat_sessions_userId_fkey') THEN
        ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_chat_sessions_workspaceId_fkey') THEN
        ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_chat_sessions_noteId_fkey') THEN
        ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flashcard_decks_userId_fkey') THEN
        ALTER TABLE "flashcard_decks" ADD CONSTRAINT "flashcard_decks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flashcard_decks_noteId_fkey') THEN
        ALTER TABLE "flashcard_decks" ADD CONSTRAINT "flashcard_decks_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flashcards_deckId_fkey') THEN
        ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "flashcard_decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_settings_userId_fkey') THEN
        ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END$$;
  `);
}

async function ensureNotesSchema(prisma: PrismaClient) {
	// Ensure search_vector column exists on notes
	await prisma.$executeRawUnsafe(`ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;`);
	await prisma.$executeRawUnsafe(`ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "coverImageMeta" JSONB;`);

	await prisma.$executeRawUnsafe(`ALTER TABLE "note_versions" ADD COLUMN IF NOT EXISTS "manual" BOOLEAN NOT NULL DEFAULT false;`);
	await prisma.$executeRawUnsafe(`ALTER TABLE "note_versions" ADD COLUMN IF NOT EXISTS "label" TEXT;`);

	// Create GIN index if missing
	await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "notes_search_idx" ON "notes" USING GIN ("search_vector");`);
	await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "note_versions_noteId_createdAt_idx" ON "note_versions"("noteId", "createdAt");`);

	// Create or replace trigger function for updating search_vector
	await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION update_notes_search_vector()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.content::text, '')), 'B');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

	// Create trigger if not exists
	await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'notes_search_vector_update') THEN
        CREATE TRIGGER notes_search_vector_update
        BEFORE INSERT OR UPDATE ON "notes"
        FOR EACH ROW
        EXECUTE FUNCTION update_notes_search_vector();
      END IF;
    END$$;
  `);

	// Backfill existing rows (idempotent)
	await prisma.$executeRawUnsafe(`
    UPDATE "notes"
    SET "search_vector" =
      setweight(to_tsvector('english', COALESCE("title", '')), 'A') ||
      setweight(to_tsvector('english', COALESCE("content"::text, '')), 'B')
    WHERE "search_vector" IS NULL;
  `);
}

async function ensureGuestSchema(prisma: PrismaClient) {
	await prisma.$executeRawUnsafe(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isGuest" BOOLEAN NOT NULL DEFAULT false;`);
	await prisma.$executeRawUnsafe(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "guestLastActiveAt" TIMESTAMP(3);`);
	await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "users_isGuest_guestLastActiveAt_idx" ON "users"("isGuest", "guestLastActiveAt");`);
}

async function ensureDbReadyInternal(prisma: PrismaClient) {
	await ensureFilesSchema(prisma);
	await ensureAiSchema(prisma);
	await ensureNotesSchema(prisma);
	await ensureGuestSchema(prisma);
}

export async function ensureDbReady(prisma: PrismaClient) {
	if (dbReadyPromise) {
		return dbReadyPromise;
	}

	dbReadyPromise = ensureDbReadyInternal(prisma).catch((error) => {
		dbReadyPromise = null;
		throw error;
	});

	return dbReadyPromise;
}

export default ensureDbReady;
