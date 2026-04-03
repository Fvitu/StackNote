"use client"

import { useEffect, useState } from "react"
import { ArrowDown, Pause, Play, RotateCcw, Settings2, SkipForward, TimerReset } from "lucide-react"

import { SoundPlayer } from "@/components/pomodoro/SoundPlayer"
import type { PomodoroSessionState, PomodoroSettings } from "@/hooks/usePomodoro"
import type { AmbientSoundId } from "@/lib/sounds"

interface PomodoroTimerProps {
  session: PomodoroSessionState
  settings: PomodoroSettings
  accentColor: string
  accentTrackColor: string
  notificationPermission: NotificationPermission | "unsupported"
  activeSounds: Set<AmbientSoundId>
  unavailableSounds: Set<AmbientSoundId>
  volume: number
  onToggleTimer: () => void
  onReset: () => void
  onSkip: () => void
  onOpenSettings: () => void
  onCloseSettings: () => void
  onSaveSettings: (nextSettings: PomodoroSettings) => void
  onRequestNotifications: () => void
  onToggleSound: (soundId: AmbientSoundId) => void
  onVolumeChange: (volume: number) => void
  onCollapse: () => void
}

function formatRemaining(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
}

export function PomodoroTimer({
  session,
  settings,
  accentColor,
  accentTrackColor,
  notificationPermission,
  activeSounds,
  unavailableSounds,
  volume,
  onToggleTimer,
  onReset,
  onSkip,
  onOpenSettings,
  onCloseSettings,
  onSaveSettings,
  onRequestNotifications,
  onToggleSound,
  onVolumeChange,
  onCollapse,
}: PomodoroTimerProps) {
  const progress = session.totalSeconds > 0 ? session.remainingSeconds / session.totalSeconds : 0
  const radius = 56
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - progress)

  if (session.isSettingsOpen) {
    return <PomodoroSettingsPanel settings={settings} onCancel={onCloseSettings} onSave={onSaveSettings} />
  }

  return (
    <div className="rounded-[24px] border px-5 py-4 shadow-[0_24px_60px_rgba(0,0,0,0.35)]" style={{ backgroundColor: "rgba(10,10,10,0.94)", borderColor: `${accentColor}40`, backdropFilter: "blur(14px)" }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Pomodoro
          </p>
          <p className="mt-0.5 text-xs capitalize" style={{ color: accentColor }}>
            {session.type === "focus" ? "Focus" : session.type === "shortBreak" ? "Short break" : "Long break"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onCollapse} className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-[rgba(255,255,255,0.08)]" aria-label="Close Pomodoro">
            <ArrowDown className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
          </button>
          <button type="button" onClick={onOpenSettings} className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-[rgba(255,255,255,0.08)]" aria-label="Pomodoro settings">
            <Settings2 className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
          </button>
        </div>
      </div>

      <div className="mt-4 flex justify-center">
        <div className="relative flex h-[150px] w-[150px] items-center justify-center">
          <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
            <circle cx="66" cy="66" r={radius} fill="none" stroke={accentTrackColor} strokeWidth="6" />
            <circle
              cx="66"
              cy="66"
              r={radius}
              fill="none"
              stroke={accentColor}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 66 66)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[1.9rem] font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
              {formatRemaining(session.remainingSeconds)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button type="button" onClick={onToggleTimer} className="inline-flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors" style={{ backgroundColor: "var(--accent-muted)", color: accentColor }}>
          {session.isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {session.isRunning ? "Pause" : "Start"}
        </button>
        <button type="button" onClick={onReset} className="inline-flex items-center justify-center gap-1 rounded-xl border px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-hover)]" style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}>
          <RotateCcw className="h-4 w-4" />
          Reset
        </button>
        <button type="button" onClick={onSkip} className="inline-flex items-center justify-center gap-1 rounded-xl border px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-hover)]" style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}>
          <SkipForward className="h-4 w-4" />
          Skip
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Focus · {(session.completedPomodoros % session.cycleLength) + 1}/{session.cycleLength}
        </p>
        <div className="flex items-center gap-1 text-sm" style={{ color: accentColor }}>
          {Array.from({ length: session.cycleLength }).map((_, index) => (
            <span key={index}>{index < session.completedPomodoros ? "●" : "○"}</span>
          ))}
        </div>
      </div>

      {notificationPermission === "default" ? (
        <button type="button" onClick={onRequestNotifications} className="mt-3 text-xs underline underline-offset-4" style={{ color: "var(--text-secondary)" }}>
          Enable notifications
        </button>
      ) : null}

      <SoundPlayer
        activeSounds={activeSounds}
        unavailableSounds={unavailableSounds}
        volume={volume}
        onToggleSound={onToggleSound}
        onVolumeChange={onVolumeChange}
      />
    </div>
  )
}

function PomodoroSettingsPanel({
  settings,
  onCancel,
  onSave,
}: {
  settings: PomodoroSettings
  onCancel: () => void
  onSave: (nextSettings: PomodoroSettings) => void
}) {
  const [draft, setDraft] = useState(settings)

  useEffect(() => {
    setDraft(settings)
  }, [settings])

  return (
    <div className="rounded-[24px] border px-5 py-4 shadow-[0_24px_60px_rgba(0,0,0,0.35)]" style={{ backgroundColor: "rgba(10,10,10,0.94)", borderColor: "var(--border-default)", backdropFilter: "blur(14px)" }}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Timer settings
        </p>
        <button type="button" onClick={onCancel} className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Back
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {([
          ["focusDuration", "Focus"],
          ["shortBreak", "Short break"],
          ["longBreak", "Long break"],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-center justify-between gap-3 text-sm">
            <span style={{ color: "var(--text-secondary)" }}>{label}</span>
            <input
              type="number"
              min={1}
              max={90}
              value={draft[key]}
              onChange={(event) =>
                setDraft((previousDraft) => ({
                  ...previousDraft,
                  [key]: Number(event.target.value),
                }))
              }
              className="h-9 w-20 rounded-lg border bg-[var(--bg-surface)] px-2 text-right outline-none"
              style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
            />
          </label>
        ))}

        <label className="flex items-center justify-between gap-3 text-sm">
          <span style={{ color: "var(--text-secondary)" }}>Auto-start breaks</span>
          <input type="checkbox" checked={draft.autoStartBreaks} onChange={(event) => setDraft((previousDraft) => ({ ...previousDraft, autoStartBreaks: event.target.checked }))} />
        </label>

        <label className="flex items-center justify-between gap-3 text-sm">
          <span style={{ color: "var(--text-secondary)" }}>Auto-start pomodoros</span>
          <input type="checkbox" checked={draft.autoStartPomodoros} onChange={(event) => setDraft((previousDraft) => ({ ...previousDraft, autoStartPomodoros: event.target.checked }))} />
        </label>
      </div>

      <button type="button" onClick={() => onSave(draft)} className="mt-4 w-full rounded-xl px-3 py-2 text-sm font-medium text-white" style={{ backgroundColor: "var(--sn-accent)" }}>
        Save
      </button>
    </div>
  )
}
