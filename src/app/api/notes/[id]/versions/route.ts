import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NOTE_VERSION_LIMIT } from "@/lib/note-versioning"
import { autosaveNoteContent, createNoteVersion } from "@/lib/note-server"

async function getAuthorizedNote(noteId: string, userId: string) {
  const note = await prisma.note.findFirst({
    where: {
      id: noteId,
      workspace: {
        userId,
      },
    },
    select: {
      id: true,
      title: true,
      content: true,
      updatedAt: true,
      emoji: true,
      coverImage: true,
      coverImageMeta: true,
    },
  })

  if (!note) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  return { note }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const access = await getAuthorizedNote(id, session.user.id)
  if ("error" in access) {
    return access.error
  }

  const versions = await prisma.noteVersion.findMany({
    where: { noteId: id },
    orderBy: { createdAt: "desc" },
    take: NOTE_VERSION_LIMIT,
    select: {
      id: true,
      createdAt: true,
      manual: true,
      label: true,
    },
  })

  return NextResponse.json({
    noteId: id,
    versions,
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const access = await getAuthorizedNote(id, session.user.id)
  if ("error" in access) {
    return access.error
  }

  const body = await req.json()
  const manual = body?.manual
  const label = typeof body?.label === "string" && body.label.trim().length > 0
    ? body.label.trim()
    : undefined

  if (typeof manual !== "boolean") {
    return NextResponse.json({ error: "manual is required" }, { status: 400 })
  }

  const result = await prisma.$transaction(async (tx) => {
    const sourceContent = body?.content !== undefined
      ? body.content
      : access.note.content ?? []

    const autosaved = body?.content !== undefined
      ? await autosaveNoteContent(tx, id, sourceContent)
      : {
          updatedNote: access.note,
          normalizedContent: sourceContent,
        }

    const versionResult = await createNoteVersion(tx, {
      noteId: id,
      content: autosaved.normalizedContent,
      title: autosaved.updatedNote.title ?? null,
      emoji: autosaved.updatedNote.emoji ?? null,
      coverImage: autosaved.updatedNote.coverImage ?? null,
      coverImageMeta: autosaved.updatedNote.coverImageMeta ?? null,
      manual,
      label,
    })

    return {
      autosaved,
      versionResult,
    }
  })

  if (result.versionResult.status === "skipped") {
    if (manual) {
      return NextResponse.json(
        { error: "Version limit reached and no automatic checkpoints can be evicted." },
        { status: 409 },
      )
    }

    return NextResponse.json({
      note: {
        id,
        content: result.autosaved.normalizedContent,
        updatedAt: result.autosaved.updatedNote.updatedAt,
      },
      version: null,
      skipped: true,
    })
  }

  return NextResponse.json({
    note: {
      id,
      content: result.autosaved.normalizedContent,
      updatedAt: result.autosaved.updatedNote.updatedAt,
    },
    version: result.versionResult.version,
    skipped: false,
  })
}
