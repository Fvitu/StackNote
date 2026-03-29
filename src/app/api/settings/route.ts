import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ensureDbReady } from "@/lib/dbInit"
import {
  isValidTextModel,
  isValidSttModel,
  resolveTextModel,
  resolveSttModel,
} from "@/lib/groq-models"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await ensureDbReady(prisma)

    const settings = await prisma.userSettings.findUnique({
      where: { userId: session.user.id },
    })

    return NextResponse.json({
      preferredTextModel: resolveTextModel(undefined, settings?.preferredTextModel),
      preferredSttModel: resolveSttModel(undefined, settings?.preferredSttModel),
    })
  } catch (error) {
    console.error("Failed to load user settings:", error)
    return NextResponse.json(
      { error: "Failed to load user settings" },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await ensureDbReady(prisma)

    let body: { preferredTextModel?: string; preferredSttModel?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const { preferredTextModel, preferredSttModel } = body

    // Validate models if provided
    if (preferredTextModel && !isValidTextModel(preferredTextModel)) {
      return NextResponse.json({ error: "Invalid text model" }, { status: 400 })
    }

    if (preferredSttModel && !isValidSttModel(preferredSttModel)) {
      return NextResponse.json({ error: "Invalid STT model" }, { status: 400 })
    }

    const data: { preferredTextModel?: string; preferredSttModel?: string } = {}
    if (preferredTextModel) data.preferredTextModel = preferredTextModel
    if (preferredSttModel) data.preferredSttModel = preferredSttModel

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
    }

    const settings = await prisma.userSettings.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        ...data,
      },
      update: data,
    })

    return NextResponse.json({
      preferredTextModel: settings.preferredTextModel,
      preferredSttModel: settings.preferredSttModel,
    })
  } catch (error) {
    console.error("Failed to update user settings:", error)
    return NextResponse.json(
      { error: "Failed to update user settings" },
      { status: 500 }
    )
  }
}
