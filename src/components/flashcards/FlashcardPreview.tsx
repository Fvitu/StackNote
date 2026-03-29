"use client"

import { useState, useEffect, useCallback } from "react"
import { X, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react"
import { MarkdownContent } from "@/components/ai/MarkdownContent"

interface FlashcardData {
  id: string
  front: string
  back: string
}

interface FlashcardPreviewProps {
  deckId: string
  title: string
  cards: FlashcardData[]
  onClose: () => void
}

export function FlashcardPreview({ deckId, title, cards, onClose }: FlashcardPreviewProps) {
  void deckId
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)

  const currentCard = cards[currentIndex]
  const hasNext = currentIndex < cards.length - 1
  const hasPrev = currentIndex > 0

  const goNext = useCallback(() => {
    if (hasNext) {
      setCurrentIndex((i) => i + 1)
      setIsFlipped(false)
    }
  }, [hasNext])

  const goPrev = useCallback(() => {
    if (hasPrev) {
      setCurrentIndex((i) => i - 1)
      setIsFlipped(false)
    }
  }, [hasPrev])

  const flip = useCallback(() => {
    setIsFlipped((f) => !f)
  }, [])

  const reset = useCallback(() => {
    setCurrentIndex(0)
    setIsFlipped(false)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault()
        goNext()
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault()
        goPrev()
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault()
        flip()
      } else if (e.key === "Escape") {
        onClose()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [flip, goNext, goPrev, onClose])

  if (!currentCard) {
    return null
  }

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 flex w-96 flex-col border-l shadow-2xl"
      style={{
        backgroundColor: "var(--bg-sidebar)",
        borderColor: "var(--border-default)",
      }}
    >
      {/* Header */}
      <div
        className="flex h-12 shrink-0 items-center justify-between border-b px-4"
        style={{ borderColor: "var(--border-default)" }}
      >
        <div className="min-w-0 flex-1">
          <h3
            className="truncate text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </h3>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {cards.length} cards
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1.5 transition-colors hover:bg-[#1a1a1a]"
        >
          <X className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
        </button>
      </div>

      {/* Card counter */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Card {currentIndex + 1} of {cards.length}
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 text-xs transition-colors hover:opacity-80"
          style={{ color: "var(--text-tertiary)" }}
        >
          <RotateCcw className="h-3 w-3" />
          Restart
        </button>
      </div>

      {/* Card */}
      <div className="flex-1 px-4 pb-4">
        <div
          className="perspective-1000 relative h-full cursor-pointer"
          onClick={flip}
        >
          <div
            className={`preserve-3d absolute inset-0 transition-transform duration-500 ${
              isFlipped ? "rotate-y-180" : ""
            }`}
          >
            {/* Front */}
            <div
              className="backface-hidden absolute inset-0 flex flex-col rounded-xl border p-6"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-default)",
              }}
            >
              <span
                className="mb-2 text-xs font-medium uppercase tracking-wider"
                style={{ color: "var(--text-tertiary)" }}
              >
                Question
              </span>
              <div
                className="flex flex-1 items-center justify-center text-center text-lg"
                style={{ color: "var(--text-primary)" }}
              >
                <MarkdownContent content={currentCard.front} className="w-full text-center" />
              </div>
              <p
                className="mt-4 text-center text-xs"
                style={{ color: "var(--text-tertiary)" }}
              >
                Click or press Space to reveal
              </p>
            </div>

            {/* Back */}
            <div
              className="backface-hidden rotate-y-180 absolute inset-0 flex flex-col rounded-xl border p-6"
              style={{
                backgroundColor: "var(--bg-active)",
                borderColor: "var(--sn-accent)",
              }}
            >
              <span
                className="mb-2 text-xs font-medium uppercase tracking-wider"
                style={{ color: "var(--sn-accent)" }}
              >
                Answer
              </span>
              <div
                className="flex flex-1 items-center justify-center text-center"
                style={{ color: "var(--text-primary)" }}
              >
                <MarkdownContent content={currentCard.back} className="w-full text-center" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div
        className="flex items-center justify-between border-t px-4 py-3"
        style={{ borderColor: "var(--border-default)" }}
      >
        <button
          onClick={goPrev}
          disabled={!hasPrev}
          className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors disabled:opacity-30"
          style={{ color: "var(--text-secondary)" }}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>
        <button
          onClick={goNext}
          disabled={!hasNext}
          className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors disabled:opacity-30"
          style={{ color: "var(--text-secondary)" }}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <style jsx>{`
        .perspective-1000 {
          perspective: 1000px;
        }

        .preserve-3d {
          transform-style: preserve-3d;
        }

        .backface-hidden {
          backface-visibility: hidden;
        }

        .rotate-y-180 {
          transform: rotateY(180deg);
        }
      `}</style>
    </div>
  )
}
