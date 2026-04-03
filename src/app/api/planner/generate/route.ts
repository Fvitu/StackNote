import { NextRequest, NextResponse } from "next/server"

import type { FSRSCard } from "@/lib/fsrs"
import { predictRetention } from "@/lib/fsrs"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

interface GeneratePlanRequest {
  examId?: string
}

function enumerateDates(startDate: Date, endDate: Date) {
  const dates: Date[] = []
  const current = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()))
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()))

  while (current <= end) {
    dates.push(new Date(current))
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return dates
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function endOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999))
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: GeneratePlanRequest
  try {
    body = (await request.json()) as GeneratePlanRequest
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const examId = body.examId?.trim()
  if (!examId) {
    return NextResponse.json({ error: "examId is required" }, { status: 400 })
  }

  const exam = await prisma.exam.findFirst({
    where: {
      id: examId,
      userId: session.user.id,
    },
  })

  if (!exam) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 })
  }

  const cards = await prisma.flashcard.findMany({
    where: {
      deckId: { in: exam.deckIds },
      deck: { userId: session.user.id },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  })

  const today = new Date()
  const planningDates = enumerateDates(today, exam.examDate)
  const dailyReviewCapacity = Math.max(1, Math.floor((exam.dailyStudyMinutes * 60) / 30))
  const dailyNewCapacity = Math.max(1, Math.floor((exam.dailyStudyMinutes * 60) / 90))
  const unscheduledCardIds = new Set(cards.map((card) => card.id))
  const generatedDays: Array<{
    date: string
    cardIds: string[]
    estimatedMinutes: number
  }> = []

  for (const date of planningDates) {
    const dateKey = toDateKey(date)
    const dateEnd = endOfDay(date)
    const dueCards = cards.filter((card) => unscheduledCardIds.has(card.id) && card.dueDate <= dateEnd)

    const selectedCardIds = dueCards.slice(0, dailyReviewCapacity).map((card) => card.id)
    selectedCardIds.forEach((cardId) => unscheduledCardIds.delete(cardId))

    const remainingCapacity = Math.max(0, dailyNewCapacity - selectedCardIds.length)
    const introductionCandidates = cards
      .filter((card) => unscheduledCardIds.has(card.id))
      .map((card) => {
        const fsrsCard: FSRSCard = {
          stability: card.stability,
          difficulty: card.difficulty,
          reps: card.reps,
          lapses: card.lapses,
          state: card.state as FSRSCard["state"],
          dueDate: card.dueDate,
        }

        const daysUntilExam = Math.max(0, Math.ceil((exam.examDate.getTime() - date.getTime()) / 86_400_000))
        return {
          id: card.id,
          retention: predictRetention(fsrsCard, daysUntilExam),
        }
      })
      .sort((left, right) => left.retention - right.retention)
      .slice(0, remainingCapacity)
      .map((candidate) => candidate.id)

    introductionCandidates.forEach((cardId) => unscheduledCardIds.delete(cardId))

    const cardIds = [...selectedCardIds, ...introductionCandidates]
    const estimatedSeconds = selectedCardIds.length * 30 + introductionCandidates.length * 90
    generatedDays.push({
      date: dateKey,
      cardIds,
      estimatedMinutes: Math.ceil(estimatedSeconds / 60),
    })
  }

  await prisma.$transaction(async (tx) => {
    await tx.studyPlanDay.deleteMany({
      where: { examId: exam.id },
    })

    if (generatedDays.length > 0) {
      await tx.studyPlanDay.createMany({
        data: generatedDays.map((day) => ({
          examId: exam.id,
          date: day.date,
          cardIds: day.cardIds,
          estimatedMinutes: day.estimatedMinutes,
        })),
      })
    }
  })

  const plan = await prisma.studyPlanDay.findMany({
    where: { examId: exam.id },
    orderBy: { date: "asc" },
  })

  return NextResponse.json({ exam, plan })
}

export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: GeneratePlanRequest
  try {
    body = (await request.json()) as GeneratePlanRequest
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const examId = body.examId?.trim()
  if (!examId) {
    return NextResponse.json({ error: "examId is required" }, { status: 400 })
  }

  const exam = await prisma.exam.findFirst({
    where: {
      id: examId,
      userId: session.user.id,
    },
    select: {
      id: true,
    },
  })

  if (!exam) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 })
  }

  await prisma.exam.delete({
    where: {
      id: exam.id,
    },
  })

  return NextResponse.json({ examId: exam.id })
}
