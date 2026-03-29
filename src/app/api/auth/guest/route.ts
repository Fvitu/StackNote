import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { SESSION_COOKIE_NAME } from "@/lib/auth-cookie"
import { createGuestUserWithWorkspace, scheduleGuestCleanup } from "@/lib/guest-session"

const GUEST_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

function buildSessionToken() {
  return crypto.randomUUID().replace(/-/g, "")
}

export async function POST() {
  try {
    const guestUser = await createGuestUserWithWorkspace()
    const sessionToken = buildSessionToken()
    const expires = new Date(Date.now() + GUEST_SESSION_MAX_AGE_SECONDS * 1000)

    await prisma.session.create({
      data: {
        sessionToken,
        userId: guestUser.id,
        expires,
      },
    })

    void scheduleGuestCleanup()

    const response = NextResponse.json({ success: true })
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      expires,
    })

    return response
  } catch (error) {
    console.error("Guest sign-in failed:", error)
    return NextResponse.json({ error: "Failed to start guest session" }, { status: 500 })
  }
}
