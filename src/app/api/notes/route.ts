import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ensureDbReady } from "@/lib/dbInit"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await ensureDbReady(prisma)

  const body = await req.json()
  const { workspaceId, folderId } = body

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 })
  }

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
  })

  if (!workspace) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const maxOrder = await prisma.note.aggregate({
    where: { workspaceId, folderId: folderId ?? null },
    _max: { order: true },
  })

  const note = await prisma.note.create({
    data: {
      workspaceId,
      folderId: folderId ?? null,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  })

  return NextResponse.json(note, { status: 201 })
}
