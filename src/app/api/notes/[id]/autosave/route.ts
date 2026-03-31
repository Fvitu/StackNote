import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { autosaveNoteContent } from "@/lib/note-server"

async function getAuthorizedNote(noteId: string, userId: string) {
  const note = await prisma.note.findFirst({
    where: {
      id: noteId,
      workspace: {
        userId,
      },
    },
    select: { id: true },
  })

  if (!note) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  return { note }
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
  if (body?.content === undefined) {
    return NextResponse.json({ error: "content is required" }, { status: 400 })
  }

  const result = await prisma.$transaction(async (tx) => {
    return autosaveNoteContent(tx, id, body.content)
  })

  return NextResponse.json({
    id,
    content: result.normalizedContent,
    updatedAt: result.updatedNote.updatedAt,
  })
}
