import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createAdminClient } from "@/lib/supabase/server"
import { ensureDbReady } from "@/lib/dbInit"

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  await ensureDbReady(prisma)

  const file = await prisma.file.findUnique({
    where: { id },
    include: {
      note: {
        include: {
          workspace: {
            select: { userId: true },
          },
        },
      },
    },
  })

  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Allow deletion by file owner or workspace owner
  const isOwner = file.userId === session.user.id
  const isWorkspaceOwner = file.note?.workspace?.userId === session.user.id

  if (!isOwner && !isWorkspaceOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const supabase = createAdminClient()

  try {
    // Remove from storage
    const { error: removeError } = await supabase.storage.from("stacknote-files").remove([file.path])
    if (removeError) {
      // Log and continue to attempt DB cleanup
      console.error("Supabase remove error:", removeError)
    }

    // Delete DB record
    const deleted = await prisma.file.delete({ where: { id } })
    console.log("Deleted file record:", deleted.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 })
  }
}
