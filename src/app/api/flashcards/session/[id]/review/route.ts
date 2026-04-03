import { NextRequest, NextResponse } from "next/server"

import type { FSRSCard, Rating } from "@/lib/fsrs"
import { scheduleCard } from "@/lib/fsrs"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

interface ReviewRequest {
  cardId?: string
  rating?: Rating
  timeMs?: number
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params

  let body: ReviewRequest
  try {
    body = (await request.json()) as ReviewRequest
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  if (!body.cardId || body.rating === undefined || body.timeMs === undefined) {
    return NextResponse.json({ error: "cardId, rating, and timeMs are required" }, { status: 400 })
  }

  if (![1, 2, 3, 4].includes(body.rating)) {
    return NextResponse.json({ error: "rating must be between 1 and 4" }, { status: 400 })
  }

  const cardId = body.cardId
  const rating = body.rating
  const timeMs = Math.max(0, Math.round(body.timeMs))

  const studySession = await prisma.studySession.findFirst({
    where: {
      id,
      userId: session.user.id,
    },
  })

  if (!studySession) {
    return NextResponse.json({ error: "Study session not found" }, { status: 404 })
  }

  const card = await prisma.flashcard.findFirst({
    where: {
      id: cardId,
      deck: {
        userId: session.user.id,
      },
    },
  })

  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 })
  }

  const scheduled = scheduleCard(
    {
      stability: card.stability,
      difficulty: card.difficulty,
      reps: card.reps,
      lapses: card.lapses,
      state: card.state as FSRSCard["state"],
      dueDate: card.dueDate,
    },
    rating,
  )

  const updatedCard = await prisma.$transaction(async (tx) => {
    const nextCard = await tx.flashcard.update({
      where: { id: card.id },
      data: {
        stability: scheduled.card.stability,
        difficulty: scheduled.card.difficulty,
        reps: scheduled.card.reps,
        lapses: scheduled.card.lapses,
        state: scheduled.card.state,
        dueDate: scheduled.card.dueDate,
      },
    })

    await tx.cardReview.create({
      data: {
        sessionId: studySession.id,
        cardId: card.id,
        rating,
        timeMs,
      },
    })

    await tx.studySession.update({
      where: { id: studySession.id },
      data: {
        cardsStudied: { increment: 1 },
        cardsCorrect: rating >= 3 ? { increment: 1 } : undefined,
      },
    })

    return nextCard
  })

  return NextResponse.json({
    nextCard: null,
    updatedCard,
    interval: scheduled.interval,
  })
}
