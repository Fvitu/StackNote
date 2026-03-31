import { normalizeBlockNoteContent } from "@/lib/blocknote-normalize"
import { NOTE_VERSION_LIMIT } from "@/lib/note-versioning"
import type { Prisma } from "@/generated/prisma/client"

interface CreateVersionInput {
  noteId: string
  content: unknown
  title?: string | null
  emoji?: string | null
  coverImage?: string | null
  coverImageMeta?: unknown
  manual: boolean
  label?: string
}

type CreateVersionResult =
  | {
      status: "created"
      version: {
        id: string
        createdAt: Date
        manual: boolean
        label: string | null
      }
    }
  | {
      status: "skipped"
      reason: "limit_reached"
    }

export async function updateNoteSearchVector(
  tx: Prisma.TransactionClient,
  noteId: string,
) {
  await tx.$executeRaw`
    UPDATE "notes"
    SET "search_vector" =
      setweight(to_tsvector('english', COALESCE("title", '')), 'A') ||
      setweight(to_tsvector('english', COALESCE("content"::text, '')), 'B')
    WHERE "id" = ${noteId}
  `
}

export async function autosaveNoteContent(
  tx: Prisma.TransactionClient,
  noteId: string,
  content: unknown,
) {
  const normalizedContent = normalizeBlockNoteContent(content) as Prisma.InputJsonValue

  const updatedNote = await tx.note.update({
    where: { id: noteId },
    data: { content: normalizedContent },
  })

  return {
    updatedNote,
    normalizedContent,
  }
}

export async function createNoteVersion(
  tx: Prisma.TransactionClient,
  input: CreateVersionInput,
): Promise<CreateVersionResult> {
  const normalizedContent = normalizeBlockNoteContent(input.content) as Prisma.InputJsonValue
  const versionSnapshot = {
    content: normalizedContent,
    title: input.title ?? null,
    emoji: input.emoji ?? null,
    coverImage: input.coverImage ?? null,
    coverImageMeta: input.coverImageMeta ?? null,
  } as Prisma.InputJsonValue
  const existingVersions = await tx.noteVersion.findMany({
    where: { noteId: input.noteId },
    orderBy: { createdAt: "asc" },
    select: { id: true, manual: true },
  })

  const slotsNeeded = Math.max(0, existingVersions.length - NOTE_VERSION_LIMIT + 1)
  if (slotsNeeded > 0) {
    const idsToDelete = existingVersions
      .filter((version) => !version.manual)
      .slice(0, slotsNeeded)
      .map((version) => version.id)

    if (idsToDelete.length < slotsNeeded) {
      return {
        status: "skipped",
        reason: "limit_reached",
      }
    }

    await tx.noteVersion.deleteMany({
      where: {
        id: {
          in: idsToDelete,
        },
      },
    })
  }

  const version = await tx.noteVersion.create({
    data: {
      noteId: input.noteId,
      content: versionSnapshot,
      manual: input.manual,
      label: input.label,
    },
    select: {
      id: true,
      createdAt: true,
      manual: true,
      label: true,
    },
  })

  return {
    status: "created",
    version,
  }
}
