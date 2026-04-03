"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { CollapsedPill } from "@/components/pomodoro/CollapsedPill"
import { PomodoroTimer } from "@/components/pomodoro/PomodoroTimer"
import { usePomodoro, type PomodoroSessionType } from "@/hooks/usePomodoro"
import { AmbientSoundEngine, type AmbientSoundId } from "@/lib/sounds"

const SOUND_STORAGE_KEY = "stacknote_pomodoro_sounds"

const SESSION_COLORS: Record<PomodoroSessionType, string> = {
  focus: "#7c6aff",
  shortBreak: "#10b981",
  longBreak: "#3b82f6",
}

function formatRemaining(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
}

function readStoredSounds() {
  if (typeof window === "undefined") {
    return {
      activeSounds: [] as AmbientSoundId[],
      volume: 60,
    }
  }

  const raw = window.localStorage.getItem(SOUND_STORAGE_KEY)
  if (!raw) {
    return {
      activeSounds: [] as AmbientSoundId[],
      volume: 60,
    }
  }

  try {
    const parsed = JSON.parse(raw) as { activeSounds?: AmbientSoundId[]; volume?: number }
    return {
      activeSounds: Array.isArray(parsed.activeSounds) ? parsed.activeSounds : [],
      volume: typeof parsed.volume === "number" ? parsed.volume : 60,
    }
  } catch {
    return {
      activeSounds: [] as AmbientSoundId[],
      volume: 60,
    }
  }
}

function playCompletionTone() {
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) {
      return
    }

    const context = new AudioContextCtor()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = "sine"
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.55)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.58)
    oscillator.onended = () => {
      void context.close()
    }
  } catch {
    // Ignore best-effort sound failures.
  }
}

interface PomodoroWidgetProps {
  sidebarOffset: number
}

export function PomodoroWidget({ sidebarOffset }: PomodoroWidgetProps) {
  const [flash, setFlash] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  )
  const soundEngineRef = useRef<AmbientSoundEngine | null>(null)
  const initialSoundState = useMemo(() => readStoredSounds(), [])
  const [activeSounds, setActiveSounds] = useState<Set<AmbientSoundId>>(() => new Set(initialSoundState.activeSounds))
  const [unavailableSounds, setUnavailableSounds] = useState<Set<AmbientSoundId>>(new Set())
  const [volume, setVolume] = useState(initialSoundState.volume)

  const { settings, sessionState, setCollapsed, setSettingsOpen, saveSettings, toggle, reset, skip } = usePomodoro((sessionType) => {
    playCompletionTone()
    setFlash(true)
    window.setTimeout(() => setFlash(false), 600)

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      void new Notification(`StackNote ${sessionType === "focus" ? "focus" : "break"} complete`, {
        body: sessionType === "focus" ? "Time for a break." : "Ready to get back into focus?",
      })
    }
  })

  useEffect(() => {
    soundEngineRef.current = new AmbientSoundEngine()

    return () => {
      soundEngineRef.current?.destroy()
      soundEngineRef.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    window.localStorage.setItem(
      SOUND_STORAGE_KEY,
      JSON.stringify({
        activeSounds: Array.from(activeSounds),
        volume,
      }),
    )
  }, [activeSounds, volume])

  useEffect(() => {
    const engine = soundEngineRef.current
    if (!engine) {
      return
    }

    activeSounds.forEach((soundId) => {
      engine.setVolume(soundId, volume / 100)
    })
  }, [activeSounds, volume])

  const handleToggleSound = async (soundId: AmbientSoundId) => {
    const engine = soundEngineRef.current
    if (!engine) {
      return
    }

    if (activeSounds.has(soundId)) {
      engine.stop(soundId)
      setActiveSounds((previousSounds) => {
        const nextSounds = new Set(previousSounds)
        nextSounds.delete(soundId)
        return nextSounds
      })
      return
    }

    const didPlay = await engine.play(soundId)
    if (!didPlay) {
      setUnavailableSounds((previousSounds) => new Set(previousSounds).add(soundId))
      return
    }

    engine.setVolume(soundId, volume / 100)
    setActiveSounds((previousSounds) => new Set(previousSounds).add(soundId))
  }

  const handleRequestNotifications = async () => {
    if (typeof Notification === "undefined") {
      setNotificationPermission("unsupported")
      return
    }

    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
  }

  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (sessionState.isCollapsed) return

    const handleClickOutside = (event: MouseEvent) => {
      // Don't collapse if we click inside a notification or alert that was rendered out of tree, though Pomodoro uses mostly in-widget UI.
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setCollapsed(true)
      }
    }

    const timer = setTimeout(() => {
      window.addEventListener("mousedown", handleClickOutside)
    }, 100)

    return () => {
      clearTimeout(timer)
      window.removeEventListener("mousedown", handleClickOutside)
    }
  }, [sessionState.isCollapsed, setCollapsed])

  if (typeof window === "undefined") {
    return null
  }

  const accentColor = SESSION_COLORS[sessionState.type]
  const accentTrackColor = `${accentColor}26`
  const progress = sessionState.totalSeconds > 0 ? sessionState.remainingSeconds / sessionState.totalSeconds : 0

  return createPortal(
    <div
      ref={containerRef}
      className="fixed bottom-6 z-[5] w-[300px]"
      style={{
        left: `${sidebarOffset}px`,
        maxWidth: `calc(100vw - ${sidebarOffset + 24}px)`,
        transition: "left 180ms cubic-bezier(0.22, 1, 0.36, 1), max-width 180ms cubic-bezier(0.22, 1, 0.36, 1)",
        willChange: "left, max-width",
      }}>
      <div
        className="overflow-hidden transition-[max-height,opacity,transform] duration-250"
        style={{
          maxHeight: sessionState.isCollapsed ? 0 : 600,
          opacity: sessionState.isCollapsed ? 0 : 1,
          transform: sessionState.isCollapsed ? "translateY(12px)" : "translateY(0)",
          pointerEvents: sessionState.isCollapsed ? "none" : "auto",
        }}>
        <div
          className="transition-colors duration-300"
          style={{
            boxShadow: flash ? `0 0 0 1px ${accentColor}, 0 0 28px ${accentColor}66` : undefined,
          }}>
          <PomodoroTimer
            session={sessionState}
            settings={settings}
            accentColor={accentColor}
            accentTrackColor={accentTrackColor}
            notificationPermission={notificationPermission}
            activeSounds={activeSounds}
            unavailableSounds={unavailableSounds}
            volume={volume}
            onToggleTimer={toggle}
            onReset={reset}
            onSkip={skip}
            onOpenSettings={() => setSettingsOpen(true)}
            onCloseSettings={() => setSettingsOpen(false)}
            onSaveSettings={saveSettings}
            onRequestNotifications={handleRequestNotifications}
            onToggleSound={handleToggleSound}
            onVolumeChange={setVolume}
            onCollapse={() => setCollapsed(true)}
          />
        </div>
      </div>

      <div
        className="transition-[opacity,transform] duration-250"
        style={{
          opacity: sessionState.isCollapsed ? 1 : 0,
          transform: sessionState.isCollapsed ? "translateY(0)" : "translateY(12px)",
          pointerEvents: sessionState.isCollapsed ? "auto" : "none",
          transitionDelay: sessionState.isCollapsed ? "150ms" : "0ms",
        }}>
        <CollapsedPill
          remainingLabel={formatRemaining(sessionState.remainingSeconds)}
          progress={progress}
          accentColor={accentColor}
          isRunning={sessionState.isRunning}
          onExpand={() => setCollapsed(false)}
          onToggle={toggle}
        />
      </div>
    </div>,
    document.body,
  )
}
