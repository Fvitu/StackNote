"use client"

import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface DeckOption {
  id: string
  title: string
  cardCount: number
}

interface NewExamDialogProps {
  open: boolean
  decks: DeckOption[]
  onClose: () => void
  onCreate: (payload: {
    title: string
    subject?: string
    examDate: string
    deckIds: string[]
    dailyStudyMinutes: number
  }) => Promise<void>
}

export function NewExamDialog({ open, decks, onClose, onCreate }: NewExamDialogProps) {
  const [title, setTitle] = useState("")
  const [subject, setSubject] = useState("")
  const [examDate, setExamDate] = useState("")
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([])
  const [dailyStudyMinutes, setDailyStudyMinutes] = useState(20)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const minExamDate = useMemo(() => new Date().toISOString().slice(0, 10), [])

  useEffect(() => {
    if (!open) {
      return
    }

    setTitle("")
    setSubject("")
    setExamDate("")
    setSelectedDeckIds([])
    setDailyStudyMinutes(20)
    setIsSubmitting(false)
    setSubmitError(null)
  }, [open])

  const canSubmit = useMemo(() => title.trim().length > 0 && examDate && selectedDeckIds.length > 0, [examDate, selectedDeckIds, title])

  async function handleSubmit() {
    if (!canSubmit || isSubmitting) {
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      await onCreate({
        title: title.trim(),
        subject: subject.trim() || undefined,
        examDate,
        deckIds: selectedDeckIds,
        dailyStudyMinutes,
      })
      onClose()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to create exam")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : null)}>
      <DialogContent className="!top-1/2 !max-w-2xl !-translate-y-1/2 border-[var(--border-default)] bg-[var(--bg-sidebar)] p-0 text-[var(--text-primary)]">
        <DialogHeader className="border-b px-6 py-5" style={{ borderColor: "var(--border-default)" }}>
          <DialogTitle>New exam</DialogTitle>
          <DialogDescription className="text-[var(--text-secondary)]">
            Link flashcard decks, pick the exam date, and let StackNote build the day-by-day review plan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span style={{ color: "var(--text-secondary)" }}>Exam title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="h-11 w-full rounded-xl border bg-[var(--bg-surface)] px-3 outline-none"
                style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
                placeholder="Physics Final"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span style={{ color: "var(--text-secondary)" }}>Subject</span>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="h-11 w-full rounded-xl border bg-[var(--bg-surface)] px-3 outline-none"
                style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
                placeholder="Mechanics"
              />
            </label>
          </div>

          <label className="space-y-2 text-sm">
            <span style={{ color: "var(--text-secondary)" }}>Exam date</span>
            <input
              type="date"
              value={examDate}
              onChange={(event) => setExamDate(event.target.value)}
              min={minExamDate}
              className="h-11 w-full rounded-xl border bg-[var(--bg-surface)] px-3 outline-none"
              style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
            />
          </label>

          <div className="space-y-2 text-sm">
            <p style={{ color: "var(--text-secondary)" }}>Linked decks</p>
            <div className="grid gap-2 md:grid-cols-2">
              {decks.map((deck) => {
                const isSelected = selectedDeckIds.includes(deck.id)
                return (
                  <button
                    key={deck.id}
                    type="button"
                    onClick={() =>
                      setSelectedDeckIds((previousIds) =>
                        previousIds.includes(deck.id)
                          ? previousIds.filter((id) => id !== deck.id)
                          : [...previousIds, deck.id],
                      )
                    }
                    className="rounded-2xl border px-4 py-3 text-left transition-colors"
                    style={{
                      borderColor: isSelected ? "var(--sn-accent)" : "var(--border-default)",
                      backgroundColor: isSelected ? "var(--accent-muted)" : "var(--bg-surface)",
                    }}>
                    <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                      {deck.title}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                      {deck.cardCount} cards
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          {submitError ? (
            <p className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }}>
              {submitError}
            </p>
          ) : null}

          <div className="space-y-3 rounded-2xl border p-4" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Daily study goal
                </p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  Balance review volume with the time you can realistically sustain.
                </p>
              </div>
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {dailyStudyMinutes} min
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={60}
              step={5}
              value={dailyStudyMinutes}
              onChange={(event) => setDailyStudyMinutes(Number(event.target.value))}
              className="w-full"
              style={{ accentColor: "var(--sn-accent)" }}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || isSubmitting} className="bg-[var(--sn-accent)] text-white hover:bg-[#8f7fff]">
              {isSubmitting ? "Creating..." : "Create exam"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
