import { NextRequest, NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

interface StartSessionRequest {
  deckId?: string
  cardIds?: string[]
}

function shuffle<T>(items: T[]) {
  const nextItems = [...items]
  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]]
  }
  return nextItems
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: StartSessionRequest
  try {
    body = (await request.json()) as StartSessionRequest
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const cardIds = Array.isArray(body.cardIds) ? body.cardIds.filter(Boolean) : []
  const deckId = body.deckId?.trim()

  if (!deckId && cardIds.length === 0) {
    return NextResponse.json({ error: "deckId or cardIds is required" }, { status: 400 })
  }

  if (cardIds.length > 0) {
    const cards = await prisma.flashcard.findMany({
      where: {
        id: { in: cardIds },
        deck: {
          userId: session.user.id,
        },
      },
      include: {
        deck: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    })

    if (cards.length === 0) {
      return NextResponse.json({ error: "No accessible cards found" }, { status: 404 })
    }

    const primaryDeck = cards[0]?.deck
    if (!primaryDeck) {
      return NextResponse.json({ error: "Deck not found" }, { status: 404 })
    }

    const studySession = await prisma.studySession.create({
      data: {
        userId: session.user.id,
        deckId: primaryDeck.id,
      },
    })

    return NextResponse.json({
      sessionId: studySession.id,
      title: "Today's Session",
      cards: shuffle(cards).map((card) => ({
        id: card.id,
        deckId: card.deckId,
        front: card.front,
        back: card.back,
        stability: card.stability,
        difficulty: card.difficulty,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state,
        dueDate: card.dueDate,
      })),
    })
  }

  const deck = await prisma.flashcardDeck.findFirst({
    where: {
      id: deckId,
      userId: session.user.id,
    },
    include: {
      flashcards: true,
    },
  })

  if (!deck) {
    return NextResponse.json({ error: "Deck not found" }, { status: 404 })
  }

  const dueCards = shuffle(deck.flashcards.filter((card) => card.dueDate.getTime() <= Date.now()))
  const studySession = await prisma.studySession.create({
    data: {
      userId: session.user.id,
      deckId: deck.id,
    },
  })

  return NextResponse.json({
    sessionId: studySession.id,
    title: deck.title,
    cards: dueCards.map((card) => ({
      id: card.id,
      deckId: card.deckId,
      front: card.front,
      back: card.back,
      stability: card.stability,
      difficulty: card.difficulty,
      reps: card.reps,
      lapses: card.lapses,
      state: card.state,
      dueDate: card.dueDate,
    })),
  })
}
