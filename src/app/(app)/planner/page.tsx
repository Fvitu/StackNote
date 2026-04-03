"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { StudySession } from "@/components/flashcards/StudySession"
import { ExamCard } from "@/components/planner/ExamCard"
import { NewExamDialog } from "@/components/planner/NewExamDialog"
import { PlannerSkeleton } from "@/components/planner/PlannerSkeleton"
import { TodaysPlan } from "@/components/planner/TodaysPlan"
import { Button } from "@/components/ui/button"

interface DeckOption {
  id: string
  title: string
  cardCount: number
}

interface ExamRecord {
  id: string
  title: string
  subject: string | null
  examDate: string
  deckIds: string[]
  dailyStudyMinutes: number
}

interface TodaysPlanItem {
  id: string
  examId: string
  examTitle: string
  cardIds: string[]
  estimatedMinutes: number
}

interface PlannerPayload {
  decks: DeckOption[]
  exams: ExamRecord[]
  todaysPlan: TodaysPlanItem[]
}

function isPlannerPayload(value: unknown): value is PlannerPayload {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<PlannerPayload>
  return Array.isArray(candidate.decks) && Array.isArray(candidate.exams) && Array.isArray(candidate.todaysPlan)
}

function getApiErrorMessage(value: unknown) {
  if (!value || typeof value !== "object") {
    return null
  }

  const maybeError = (value as { error?: unknown }).error
  return typeof maybeError === "string" && maybeError.trim().length > 0 ? maybeError : null
}

interface StudySessionPayload {
  sessionId: string
  title: string
  cards: Array<{
    id: string
    deckId: string
    front: string
    back: string
    stability: number
    difficulty: number
    reps: number
    lapses: number
    state: 0 | 1 | 2 | 3
    dueDate: string
  }>
}

function isStudySessionPayload(value: unknown): value is StudySessionPayload {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<StudySessionPayload>
  if (typeof candidate.sessionId !== "string" || typeof candidate.title !== "string" || !Array.isArray(candidate.cards)) {
    return false
  }

  return candidate.cards.every((card) => {
    if (!card || typeof card !== "object") {
      return false
    }

    const candidateCard = card as Partial<StudySessionPayload["cards"][number]>
    return (
      typeof candidateCard.id === "string" &&
      typeof candidateCard.deckId === "string" &&
      typeof candidateCard.front === "string" &&
      typeof candidateCard.back === "string" &&
      typeof candidateCard.stability === "number" &&
      typeof candidateCard.difficulty === "number" &&
      typeof candidateCard.reps === "number" &&
      typeof candidateCard.lapses === "number" &&
      [0, 1, 2, 3].includes(candidateCard.state as number) &&
      typeof candidateCard.dueDate === "string"
    )
  })
}

function daysUntil(examDate: string) {
  const examDateKey = examDate.slice(0, 10)
  const target = new Date(`${examDateKey}T00:00:00.000Z`)
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const diff = target.getTime() - today.getTime()
  return Math.max(0, Math.ceil(diff / 86_400_000))
}

export default function PlannerPage() {
  const [payload, setPayload] = useState<PlannerPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [pendingDeletePlan, setPendingDeletePlan] = useState<{ examId: string; title: string } | null>(null)
  const [isDeletingPlan, setIsDeletingPlan] = useState(false)
  const [activeStudySession, setActiveStudySession] = useState<StudySessionPayload | null>(null)

  const refreshPlanner = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/planner", { cache: "no-store" })
      const responseBody = (await response.json().catch(() => null)) as unknown

      if (!response.ok) {
        const apiErrorMessage = getApiErrorMessage(responseBody)
        throw new Error(apiErrorMessage ?? `Failed to load planner (${response.status})`)
      }

      if (!isPlannerPayload(responseBody)) {
        throw new Error("Planner returned an invalid payload")
      }

      setPayload(responseBody)
      setLoadError(null)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load planner")
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshPlanner()
  }, [refreshPlanner])

  const cardCountByDeckId = useMemo(() => {
    return new Map((payload?.decks ?? []).map((deck) => [deck.id, deck.cardCount]))
  }, [payload?.decks])

  async function handleCreateExam(input: {
    title: string
    subject?: string
    examDate: string
    deckIds: string[]
    dailyStudyMinutes: number
  }) {
    setActionError(null)

    const createResponse = await fetch("/api/planner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    const createResponseBody = (await createResponse.json().catch(() => null)) as unknown

    if (!createResponse.ok) {
      const apiErrorMessage = getApiErrorMessage(createResponseBody)
      throw new Error(apiErrorMessage ?? "Failed to create exam")
    }

    const examId =
      createResponseBody &&
      typeof createResponseBody === "object" &&
      "exam" in createResponseBody &&
      createResponseBody.exam &&
      typeof createResponseBody.exam === "object" &&
      "id" in createResponseBody.exam &&
      typeof createResponseBody.exam.id === "string"
        ? createResponseBody.exam.id
        : null

    if (!examId) {
      throw new Error("Planner returned an invalid exam response")
    }

    const generateResponse = await fetch("/api/planner/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ examId }),
    })
    const generateResponseBody = (await generateResponse.json().catch(() => null)) as unknown

    if (!generateResponse.ok) {
      const apiErrorMessage = getApiErrorMessage(generateResponseBody)
      throw new Error(apiErrorMessage ?? "Failed to generate study plan")
    }

    await refreshPlanner()
  }

  async function handleDeletePlan(examId: string) {
    try {
      setActionError(null)
      setIsDeletingPlan(true)
      const response = await fetch("/api/planner/generate", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId }),
      })
      const responseBody = (await response.json().catch(() => null)) as unknown

      if (!response.ok) {
        const apiErrorMessage = getApiErrorMessage(responseBody)
        throw new Error(apiErrorMessage ?? "Failed to delete study plan")
      }

      setPendingDeletePlan(null)
      await refreshPlanner()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to delete study plan")
      console.error(error)
    } finally {
      setIsDeletingPlan(false)
    }
  }

  async function startCombinedSession(cardIds: string[]) {
    const uniqueCardIds = Array.from(new Set(cardIds.filter((cardId) => cardId.trim().length > 0)))
    if (uniqueCardIds.length === 0) {
      setActionError("There are no cards scheduled for this session yet.")
      return
    }

    try {
      setActionError(null)
      const response = await fetch("/api/flashcards/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds: uniqueCardIds }),
      })
      const responseBody = (await response.json().catch(() => null)) as unknown

      if (!response.ok) {
        const apiErrorMessage = getApiErrorMessage(responseBody)
        throw new Error(apiErrorMessage ?? "Failed to start study session")
      }

      if (!isStudySessionPayload(responseBody)) {
        throw new Error("Study session returned an invalid payload")
      }

      setActiveStudySession(responseBody)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to start study session")
      console.error(error)
    }
  }

  if (isLoading && !payload) {
    return <PlannerSkeleton />
  }

  if (!payload && loadError) {
    return (
      <div className="flex h-full min-w-0 items-center justify-center px-6 text-center" style={{ backgroundColor: "var(--bg-app)" }}>
        <div className="max-w-lg space-y-4 rounded-[24px] border px-6 py-6" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
          <p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Failed to load planner
          </p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {loadError}
          </p>
          <Button type="button" onClick={() => void refreshPlanner()} className="bg-[var(--sn-accent)] text-white hover:bg-[#8f7fff]">
            Retry
          </Button>
        </div>
      </div>
    )
  }

  const exams = payload?.exams ?? []
  const todaysPlan = payload?.todaysPlan ?? []
  const todaysCardIdsByExamId = todaysPlan.reduce<Map<string, string[]>>((map, item) => {
    const existingCardIds = map.get(item.examId) ?? []
    const mergedCardIds = [...existingCardIds, ...item.cardIds]
    map.set(item.examId, Array.from(new Set(mergedCardIds)))
    return map
  }, new Map())
  const todaysCardIds = Array.from(new Set(todaysPlan.flatMap((item) => item.cardIds)))

  return (
    <div className="flex h-full min-w-0 w-full flex-col items-center overflow-y-auto px-4 py-8 sm:px-6" style={{ backgroundColor: "var(--bg-app)" }}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.28em]" style={{ color: "var(--text-tertiary)" }}>
              Planner
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
              Study Planner
            </h1>
          </div>
          <Button type="button" onClick={() => setIsDialogOpen(true)} className="bg-[var(--sn-accent)] text-white hover:bg-[#8f7fff]">
            + New exam
          </Button>
        </div>

        {loadError ? (
          <div className="rounded-2xl border px-4 py-3" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                Could not refresh planner data. Showing the last successful snapshot.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void refreshPlanner()}
                className="border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                Retry
              </Button>
            </div>
            <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              {loadError}
            </p>
          </div>
        ) : null}

        {actionError ? (
          <div className="rounded-2xl border px-4 py-3" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>
              {actionError}
            </p>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="grid gap-4 md:grid-cols-2">
            {exams.length === 0 ? (
              <div className="rounded-[24px] border p-6" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
                <p className="text-base font-medium" style={{ color: "var(--text-primary)" }}>
                  No exams yet
                </p>
                <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                  Add your first exam, link a few decks, and StackNote will generate the review calendar.
                </p>
              </div>
            ) : (
              exams.map((exam) => {
                const examTodaysCardIds = todaysCardIdsByExamId.get(exam.id) ?? []

                return (
                  <ExamCard
                    key={exam.id}
                    title={exam.title}
                    subject={exam.subject}
                    examDate={exam.examDate}
                    daysUntil={daysUntil(exam.examDate)}
                    deckCount={exam.deckIds.length}
                    cardCount={exam.deckIds.reduce((sum, deckId) => sum + (cardCountByDeckId.get(deckId) ?? 0), 0)}
                    onStudyToday={() => void startCombinedSession(examTodaysCardIds)}
                    onDeletePlan={() => setPendingDeletePlan({ examId: exam.id, title: exam.title })}
                    isStudyTodayDisabled={examTodaysCardIds.length === 0}
                  />
                )
              })
            )}
          </div>

          <TodaysPlan items={todaysPlan} onStart={() => void startCombinedSession(todaysCardIds)} />
        </div>
      </div>

      <NewExamDialog open={isDialogOpen} decks={payload?.decks ?? []} onClose={() => setIsDialogOpen(false)} onCreate={handleCreateExam} />

      <Dialog
        open={Boolean(pendingDeletePlan)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !isDeletingPlan) {
            setPendingDeletePlan(null)
          }
        }}>
        <DialogContent centered className="max-w-md border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)]" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete evaluation plan?</DialogTitle>
            <DialogDescription className="text-[var(--text-secondary)]">
              This removes {pendingDeletePlan?.title ?? "this exam"} from your planner and clears its generated study schedule.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-[var(--border-default)] bg-[var(--bg-sidebar)]">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingDeletePlan(null)}
              disabled={isDeletingPlan}
              className="border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeletingPlan}
              onClick={() => {
                if (!pendingDeletePlan) {
                  return
                }

                void handleDeletePlan(pendingDeletePlan.examId)
              }}>
              {isDeletingPlan ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </span>
              ) : (
                "Delete plan"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeStudySession ? (
        <StudySession
          open
          sessionId={activeStudySession.sessionId}
          title={activeStudySession.title}
          cards={activeStudySession.cards.map((card) => ({
            ...card,
            dueDate: new Date(card.dueDate),
          }))}
          onClose={() => {
            setActiveStudySession(null)
            void refreshPlanner()
          }}
        />
      ) : null}
    </div>
  )
}
