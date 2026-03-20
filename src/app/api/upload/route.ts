import { NextRequest, NextResponse } from "next/server"
import { nanoid } from "nanoid"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ensureDbReady } from "@/lib/dbInit"
import { createAdminClient } from "@/lib/supabase/server"
import { getFileExtension, isMediaType } from "@/lib/media"

const BUCKET_NAME = "stacknote-files"
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get("file")
  const noteId = formData.get("noteId")
  const type = formData.get("type")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 })
  }

  if (typeof noteId !== "string" || noteId.length === 0) {
    return NextResponse.json({ error: "noteId is required" }, { status: 400 })
  }

  if (typeof type !== "string" || !isMediaType(type)) {
    return NextResponse.json({ error: "Invalid media type" }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 400 })
  }

  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: {
      id: true,
      workspace: {
        select: {
          userId: true,
        },
      },
    },
  })

  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 })
  }

  if (note.workspace.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const extension = getFileExtension(file.name)
  const filePath = `${session.user.id}/${noteId}/${nanoid()}.${extension}`

  const supabase = createAdminClient()
  const buffer = new Uint8Array(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(filePath, 60 * 60 * 24 * 7)

  if (signedError || !signedData?.signedUrl) {
    return NextResponse.json({ error: signedError?.message ?? "Failed to create signed URL" }, { status: 500 })
  }

  await ensureDbReady(prisma)

  const saved = await prisma.file.create({
    data: {
      noteId,
      userId: session.user.id,
      name: file.name,
      type,
      mimeType: file.type,
      size: file.size,
      path: filePath,
      url: signedData.signedUrl,
    },
  })

  return NextResponse.json({
    url: signedData.signedUrl,
    fileId: saved.id,
    filePath,
    type,
    name: file.name,
    size: file.size,
    mimeType: file.type,
  })
}
