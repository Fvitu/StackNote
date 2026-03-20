import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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
  const { name } = body

  const folder = await prisma.folder.findUnique({
    where: { id },
    include: { workspace: { select: { userId: true } } },
  })

  if (!folder) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (folder.workspace.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const updated = await prisma.folder.update({
    where: { id },
    data: { name },
  })

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

  const folder = await prisma.folder.findUnique({
    where: { id },
    include: { workspace: { select: { userId: true } } },
  })

  if (!folder) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (folder.workspace.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.folder.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
