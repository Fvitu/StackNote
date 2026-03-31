import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { invalidateWorkspaceTree } from "@/lib/server-data"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { workspaceId, parentId, name } = body

  if (!workspaceId || !name) {
    return NextResponse.json({ error: "workspaceId and name are required" }, { status: 400 })
  }

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
  })

  if (!workspace) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const maxOrder = await prisma.folder.aggregate({
    where: { workspaceId, parentId: parentId ?? null },
    _max: { order: true },
  })

  const folder = await prisma.folder.create({
    data: {
      name,
      workspaceId,
      parentId: parentId ?? null,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  })

  await invalidateWorkspaceTree(session.user.id, workspaceId)

  return NextResponse.json(folder, { status: 201 })
}
