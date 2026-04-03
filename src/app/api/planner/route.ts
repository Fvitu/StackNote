import { NextRequest, NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

interface CreateExamRequest {
  title?: string
  subject?: string
  examDate?: string
  deckIds?: string[]
  noteIds?: string[]
  dailyStudyMinutes?: number
}

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function parseDateKeyToUtcDate(value: string) {
  const match = DATE_KEY_PATTERN.exec(value)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsedDate = new Date(Date.UTC(year, month - 1, day))

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    return null
  }

  return parsedDate
}

function toDateKeyFromDate(value: Date) {
  const timeValue = value.getTime()
  if (!Number.isFinite(timeValue)) {
    return null
  }

  return new Date(timeValue).toISOString().slice(0, 10)
}

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const todayKey = todayString()
  const todayUtc = new Date(`${todayKey}T00:00:00.000Z`)

  const [decks, exams, todaysPlanDays] = await Promise.all([
    prisma.flashcardDeck.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        cardCount: true,
      },
    }),
    prisma.exam.findMany({
      where: {
        userId: session.user.id,
        isCompleted: false,
        examDate: {
          gte: todayUtc,
        },
      },
      include: {
        studyPlanDays: {
          orderBy: { date: "asc" },
        },
      },
      orderBy: { examDate: "asc" },
    }),
    prisma.studyPlanDay.findMany({
      where: {
        date: todayKey,
        exam: {
          userId: session.user.id,
          isCompleted: false,
        },
      },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            deckIds: true,
          },
        },
      },
      orderBy: { estimatedMinutes: "desc" },
    }),
  ])

  const serializedExams = exams.flatMap((exam) => {
    const examDateKey = toDateKeyFromDate(exam.examDate)
    if (!examDateKey) {
      // Keep planner available even if a legacy row has an invalid timestamp.
      console.error("[planner] Skipping exam with invalid examDate", { examId: exam.id })
      return []
    }

    return [
      {
        ...exam,
        examDate: examDateKey,
      },
    ]
  })

  return NextResponse.json({
    decks,
    exams: serializedExams,
    todaysPlan: todaysPlanDays.map((planDay) => ({
      id: planDay.id,
      examId: planDay.examId,
      examTitle: planDay.exam.title,
      date: planDay.date,
      cardIds: planDay.cardIds,
      estimatedMinutes: planDay.estimatedMinutes,
    })),
  })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: CreateExamRequest
  try {
    body = (await request.json()) as CreateExamRequest
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const title = body.title?.trim()
  const examDate = body.examDate?.trim()
  const deckIds = Array.isArray(body.deckIds) ? body.deckIds.filter(Boolean) : []
  const noteIds = Array.isArray(body.noteIds) ? body.noteIds.filter(Boolean) : []

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 })
  }

  if (!examDate) {
    return NextResponse.json({ error: "Exam date is required" }, { status: 400 })
  }

  const parsedExamDate = parseDateKeyToUtcDate(examDate)
  if (!parsedExamDate) {
    return NextResponse.json({ error: "Exam date must use YYYY-MM-DD format" }, { status: 400 })
  }

  const todayUtc = parseDateKeyToUtcDate(todayString())
  if (todayUtc && parsedExamDate.getTime() < todayUtc.getTime()) {
    return NextResponse.json({ error: "Exam date must be today or later" }, { status: 400 })
  }

  if (deckIds.length === 0) {
    return NextResponse.json({ error: "Select at least one deck" }, { status: 400 })
  }

  const accessibleDecks = await prisma.flashcardDeck.findMany({
    where: {
      id: { in: deckIds },
      userId: session.user.id,
    },
    select: { id: true },
  })

  if (accessibleDecks.length !== deckIds.length) {
    return NextResponse.json({ error: "One or more decks are not accessible" }, { status: 403 })
  }

  const exam = await prisma.exam.create({
    data: {
      userId: session.user.id,
      title,
      subject: body.subject?.trim() || null,
      examDate: parsedExamDate,
      deckIds,
      noteIds,
      dailyStudyMinutes: Math.min(60, Math.max(10, Math.round(body.dailyStudyMinutes ?? 20))),
    },
  })

  return NextResponse.json({ exam })
}
