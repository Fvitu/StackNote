import { NextRequest, NextResponse } from "next/server"
import { nanoid } from "nanoid"
import { Prisma } from "@/generated/prisma/client"
import { auth } from "@/lib/auth"
import { ensureDbReady } from "@/lib/dbInit"
import { prisma } from "@/lib/prisma"
import { getFileExtension } from "@/lib/media"
import { createAdminClient } from "@/lib/supabase/server"
import { isValidHttpUrl, parseNoteCoverMeta, type NoteCoverMeta } from "@/lib/note-cover"

const BUCKET_NAME = "stacknote-files"
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024

function serializeCoverMeta(meta: NoteCoverMeta | null): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (!meta) {
    return Prisma.DbNull
  }

  return meta as unknown as Prisma.InputJsonValue
}

async function getAuthorizedNote(noteId: string, userId: string) {
  await ensureDbReady(prisma)

  const note = await prisma.note.findUnique({
    where: { id: noteId },
    include: {
      workspace: {
        select: {
          userId: true,
        },
      },
    },
  })

  if (!note) {
    return { error: NextResponse.json({ error: "Note not found" }, { status: 404 }) }
  }

  if (note.workspace.userId !== userId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  return { note }
}

async function cleanupUploadedCover(meta: NoteCoverMeta | null) {
  if (!meta || meta.source !== "upload") {
    return
  }

  const supabase = createAdminClient()

  const [removeResult, deleteResult] = await Promise.allSettled([
    supabase.storage.from(BUCKET_NAME).remove([meta.filePath]),
    prisma.file.deleteMany({ where: { id: meta.fileId } }),
  ])

  if (removeResult.status === "fulfilled" && removeResult.value.error) {
    console.error("Failed to remove cover image from storage:", removeResult.value.error)
  }

  if (deleteResult.status === "rejected") {
    console.error("Failed to remove cover image file record:", deleteResult.reason)
  }
}

async function trackUnsplashDownload(downloadLocation: string) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY
  if (!accessKey || !isValidHttpUrl(downloadLocation)) {
    return
  }

  try {
    await fetch(downloadLocation, {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        "Accept-Version": "v1",
      },
      cache: "no-store",
    })
  } catch (error) {
    console.error("Failed to track Unsplash download:", error)
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const authorized = await getAuthorizedNote(id, session.user.id)
  if ("error" in authorized) {
    return authorized.error
  }

  const previousCoverMeta = parseNoteCoverMeta(authorized.note.coverImageMeta)

  const formData = await request.formData()
  const file = formData.get("file")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 })
  }

  if (!file.type.toLowerCase().startsWith("image/")) {
    return NextResponse.json({ error: "Cover images must be image files" }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 400 })
  }

  const extension = getFileExtension(file.name)
  const filePath = `${session.user.id}/${id}/cover-${nanoid()}.${extension}`

  const supabase = createAdminClient()
  const buffer = new Uint8Array(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(filePath, buffer, {
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
    await supabase.storage.from(BUCKET_NAME).remove([filePath]).catch(() => undefined)
    return NextResponse.json({ error: signedError?.message ?? "Failed to create signed URL" }, { status: 500 })
  }

  let savedFileId: string | null = null

  try {
    const savedFile = await prisma.file.create({
      data: {
        noteId: id,
        userId: session.user.id,
        name: file.name,
        type: "image",
        mimeType: file.type,
        size: file.size,
        path: filePath,
        url: signedData.signedUrl,
      },
    })

    savedFileId = savedFile.id

    const nextCoverMeta: NoteCoverMeta = {
      source: "upload",
      fileId: savedFile.id,
      filePath,
      mimeType: file.type,
      size: file.size,
      name: file.name,
      positionX: 50,
      positionY: 50,
    }

    const updated = await prisma.note.update({
      where: { id },
      data: {
        coverImage: signedData.signedUrl,
        coverImageMeta: serializeCoverMeta(nextCoverMeta),
      },
    })

    if (previousCoverMeta?.source === "upload" && previousCoverMeta.fileId !== savedFile.id) {
      await cleanupUploadedCover(previousCoverMeta)
    }

    return NextResponse.json({
      coverImage: updated.coverImage,
      coverImageMeta: updated.coverImageMeta,
      updatedAt: updated.updatedAt,
    })
  } catch (error) {
    console.error("Failed to save uploaded cover:", error)

    await supabase.storage.from(BUCKET_NAME).remove([filePath]).catch(() => undefined)

    if (savedFileId) {
      await prisma.file.deleteMany({ where: { id: savedFileId } }).catch(() => undefined)
    }

    return NextResponse.json({ error: "Failed to save uploaded cover" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const authorized = await getAuthorizedNote(id, session.user.id)
  if ("error" in authorized) {
    return authorized.error
  }

  const previousCoverMeta = parseNoteCoverMeta(authorized.note.coverImageMeta)

  const body = (await request.json().catch(() => null)) as
    | {
        coverImage?: unknown
        coverImageMeta?: unknown
        downloadLocation?: unknown
      }
    | null

  const coverImage = body?.coverImage
  const nextCoverMeta = parseNoteCoverMeta(body?.coverImageMeta)

  if (coverImage !== null && typeof coverImage !== "string") {
    return NextResponse.json({ error: "coverImage must be a string or null" }, { status: 400 })
  }

  if (typeof coverImage === "string" && !isValidHttpUrl(coverImage)) {
    return NextResponse.json({ error: "coverImage must be a valid URL" }, { status: 400 })
  }

  if (coverImage !== null && !nextCoverMeta) {
    return NextResponse.json({ error: "coverImageMeta is required when setting a cover" }, { status: 400 })
  }

  if (nextCoverMeta?.source === "unsplash") {
    await trackUnsplashDownload(typeof body?.downloadLocation === "string" ? body.downloadLocation : "")
  }

  const updated = await prisma.note.update({
    where: { id },
    data: {
      coverImage: typeof coverImage === "string" ? coverImage : null,
      coverImageMeta: serializeCoverMeta(nextCoverMeta),
    },
  })

  const shouldCleanupPreviousUpload =
    previousCoverMeta?.source === "upload" &&
    (
      !nextCoverMeta ||
      nextCoverMeta.source !== "upload" ||
      nextCoverMeta.fileId !== previousCoverMeta.fileId
    )

  if (shouldCleanupPreviousUpload) {
    await cleanupUploadedCover(previousCoverMeta)
  }

  return NextResponse.json({
    coverImage: updated.coverImage,
    coverImageMeta: updated.coverImageMeta,
    updatedAt: updated.updatedAt,
  })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const authorized = await getAuthorizedNote(id, session.user.id)
  if ("error" in authorized) {
    return authorized.error
  }

  const previousCoverMeta = parseNoteCoverMeta(authorized.note.coverImageMeta)

  const updated = await prisma.note.update({
    where: { id },
    data: {
      coverImage: null,
      coverImageMeta: Prisma.DbNull,
    },
  })

  await cleanupUploadedCover(previousCoverMeta)

  return NextResponse.json({
    coverImage: updated.coverImage,
    coverImageMeta: updated.coverImageMeta,
    updatedAt: updated.updatedAt,
  })
}
