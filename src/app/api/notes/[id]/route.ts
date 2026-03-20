import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const note = await prisma.note.findUnique({
    where: { id },
    include: { workspace: { select: { userId: true, name: true } }, folder: { select: { name: true } } },
  })

  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (note.workspace.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return NextResponse.json(note)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const { title, content, folderId, emoji } = body

  const note = await prisma.note.findUnique({
    where: { id },
    include: { workspace: { select: { userId: true } } },
  })

  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (note.workspace.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const data: Record<string, unknown> = {}
  if (title !== undefined) data.title = title
  if (content !== undefined) data.content = content
  if (folderId !== undefined) data.folderId = folderId
  if (emoji !== undefined) data.emoji = emoji

  const updated = await prisma.note.update({
    where: { id },
    data,
  })

  // Save version snapshot if content changed
  if (content !== undefined) {
    await prisma.noteVersion.create({
      data: {
        noteId: id,
        content,
      },
    })
  }

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const note = await prisma.note.findUnique({
    where: { id },
    include: { workspace: { select: { userId: true } } },
  })

  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (note.workspace.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.note.update({
    where: { id },
    data: { isArchived: true },
  })

  return NextResponse.json({ success: true })
}
