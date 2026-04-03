"use client"

import { Pause, Play } from "lucide-react"

interface CollapsedPillProps {
  remainingLabel: string
  progress: number
  accentColor: string
  isRunning: boolean
  onExpand: () => void
  onToggle: () => void
}

export function CollapsedPill({
  remainingLabel,
  progress,
  accentColor,
  isRunning,
  onExpand,
  onToggle,
}: CollapsedPillProps) {
  const radius = 12
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - progress)

  const handleExpandKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onExpand()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onExpand}
      onKeyDown={handleExpandKeyDown}
      className="flex h-11 w-[140px] items-center gap-3 rounded-full border px-3 text-sm shadow-[0_12px_30px_rgba(0,0,0,0.35)] transition-transform duration-200 hover:-translate-y-0.5"
      aria-label="Expand Pomodoro timer"
      style={{
        backgroundColor: "rgba(10, 10, 10, 0.92)",
        backdropFilter: "blur(8px)",
        borderColor: "rgba(124, 106, 255, 0.3)",
      }}>
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r={radius} fill="none" stroke="rgba(124,106,255,0.16)" strokeWidth="3" />
        <circle
          cx="16"
          cy="16"
          r={radius}
          fill="none"
          stroke={accentColor}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 16 16)"
        />
      </svg>
      <span className="flex-1 text-left font-medium" style={{ color: "var(--text-primary)" }}>
        {remainingLabel}
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onToggle()
        }}
        className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-[rgba(255,255,255,0.08)]"
        aria-label={isRunning ? "Pause timer" : "Start timer"}>
        {isRunning ? <Pause className="h-3.5 w-3.5" style={{ color: "var(--text-primary)" }} /> : <Play className="h-3.5 w-3.5" style={{ color: "var(--text-primary)" }} />}
      </button>
    </div>
  )
}
