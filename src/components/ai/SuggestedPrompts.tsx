"use client"

import { Sparkles, FileText, HelpCircle, BookOpen } from "lucide-react"

interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void
  noteTitle?: string
}

const PROMPTS = [
  {
    icon: FileText,
    label: "Summarize this note",
    prompt: "Please summarize the key points of this note in bullet points.",
  },
  {
    icon: HelpCircle,
    label: "Explain key concepts",
    prompt: "Explain the main concepts in this note in simple terms.",
  },
  {
    icon: BookOpen,
    label: "Generate study questions",
    prompt: "Generate 5 study questions based on this note to test my understanding.",
  },
  {
    icon: Sparkles,
    label: "What should I review?",
    prompt: "Based on this note, what are the most important things I should review?",
  },
]

export function SuggestedPrompts({ onSelect, noteTitle }: SuggestedPromptsProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--accent-muted)" }}
      >
        <Sparkles className="h-6 w-6" style={{ color: "var(--sn-accent)" }} />
      </div>

      <h3
        className="mt-4 text-center text-sm font-medium"
        style={{ color: "var(--text-primary)" }}
      >
        AI Assistant
      </h3>

      <p
        className="mt-1 text-center text-xs"
        style={{ color: "var(--text-tertiary)" }}
      >
        {noteTitle
          ? `Ask questions about "${noteTitle}"`
          : "Ask questions or get help with your notes"}
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {PROMPTS.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.label}
              onClick={() => onSelect(item.prompt)}
              className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors hover:border-[var(--sn-accent)]"
              style={{
                borderColor: "var(--border-default)",
                color: "var(--text-secondary)",
              }}
            >
              <Icon className="h-3 w-3" />
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
