import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ensureDbReady } from "@/lib/dbInit"
import { getUsageStats } from "@/lib/rate-limit"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await ensureDbReady(prisma)
    const stats = await getUsageStats(session.user.id)

    return NextResponse.json(stats)
  } catch (error) {
    console.error("Failed to load AI usage stats:", error)
    return NextResponse.json(
      { error: "Failed to load AI usage stats" },
      { status: 500 }
    )
  }
}
