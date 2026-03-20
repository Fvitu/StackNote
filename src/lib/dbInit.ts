import { PrismaClient } from "@/generated/prisma/client"

export async function ensureDbReady(prisma: PrismaClient) {
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
    );`
  )

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
  `)

  // Ensure search_vector column exists on notes
  await prisma.$executeRawUnsafe(`ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "coverImageMeta" JSONB;`)

  // Create GIN index if missing
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "notes_search_idx" ON "notes" USING GIN ("search_vector");`)

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
  `)

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
  `)

  // Backfill existing rows (idempotent)
  await prisma.$executeRawUnsafe(`
    UPDATE "notes"
    SET "search_vector" =
      setweight(to_tsvector('english', COALESCE("title", '')), 'A') ||
      setweight(to_tsvector('english', COALESCE("content"::text, '')), 'B')
    WHERE "search_vector" IS NULL;
  `)
}

export default ensureDbReady;
